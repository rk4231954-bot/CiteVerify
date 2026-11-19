/**
 * Publication retrieval for a document's bibliography (references come from
 * citation detection). Retrieves METADATA only — never full text, and never
 * any judgement about claims.
 *
 * Linking rules:
 * - Reference.publicationId is set only for MATCHED results.
 * - AMBIGUOUS / NEEDS_REVIEW / NOT_FOUND keep the reference unlinked and store
 *   the candidates that were considered, so nothing is silently chosen.
 * - FAILED (providers unavailable) never removes an existing link; the error
 *   is recorded and the reference is retried on the next run.
 */
import { doiToUrl } from "@citeverify/citation-engine";
import {
  type Publication,
  parseAuthors,
  type Reference,
} from "@citeverify/database";
import {
  type RetrievalResult,
  type StoredCandidate,
  storedCandidateSchema,
  summarizeCandidate,
} from "@citeverify/publication-retriever";
import { PublicationMatchStatus } from "@citeverify/shared";
import { z } from "zod";
import { documentRepository } from "../repositories/document.repository.ts";
import { publicationRepository } from "../repositories/publication.repository.ts";
import { Errors } from "../utils/errors.ts";
import type {
  ListPublicationsQuery,
  RetrievePublicationsBody,
} from "../validators/publication.validator.ts";
import { toReferenceDto } from "./citation.service.ts";
import { getPublicationRetriever } from "./publication-providers.ts";

/** Upper bound per request; the response reports how many remain. */
export const MAX_REFERENCES_PER_RUN = 100;
const CONCURRENCY = 2;

const METADATA_NOTE =
  "Publication metadata only. An abstract or open-access URL does not mean the full text is available, and a retrieved publication says nothing yet about whether it supports any claim.";

const candidatesSchema = z.array(storedCandidateSchema);
function parseJson<T>(
  value: string | null,
  schema: z.ZodType<T>,
  fallback: T,
): T {
  if (!value) return fallback;
  try {
    const parsed = schema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}
const parseCandidates = (v: string | null): StoredCandidate[] =>
  parseJson(v, candidatesSchema, []);
const parseErrors = (v: string | null) =>
  parseJson(v, z.array(z.record(z.string(), z.unknown())), []);

export function toPublicationDto(row: Publication) {
  return {
    id: row.id,
    title: row.title,
    authors: parseAuthors(row.authors),
    year: row.year,
    doi: row.doi,
    doiUrl: row.doi ? doiToUrl(row.doi) : null,
    journal: row.journal,
    publisher: row.publisher,
    abstract: row.abstract,
    sourceUrl: row.sourceUrl,
    openAccess: row.openAccess,
    openAccessStatus: row.openAccessStatus,
    openAccessUrl: row.openAccessUrl,
    openAlexId: row.openAlexId,
    providers: row.provider ? row.provider.split(",") : [],
    retrievalStatus: row.retrievalStatus,
    retrievedAt: row.retrievedAt,
  };
}

function toRetrievalDto(row: Reference) {
  return {
    status: row.publicationMatchStatus,
    confidence: row.publicationMatchConfidence,
    method: row.publicationMatchMethod,
    retrievedAt: row.retrievedAt,
    errors: parseErrors(row.retrievalError),
  };
}

const needsRetrieval = (r: Reference) =>
  r.publicationId === null &&
  (r.publicationMatchStatus === null ||
    r.publicationMatchStatus === PublicationMatchStatus.FAILED);

async function requireDocument(userId: string, documentId: string) {
  const doc = await documentRepository.findStatusForUser(documentId, userId);
  if (!doc) throw Errors.notFound("Document");
  return doc;
}

async function save(ref: Reference, result: RetrievalResult, now: Date) {
  const errors = result.errors.length ? JSON.stringify(result.errors) : null;
  const candidates = JSON.stringify(
    result.candidates.slice(0, 5).map(summarizeCandidate),
  );

  if (result.status === PublicationMatchStatus.FAILED) {
    // Keep whatever was known before; only record the failure.
    await publicationRepository.updateReference(ref.id, {
      retrievalError: errors,
      ...(ref.publicationId
        ? {}
        : {
            publicationMatchStatus: result.status,
            publicationMatchConfidence: 0,
            publicationCandidates: candidates,
          }),
    });
    return { publicationId: ref.publicationId, created: false };
  }

  let publicationId: string | null = null;
  let created = false;
  if (result.status === PublicationMatchStatus.MATCHED && result.publication) {
    const saved = await publicationRepository.upsert(
      result.publication,
      result.publication.sources,
      now,
    );
    publicationId = saved.publication.id;
    created = saved.created;
  }
  await publicationRepository.updateReference(ref.id, {
    publicationId,
    publicationMatchStatus: result.status,
    publicationMatchConfidence: result.confidence,
    publicationMatchMethod: result.method,
    publicationCandidates: candidates,
    retrievalError: errors,
    retrievedAt: now,
  });
  return { publicationId, created };
}

export const publicationService = {
  async retrieve(
    userId: string,
    documentId: string,
    body: RetrievePublicationsBody,
  ) {
    const doc = await requireDocument(userId, documentId);
    const all = await publicationRepository.referencesForDocument(
      doc.id,
      body.referenceIds,
    );
    if (body.referenceIds) {
      const found = new Set(all.map((r) => r.id));
      const missing = body.referenceIds.filter((id) => !found.has(id));
      if (missing.length)
        throw Errors.notFound(`Reference ${missing.join(", ")}`);
    } else if (!all.length) {
      throw Errors.conflict(
        "Document has no references; run POST /api/documents/:id/detect-citations first",
      );
    }

    const pending = body.force ? all : all.filter(needsRetrieval);
    const batch = pending.slice(0, MAX_REFERENCES_PER_RUN);
    const retriever = getPublicationRetriever();
    const results = await retriever.retrieveMany(
      batch.map((r) => ({
        id: r.id,
        rawText: r.rawText,
        doi: r.doi,
        title: r.title,
        authors: parseAuthors(r.authors),
        year: r.year,
      })),
      { concurrency: CONCURRENCY },
    );

    const now = new Date();
    const byStatus: Record<string, number> = Object.fromEntries(
      Object.values(PublicationMatchStatus).map((s) => [s, 0]),
    );
    let publicationsCreated = 0;
    const items = [];
    // Sequential writes: deduplication by DOI stays consistent within the run.
    for (const [i, result] of results.entries()) {
      const ref = batch[i];
      if (!ref) continue;
      const saved = await save(ref, result, now);
      if (saved.created) publicationsCreated++;
      byStatus[result.status] = (byStatus[result.status] ?? 0) + 1;
      items.push({
        referenceId: ref.id,
        label: ref.label,
        status: result.status,
        confidence: result.confidence,
        method: result.method,
        publicationId: saved.publicationId,
        reason: result.reason,
        candidates: result.candidates.slice(0, 5).map(summarizeCandidate),
        errors: result.errors,
      });
    }

    return {
      documentId: doc.id,
      stats: {
        references: all.length,
        processed: batch.length,
        skipped: all.length - pending.length,
        remaining: pending.length - batch.length,
        publicationsCreated,
        byStatus,
      },
      providers: retriever.providers.map((p) => p.name),
      results: items,
      note: METADATA_NOTE,
    };
  },

  async listForDocument(
    userId: string,
    documentId: string,
    query: ListPublicationsQuery,
  ) {
    const doc = await requireDocument(userId, documentId);
    const rows = await publicationRepository.referencesWithPublications(
      doc.id,
      query.status,
    );
    const publications = new Map<string, ReturnType<typeof toPublicationDto>>();
    for (const r of rows)
      if (r.publication)
        publications.set(r.publication.id, toPublicationDto(r.publication));
    return {
      documentId: doc.id,
      references: rows.map((r) => ({
        reference: toReferenceDto(r),
        retrieval: toRetrievalDto(r),
        publication: r.publication ? toPublicationDto(r.publication) : null,
        candidates: parseCandidates(r.publicationCandidates),
      })),
      publications: [...publications.values()],
      total: rows.length,
      note: METADATA_NOTE,
    };
  },

  async get(userId: string, publicationId: string) {
    const row = await publicationRepository.findForUser(publicationId, userId);
    if (!row) throw Errors.notFound("Publication");
    const { references, ...publication } = row;
    return {
      publication: toPublicationDto(publication),
      references,
      note: METADATA_NOTE,
    };
  },

  async forReference(userId: string, referenceId: string) {
    const row = await publicationRepository.findReferenceForUser(
      referenceId,
      userId,
    );
    if (!row) throw Errors.notFound("Reference");
    return {
      referenceId: row.id,
      documentId: row.documentId,
      retrieval: toRetrievalDto(row),
      publication: row.publication ? toPublicationDto(row.publication) : null,
      candidates: parseCandidates(row.publicationCandidates),
      note: METADATA_NOTE,
    };
  },
};
