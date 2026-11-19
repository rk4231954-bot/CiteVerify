/**
 * Evidence extraction and claim → evidence candidate ranking.
 *
 * Evidence is stored per publication (shared by every user who cites it);
 * access is always checked through the user's own references/claims.
 * Relevance scores describe topical overlap only — no step here decides
 * whether a claim is supported or contradicted.
 */
import { doiToUrl } from "@citeverify/citation-engine";
import {
  claimFingerprint,
  normalizeClaimText,
} from "@citeverify/claim-extractor";
import type { Evidence, Publication } from "@citeverify/database";
import {
  EvidenceExtractionError,
  type EvidenceExtractionOutput,
  evidenceDetailsSchema,
  extractEvidence,
  type FullTextResult,
  type PublicationContent,
  rankEvidenceForClaim,
  storedRelevanceSchema,
} from "@citeverify/evidence-extractor";
import {
  EvidenceAvailability,
  type EvidenceType,
  evidenceTypeSchema,
  FullTextStatus,
  VerificationScope,
} from "@citeverify/shared";
import { claimRepository } from "../repositories/claim.repository.ts";
import {
  evidenceRepository,
  type NewEvidenceRow,
} from "../repositories/evidence.repository.ts";
import { publicationRepository } from "../repositories/publication.repository.ts";
import { Errors } from "../utils/errors.ts";
import type {
  ExtractEvidenceBody,
  FindEvidenceBody,
  ListEvidenceQuery,
} from "../validators/evidence.validator.ts";
import {
  getEvidenceAiProvider,
  getFullTextSource,
} from "./evidence-providers.ts";

/** Publications extracted on the fly by one find-evidence request. */
const MAX_EXTRACTIONS_PER_REQUEST = 10;
const EXTRACTED_METHODS = ["RULE_BASED", "AI"];
const RELEVANCE_METHOD = "LEXICAL";

export const RELEVANCE_NOTE =
  "Relevance scores measure topical overlap between the claim and each passage. They do not indicate whether the passage supports or contradicts the claim.";

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: string }).code === "P2002";

function parseJson<T>(
  value: string | null,
  schema: {
    safeParse(v: unknown): { success: true; data: T } | { success: false };
  },
): T | null {
  if (!value) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function toEvidenceDto(row: Evidence) {
  return {
    id: row.id,
    publicationId: row.publicationId,
    sourceText: row.sourceText,
    normalizedText: row.normalizedText,
    evidenceType: row.evidenceType,
    section: row.section,
    pageNumber: row.pageNumber,
    sourceUrl: row.sourceUrl,
    extractionMethod: row.extractionMethod,
    evidenceAvailability: row.evidenceAvailability,
    confidence: row.confidence,
    details: parseJson(row.details, evidenceDetailsSchema),
    position: row.position,
    createdAt: row.createdAt,
  };
}

const publicationSummary = (p: {
  id: string;
  title: string;
  year: number | null;
  doi: string | null;
  journal: string | null;
}) => ({
  id: p.id,
  title: p.title,
  year: p.year,
  doi: p.doi,
  doiUrl: p.doi ? doiToUrl(p.doi) : null,
  journal: p.journal,
});

/** Scope implied by what is stored: full text beats abstract beats nothing. */
function scopeOf(rows: { evidenceAvailability: string }[]) {
  if (
    rows.some((r) => r.evidenceAvailability === EvidenceAvailability.FULL_TEXT)
  )
    return VerificationScope.FULL;
  if (
    rows.some((r) => r.evidenceAvailability === EvidenceAvailability.ABSTRACT)
  )
    return VerificationScope.LIMITED;
  return VerificationScope.NONE;
}

const keyOf = (row: { sourceText: string; fingerprint: string | null }) =>
  row.fingerprint ?? claimFingerprint(normalizeClaimText(row.sourceText)); // legacy rows

const toRow = (
  e: EvidenceExtractionOutput["evidence"][number],
): NewEvidenceRow => ({
  id: e.id,
  publicationId: e.publicationId,
  sourceText: e.sourceText,
  normalizedText: e.normalizedText,
  evidenceType: e.evidenceType,
  evidenceAvailability: e.evidenceAvailability,
  section: e.section,
  pageNumber: e.pageNumber,
  sourceUrl: e.sourceUrl,
  extractionMethod: e.extractionMethod,
  confidence: e.confidence,
  details: JSON.stringify(e.details),
  position: e.position,
  fingerprint: e.fingerprint,
  createdAt: new Date(e.createdAt),
});

const notAttempted = (reason: string): FullTextResult => ({
  status: FullTextStatus.NOT_ATTEMPTED,
  sourceUrl: null,
  extraction: null,
  reason,
});

/** Extracts and stores evidence for one (already access-checked) publication. Also used by verification. */
export async function runExtraction(
  pub: Publication,
  body: Pick<ExtractEvidenceBody, "fullText" | "method" | "replace"> & {
    minConfidence?: number | undefined;
  },
) {
  const aiProvider = body.method === "AI" ? getEvidenceAiProvider() : null;
  if (body.method === "AI" && !aiProvider)
    throw Errors.aiProviderNotConfigured("evidence extraction");

  // Full text only when OpenAlex reports the work as open access with a PDF URL.
  const fullText = body.fullText
    ? await getFullTextSource()({
        openAccess: pub.openAccess,
        openAccessUrl: pub.openAccessUrl,
      })
    : notAttempted("full-text retrieval was not requested");

  const content: PublicationContent = {
    publicationId: pub.id,
    abstract: pub.abstract,
    abstractSourceUrl: pub.sourceUrl ?? (pub.doi ? doiToUrl(pub.doi) : null),
    fullText:
      fullText.status === FullTextStatus.AVAILABLE && fullText.extraction
        ? {
            paragraphs: fullText.extraction.paragraphs,
            sourceUrl: fullText.sourceUrl,
          }
        : null,
  };

  let output: EvidenceExtractionOutput;
  try {
    output = await extractEvidence(content, {
      method: body.method,
      aiProvider,
      ...(body.minConfidence === undefined
        ? {}
        : { minConfidence: body.minConfidence }),
    });
  } catch (error) {
    if (error instanceof EvidenceExtractionError) {
      if (error.code === "AI_PROVIDER_NOT_CONFIGURED")
        throw Errors.aiProviderNotConfigured("evidence extraction");
      throw Errors.aiProviderFailed(error.message);
    }
    throw error;
  }

  // Duplicates against stored evidence: the stored row is kept. With `replace`,
  // previously extracted rows are deleted in the same transaction first.
  const existing = await evidenceRepository.keysForPublication(pub.id);
  const kept = new Set(
    existing
      .filter(
        (r) =>
          !body.replace ||
          !EXTRACTED_METHODS.includes(r.extractionMethod ?? ""),
      )
      .map(keyOf),
  );
  const rows = output.evidence
    .map(toRow)
    .filter((r) => !kept.has(r.fingerprint));
  const duplicates = output.evidence.length - rows.length;

  let removed: number;
  try {
    removed = await evidenceRepository.replaceAndInsert(
      pub.id,
      body.replace ? EXTRACTED_METHODS : null,
      rows,
      {
        evidenceExtractedAt: new Date(),
        // A run without a full-text attempt keeps the previous attempt's status.
        ...(fullText.status === FullTextStatus.NOT_ATTEMPTED &&
        pub.fullTextStatus
          ? {}
          : { fullTextStatus: fullText.status }),
      },
    );
  } catch (error) {
    if (isUniqueViolation(error))
      throw Errors.conflict(
        "Evidence for this publication was saved by a concurrent request; retry",
      );
    throw error;
  }

  const stored = await evidenceRepository.listForPublication(pub.id);
  const warnings = [...output.warnings];
  if (body.fullText && fullText.status !== FullTextStatus.AVAILABLE)
    warnings.push(`Full text not used: ${fullText.reason}`);
  return {
    publicationId: pub.id,
    verificationScope: scopeOf(stored),
    fullText: {
      status: fullText.status,
      reason: fullText.reason,
      sourceUrl: fullText.sourceUrl,
    },
    extractionMethod: body.method,
    stats: output.stats,
    created: rows.length,
    duplicatesSkipped: duplicates,
    removed,
    evidence: rows
      .map((r) => {
        const e = stored.find((s) => s.id === r.id);
        return e ? toEvidenceDto(e) : null;
      })
      .filter((e) => e !== null),
    totalStored: stored.length,
    warnings,
  };
}

async function requirePublication(userId: string, publicationId: string) {
  const pub = await publicationRepository.findForUser(publicationId, userId);
  if (!pub) throw Errors.notFound("Publication");
  return pub;
}

async function requireClaim(userId: string, claimId: string) {
  const claim = await claimRepository.findForUser(claimId, userId);
  if (!claim) throw Errors.notFound("Claim");
  return claim;
}

function toLinkDto(
  link: Awaited<ReturnType<typeof evidenceRepository.linksForClaim>>[number],
) {
  const relevance = parseJson(link.matchedTerms, storedRelevanceSchema);
  return {
    rank: link.rank,
    relevanceScore: link.relevanceScore,
    relevanceLevel: relevance?.relevanceLevel ?? null,
    matchedTerms: relevance?.matchedTerms ?? [],
    matchedNumbers: relevance?.matchedNumbers ?? [],
    breakdown: relevance?.breakdown ?? null,
    method: link.method,
    linkedAt: link.createdAt,
    evidence: toEvidenceDto(link.evidence),
    publication: publicationSummary(link.evidence.publication),
  };
}

export const evidenceService = {
  async extract(
    userId: string,
    publicationId: string,
    body: ExtractEvidenceBody,
  ) {
    const pub = await requirePublication(userId, publicationId);
    return runExtraction(pub, body);
  },

  async listForPublication(
    userId: string,
    publicationId: string,
    query: ListEvidenceQuery,
  ) {
    const pub = await requirePublication(userId, publicationId);
    const all = await evidenceRepository.listForPublication(pub.id);
    const filtered = all.filter(
      (e) =>
        (!query.type || e.evidenceType === query.type) &&
        (!query.availability || e.evidenceAvailability === query.availability),
    );
    return {
      publication: {
        ...publicationSummary(pub),
        fullTextStatus: pub.fullTextStatus,
        evidenceExtractedAt: pub.evidenceExtractedAt,
      },
      verificationScope: scopeOf(all),
      total: filtered.length,
      evidence: filtered.map(toEvidenceDto),
    };
  },

  async listForClaim(userId: string, claimId: string) {
    const claim = await requireClaim(userId, claimId);
    const links = await evidenceRepository.linksForClaim(claim.id);
    return {
      claimId: claim.id,
      total: links.length,
      candidates: links.map(toLinkDto),
      note: RELEVANCE_NOTE,
    };
  },

  async findForClaim(userId: string, claimId: string, body: FindEvidenceBody) {
    const claim = await requireClaim(userId, claimId);
    const warnings: string[] = [];

    // CITED: claim → citation → confidently matched reference → matched publication.
    const referenceIds = [
      ...new Set(
        claim.citationLinks.flatMap((l) =>
          l.citation.referenceId ? [l.citation.referenceId] : [],
        ),
      ),
    ];
    const publicationIds =
      body.scope === "CITED"
        ? referenceIds.length
          ? await evidenceRepository.publicationIdsForReferences(
              claim.documentId,
              referenceIds,
            )
          : []
        : await evidenceRepository.publicationIdsForReferences(
            claim.documentId,
          );

    if (!publicationIds.length) {
      await evidenceRepository.replaceClaimLinks(claim.id, []);
      const reason =
        body.scope === "DOCUMENT"
          ? "No reference of this document is matched to a retrieved publication; run POST /api/documents/:id/retrieve-publications first"
          : !claim.citationLinks.length
            ? "The claim has no linked citations; use scope DOCUMENT to search every retrieved publication of the document"
            : !referenceIds.length
              ? "The claim's citations are not confidently matched to bibliography references"
              : "The cited references are not matched to retrieved publications; run POST /api/documents/:id/retrieve-publications first";
      return {
        claimId: claim.id,
        scope: body.scope,
        publications: [],
        total: 0,
        candidates: [],
        reason,
        warnings,
        note: RELEVANCE_NOTE,
      };
    }

    let publications =
      await evidenceRepository.publicationsByIds(publicationIds);
    if (body.extractMissing) {
      const missing = publications.filter((p) => !p.evidenceExtractedAt);
      if (missing.length > MAX_EXTRACTIONS_PER_REQUEST)
        warnings.push(
          `Evidence was extracted for ${MAX_EXTRACTIONS_PER_REQUEST} of ${missing.length} publications without evidence; repeat the request for the rest`,
        );
      for (const pub of missing.slice(0, MAX_EXTRACTIONS_PER_REQUEST)) {
        const result = await runExtraction(pub, {
          fullText: true,
          method: "RULE_BASED",
          replace: false,
        });
        for (const w of result.warnings) warnings.push(`${pub.title}: ${w}`);
      }
      publications = await evidenceRepository.publicationsByIds(publicationIds);
    }

    const evidence =
      await evidenceRepository.listForPublications(publicationIds);
    const ranked = rankEvidenceForClaim(
      { id: claim.id, text: claim.normalizedText ?? claim.originalText },
      evidence.map((e) => {
        const type = evidenceTypeSchema.safeParse(e.evidenceType);
        return {
          id: e.id,
          text: e.normalizedText ?? e.sourceText,
          evidenceType: type.success ? (type.data as EvidenceType) : null,
        };
      }),
      { topK: body.topK, minRelevance: body.minRelevance },
    );

    await evidenceRepository.replaceClaimLinks(
      claim.id,
      ranked.map((r) => ({
        claimId: claim.id,
        evidenceId: r.evidenceId,
        relevanceScore: r.relevanceScore,
        rank: r.rank,
        method: RELEVANCE_METHOD,
        matchedTerms: JSON.stringify(storedRelevanceSchema.parse(r)),
      })),
    );
    const links = await evidenceRepository.linksForClaim(claim.id);

    const byPublication = new Map<string, Evidence[]>();
    for (const e of evidence)
      byPublication.set(e.publicationId, [
        ...(byPublication.get(e.publicationId) ?? []),
        e,
      ]);
    if (!evidence.length)
      warnings.push(
        "The linked publications have no extractable evidence (no abstract or accessible full text)",
      );

    return {
      claimId: claim.id,
      scope: body.scope,
      publications: publications.map((p) => {
        const rows = byPublication.get(p.id) ?? [];
        return {
          ...publicationSummary(p),
          evidenceCount: rows.length,
          verificationScope: scopeOf(rows),
          fullTextStatus: p.fullTextStatus,
          evidenceExtractedAt: p.evidenceExtractedAt,
        };
      }),
      evidenceConsidered: evidence.length,
      total: links.length,
      candidates: links.map(toLinkDto),
      reason: links.length
        ? null
        : "No passage shares enough terms with the claim",
      warnings,
      note: RELEVANCE_NOTE,
    };
  },
};
