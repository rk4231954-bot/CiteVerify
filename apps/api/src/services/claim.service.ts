import {
  type Claim,
  ClaimExtractionError,
  claimFingerprint,
  extractClaims,
  normalizeClaimText,
} from "@citeverify/claim-extractor";
import type { ExtractedClaim } from "@citeverify/database";
import { claimRepository } from "../repositories/claim.repository.ts";
import { documentRepository } from "../repositories/document.repository.ts";
import { extractionRepository } from "../repositories/extraction.repository.ts";
import { Errors } from "../utils/errors.ts";
import type {
  ExtractClaimsBody,
  ListClaimsQuery,
} from "../validators/claim.validator.ts";
import { getAiProvider } from "./ai-provider.ts";
import { isUsableExtraction, readStoredResult } from "./extraction.service.ts";

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function toClaimDto(row: ExtractedClaim) {
  return {
    id: row.id,
    documentId: row.documentId,
    originalText: row.originalText,
    normalizedText: row.normalizedText,
    category: row.category,
    characteristics: parseJsonArray(row.characteristics),
    rationale: parseJsonArray(row.rationale),
    pageNumber: row.pageNumber,
    section: row.section,
    paragraphId: row.paragraphId,
    position: row.position,
    confidence: row.confidence,
    extractionMethod: row.extractionMethod,
    createdAt: row.createdAt,
  };
}

const keyOf = (row: { originalText: string; fingerprint: string | null }) =>
  row.fingerprint ?? claimFingerprint(normalizeClaimText(row.originalText)); // legacy rows

const toRow = (claim: Claim) => ({
  id: claim.id,
  documentId: claim.documentId,
  originalText: claim.originalText,
  normalizedText: claim.normalizedText,
  category: claim.category,
  characteristics: JSON.stringify(claim.characteristics),
  rationale: JSON.stringify(claim.rationale),
  extractionMethod: claim.extractionMethod,
  pageNumber: claim.pageNumber,
  section: claim.section,
  paragraphId: claim.paragraphId,
  position: claim.position,
  confidence: claim.confidence,
  fingerprint: claimFingerprint(claim.normalizedText),
  createdAt: new Date(claim.createdAt),
});

async function requireDocument(userId: string, documentId: string) {
  const doc = await documentRepository.findStatusForUser(documentId, userId);
  if (!doc) throw Errors.notFound("Document");
  return doc;
}

export const claimService = {
  async extract(userId: string, documentId: string, body: ExtractClaimsBody) {
    const doc = await requireDocument(userId, documentId);

    // Claims are always derived from the STORED extraction output, never the raw file.
    const record = await extractionRepository.findByDocumentId(doc.id);
    const result =
      record && isUsableExtraction(record.status)
        ? readStoredResult(record)
        : null;
    if (!result)
      throw Errors.conflict(
        "Document has no usable text extraction; run POST /api/documents/:id/extract first",
      );

    const aiProvider = body.method === "AI" ? getAiProvider() : null;
    if (body.method === "AI" && !aiProvider)
      throw Errors.aiProviderNotConfigured();

    let output: Awaited<ReturnType<typeof extractClaims>>;
    try {
      output = await extractClaims(
        { documentId: doc.id, extraction: result },
        {
          method: body.method,
          aiProvider: aiProvider ?? undefined,
          ...(body.minConfidence === undefined
            ? {}
            : { minConfidence: body.minConfidence }),
        },
      );
    } catch (error) {
      if (error instanceof ClaimExtractionError) {
        if (error.code === "AI_PROVIDER_NOT_CONFIGURED")
          throw Errors.aiProviderNotConfigured();
        throw Errors.aiProviderFailed(error.message);
      }
      throw error;
    }

    // Duplicate prevention against claims already stored for this document
    // (a unique (documentId, fingerprint) index is the database-level backstop).
    // With `replace`, this method's previous claims are deleted in the same
    // transaction, so only the remaining (other-method) claims count as duplicates.
    const existing = await claimRepository.findKeysForDocument(doc.id);
    const removeMethod = body.replace ? body.method : null;
    const kept = new Set(
      existing
        .filter((row) => row.extractionMethod !== removeMethod)
        .map(keyOf),
    );
    const rows = output.claims
      .map(toRow)
      .filter((row) => !kept.has(row.fingerprint));

    const removed = await claimRepository.replaceAndInsert(
      doc.id,
      removeMethod,
      rows,
    );
    const created = await claimRepository.findByIds(rows.map((r) => r.id));

    return {
      documentId: doc.id,
      method: body.method,
      created: created.length,
      skippedDuplicates: output.claims.length - rows.length,
      removed,
      stats: output.stats,
      warnings: output.warnings,
      claims: created.map(toClaimDto),
    };
  },

  async listForDocument(
    userId: string,
    documentId: string,
    query: ListClaimsQuery,
  ) {
    const doc = await requireDocument(userId, documentId);
    const { items, total } = await claimRepository.listForDocument(
      doc.id,
      query,
    );
    return {
      documentId: doc.id,
      claims: items.map(toClaimDto),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  async get(userId: string, claimId: string) {
    const row = await claimRepository.findForUser(claimId, userId);
    if (!row) throw Errors.notFound("Claim");
    return {
      ...toClaimDto(row),
      // Citations attached to this claim's text (not evidence of support).
      citations: row.citationLinks.map((link) => ({
        citationId: link.citation.id,
        citationText: link.citation.citationText,
        citationKey: link.citation.citationKey,
        linkStatus: link.status,
        linkConfidence: link.confidence,
        linkReason: link.reason,
        matchStatus: link.citation.matchStatus,
        matchConfidence: link.citation.matchConfidence,
        referenceId: link.citation.referenceId,
      })),
    };
  },

  async delete(userId: string, claimId: string) {
    if (!(await claimRepository.deleteForUser(claimId, userId)))
      throw Errors.notFound("Claim");
    return { id: claimId };
  },
};
