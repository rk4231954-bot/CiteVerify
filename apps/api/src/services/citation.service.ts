import {
  analyzeCitations,
  doiToUrl,
  type MatchCandidate,
  matchCandidateSchema,
} from "@citeverify/citation-engine";
import {
  parseAuthors,
  type Reference,
  serializeAuthors,
} from "@citeverify/database";
import { CitationType } from "@citeverify/shared";
import { z } from "zod";
import { citationRepository } from "../repositories/citation.repository.ts";
import { documentRepository } from "../repositories/document.repository.ts";
import { extractionRepository } from "../repositories/extraction.repository.ts";
import { Errors } from "../utils/errors.ts";
import type { ListCitationsQuery } from "../validators/citation.validator.ts";
import { isUsableExtraction, readStoredResult } from "./extraction.service.ts";

type CitationRow = NonNullable<
  Awaited<ReturnType<typeof citationRepository.findForUser>>
>;

const candidatesSchema = z.array(matchCandidateSchema);
function parseCandidates(value: string | null): MatchCandidate[] {
  if (!value) return [];
  try {
    const parsed = candidatesSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function toReferenceDto(
  row: Reference & { _count?: { citations: number } },
) {
  return {
    id: row.id,
    documentId: row.documentId,
    label: row.label,
    rawText: row.rawText,
    authors: parseAuthors(row.authors),
    title: row.title,
    year: row.year,
    yearSuffix: row.yearSuffix,
    venue: row.venue,
    doi: row.doi,
    doiUrl: row.doi ? doiToUrl(row.doi) : null,
    pageNumber: row.pageNumber,
    paragraphId: row.paragraphId,
    position: row.position,
    publicationId: row.publicationId,
    ...(row._count ? { citationCount: row._count.citations } : {}),
  };
}

export function toCitationDto(row: CitationRow) {
  return {
    id: row.id,
    documentId: row.documentId,
    citationText: row.citationText,
    citationKey: row.citationKey,
    citationType: row.citationType,
    pageNumber: row.pageNumber,
    section: row.section,
    paragraphId: row.paragraphId,
    charStart: row.charStart,
    charEnd: row.charEnd,
    position: row.position,
    matchStatus: row.matchStatus,
    matchConfidence: row.matchConfidence,
    referenceId: row.referenceId,
    reference: row.reference
      ? { ...row.reference, authors: parseAuthors(row.reference.authors) }
      : null,
    claims: row.claimLinks,
    createdAt: row.createdAt,
  };
}

async function requireDocument(userId: string, documentId: string) {
  const doc = await documentRepository.findStatusForUser(documentId, userId);
  if (!doc) throw Errors.notFound("Document");
  return doc;
}

export const citationService = {
  async detect(userId: string, documentId: string) {
    const doc = await requireDocument(userId, documentId);

    // Always work from the STORED extraction output, never the raw file.
    const record = await extractionRepository.findByDocumentId(doc.id);
    const extraction =
      record && isUsableExtraction(record.status)
        ? readStoredResult(record)
        : null;
    if (!extraction)
      throw Errors.conflict(
        "Document has no usable text extraction; run POST /api/documents/:id/extract first",
      );

    const claims = await citationRepository.claimsForDocument(doc.id);
    const analysis = analyzeCitations({
      documentId: doc.id,
      extraction,
      claims,
    });
    const matchById = new Map(analysis.matches.map((m) => [m.citationId, m]));
    // Publication-retrieval results survive re-detection for unchanged entries.
    const retrievalByFingerprint =
      await citationRepository.retrievalStateByFingerprint(doc.id);

    const { removedCitations, removedReferences } =
      await citationRepository.replaceDetection(doc.id, {
        references: analysis.references.map((r) => ({
          id: r.id,
          documentId: doc.id,
          rawText: r.rawText,
          label: r.label,
          title: r.title,
          authors: r.authors.length ? serializeAuthors(r.authors) : null,
          year: r.year,
          yearSuffix: r.yearSuffix,
          venue: r.venue,
          doi: r.doi,
          position: r.position,
          paragraphId: r.paragraphId,
          pageNumber: r.pageNumber,
          fingerprint: r.fingerprint,
          ...retrievalByFingerprint.get(r.fingerprint),
        })),
        citations: analysis.citations.map((c, position) => {
          const match = matchById.get(c.id);
          return {
            id: c.id,
            documentId: doc.id,
            citationText: c.citationText,
            citationType:
              c.format === "NUMERIC"
                ? CitationType.NUMERIC
                : CitationType.AUTHOR_YEAR,
            citationKey: c.citationKey,
            pageNumber: c.pageNumber,
            section: c.section,
            paragraphId: c.paragraphId,
            charStart: c.start,
            charEnd: c.end,
            position,
            referenceId: match?.referenceId ?? null, // only for MATCHED
            matchStatus: match?.status ?? null,
            matchConfidence: match?.confidence ?? null,
            matchCandidates: JSON.stringify(match?.candidates ?? []),
          };
        }),
        links: analysis.links.map((l) => ({
          claimId: l.claimId,
          citationId: l.citationId,
          status: l.status,
          confidence: l.confidence,
          reason: l.reason,
        })),
      });

    return {
      documentId: doc.id,
      stats: analysis.stats,
      replaced: { citations: removedCitations, references: removedReferences },
      warnings: analysis.warnings,
      claimMappings: analysis.claimMappings,
    };
  },

  async listForDocument(
    userId: string,
    documentId: string,
    query: ListCitationsQuery,
  ) {
    const doc = await requireDocument(userId, documentId);
    const { items, total } = await citationRepository.listForDocument(
      doc.id,
      query,
    );
    return {
      documentId: doc.id,
      citations: items.map(toCitationDto),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  async listReferences(userId: string, documentId: string) {
    const doc = await requireDocument(userId, documentId);
    const rows = await citationRepository.listReferences(doc.id);
    return {
      documentId: doc.id,
      references: rows.map(toReferenceDto),
      total: rows.length,
    };
  },

  async get(userId: string, citationId: string) {
    const row = await citationRepository.findForUser(citationId, userId);
    if (!row) throw Errors.notFound("Citation");
    return toCitationDto(row);
  },

  /** Match details: the chosen reference (if any) and every candidate that was considered. */
  async matches(userId: string, citationId: string) {
    const row = await citationRepository.findForUser(citationId, userId);
    if (!row) throw Errors.notFound("Citation");
    const candidates = parseCandidates(row.matchCandidates);
    const refs = await citationRepository.findReferences(
      row.documentId,
      candidates.map((c) => c.referenceId),
    );
    const refById = new Map(refs.map((r) => [r.id, r]));
    return {
      citationId: row.id,
      citationText: row.citationText,
      citationKey: row.citationKey,
      status: row.matchStatus,
      confidence: row.matchConfidence,
      referenceId: row.referenceId,
      candidates: candidates.flatMap((c) => {
        const ref = refById.get(c.referenceId);
        return ref
          ? [
              {
                score: c.score,
                reasons: c.reasons,
                chosen: c.referenceId === row.referenceId,
                reference: toReferenceDto(ref),
              },
            ]
          : [];
      }),
      note: "A match links the in-text marker to a bibliography entry; it does not mean the source supports any claim.",
    };
  },
};
