import { ClaimExtractionMethod } from "@citeverify/shared";
import { classifySentence } from "../classifiers/claim-classifier.ts";
import {
  claimFingerprint,
  normalizeClaimText,
} from "../normalizers/claim-normalizer.ts";
import { claimExtractionOptionsSchema } from "../schemas/claim.schema.ts";
import type {
  Claim,
  ClaimExtractionOptions,
  ClaimExtractionOutput,
  SourceParagraph,
} from "../types/claim.types.ts";
import { splitSentences } from "../utils/sentences.ts";

/** Sections whose text is never scientific claims. */
const SKIPPED_SECTIONS =
  /\b(?:acknowledge?ments?|references|bibliography|works cited|literature cited|funding|author contributions?|conflicts? of interest|competing interests?|declarations?|data availability|abbreviations|ethics (?:statement|approval)|supplementary (?:material|information))\b/i;

export function shouldSkipParagraph(paragraph: SourceParagraph): string | null {
  if (paragraph.section && SKIPPED_SECTIONS.test(paragraph.section))
    return `section "${paragraph.section}"`;
  return null;
}

/**
 * Deterministic, offline claim extraction. Needs no AI provider.
 * Claims keep the exact sentence text plus page, section, and paragraph id.
 */
export function extractClaimsRuleBased(
  documentId: string,
  paragraphs: readonly SourceParagraph[],
  options: ClaimExtractionOptions = {},
): ClaimExtractionOutput {
  const opts = claimExtractionOptionsSchema.parse(options);
  const claims: Claim[] = [];
  const seen = new Set<string>();
  const createdAt = new Date().toISOString();
  let sentencesAnalyzed = 0;
  let paragraphsSkipped = 0;
  let duplicatesRemoved = 0;

  for (const paragraph of [...paragraphs].sort((a, b) => a.order - b.order)) {
    if (shouldSkipParagraph(paragraph)) {
      paragraphsSkipped++;
      continue;
    }
    for (const sentence of splitSentences(paragraph.cleanedText)) {
      sentencesAnalyzed++;
      const result = classifySentence(sentence.text, paragraph.section, opts);
      if (!result.isClaim || !result.category) continue;

      const normalizedText = normalizeClaimText(sentence.text);
      const key = claimFingerprint(normalizedText);
      if (seen.has(key)) {
        duplicatesRemoved++;
        continue;
      }
      seen.add(key);

      claims.push({
        id: crypto.randomUUID(),
        documentId,
        originalText: sentence.text,
        normalizedText,
        category: result.category,
        characteristics: result.characteristics,
        pageNumber: paragraph.pageNumber,
        section: paragraph.section,
        paragraphId: paragraph.id,
        position: claims.length,
        confidence: result.confidence,
        rationale: result.rationale,
        extractionMethod: ClaimExtractionMethod.RULE_BASED,
        createdAt,
      });
    }
  }

  return {
    claims,
    stats: {
      paragraphsAnalyzed: paragraphs.length - paragraphsSkipped,
      paragraphsSkipped,
      sentencesAnalyzed,
      claimsFound: claims.length,
      duplicatesRemoved,
    },
    warnings: [],
  };
}
