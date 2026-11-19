import { ClaimExtractionMethod } from "@citeverify/shared";
import {
  claimFingerprint,
  normalizeClaimText,
} from "../normalizers/claim-normalizer.ts";
import { aiClaimCandidateSchema } from "../schemas/claim.schema.ts";
import type {
  Claim,
  ClaimAiProvider,
  ClaimExtractionOutput,
  SourceParagraph,
} from "../types/claim.types.ts";
import { roundConfidence } from "../utils/confidence.ts";
import { ClaimExtractionError } from "../utils/errors.ts";
import { shouldSkipParagraph } from "./rule-based-extractor.ts";

/**
 * AI-assisted extraction through a provider-independent interface.
 *
 * The provider only *proposes* claims. Each proposal is accepted only if it
 * passes schema validation, references a real paragraph, and its sentence is
 * a verbatim quote of that paragraph — so an AI can never introduce text (or
 * numbers) that isn't in the document. Accepted claims are tagged
 * extractionMethod = "AI" and their rationale names the provider.
 */
export async function extractClaimsWithAi(
  documentId: string,
  paragraphs: readonly SourceParagraph[],
  provider: ClaimAiProvider,
): Promise<ClaimExtractionOutput> {
  const eligible = paragraphs.filter((p) => !shouldSkipParagraph(p));
  const byId = new Map(eligible.map((p) => [p.id, p]));

  let candidates: unknown[];
  try {
    candidates = await provider.extractClaims({
      documentId,
      paragraphs: eligible,
    });
  } catch (error) {
    throw new ClaimExtractionError(
      "AI_PROVIDER_ERROR",
      `AI provider "${provider.name}" failed: ${(error as Error).message}`,
      {
        cause: error,
      },
    );
  }

  const warnings: string[] = [];
  const accepted: (Omit<Claim, "position"> & { sortKey: [number, number] })[] =
    [];
  const seen = new Set<string>();
  let duplicatesRemoved = 0;
  const createdAt = new Date().toISOString();

  for (const [i, raw] of candidates.entries()) {
    const parsed = aiClaimCandidateSchema.safeParse(raw);
    if (!parsed.success) {
      warnings.push(`AI candidate #${i + 1} rejected: invalid shape`);
      continue;
    }
    const candidate = parsed.data;
    const paragraph = byId.get(candidate.paragraphId);
    if (!paragraph) {
      warnings.push(
        `AI candidate #${i + 1} rejected: unknown paragraph "${candidate.paragraphId}"`,
      );
      continue;
    }
    const sentence = candidate.sentence.trim();
    const offset = paragraph.cleanedText.indexOf(sentence);
    if (offset === -1) {
      warnings.push(
        `AI candidate #${i + 1} rejected: not a verbatim quote of paragraph ${paragraph.id}`,
      );
      continue;
    }
    const normalizedText = normalizeClaimText(sentence);
    const key = claimFingerprint(normalizedText);
    if (seen.has(key)) {
      duplicatesRemoved++;
      continue;
    }
    seen.add(key);
    accepted.push({
      id: crypto.randomUUID(),
      documentId,
      originalText: sentence,
      normalizedText,
      category: candidate.category,
      characteristics: [...new Set(candidate.characteristics)],
      pageNumber: paragraph.pageNumber,
      section: paragraph.section,
      paragraphId: paragraph.id,
      confidence: roundConfidence(candidate.confidence),
      rationale: [`AI provider "${provider.name}": ${candidate.rationale}`],
      extractionMethod: ClaimExtractionMethod.AI,
      createdAt,
      sortKey: [paragraph.order, offset],
    });
  }

  const claims: Claim[] = accepted
    .sort((a, b) => a.sortKey[0] - b.sortKey[0] || a.sortKey[1] - b.sortKey[1])
    .map(({ sortKey: _s, ...claim }, position) => ({ ...claim, position }));

  return {
    claims,
    stats: {
      paragraphsAnalyzed: eligible.length,
      paragraphsSkipped: paragraphs.length - eligible.length,
      sentencesAnalyzed: candidates.length,
      claimsFound: claims.length,
      duplicatesRemoved,
    },
    warnings,
  };
}
