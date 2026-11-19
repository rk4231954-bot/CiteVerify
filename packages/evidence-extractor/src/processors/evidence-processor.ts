/**
 * Orchestrates evidence extraction for one publication.
 *
 * - Full-text passages (if legally accessible full text was supplied) come
 *   first, then the metadata abstract. The same sentence found in both is
 *   kept once, as FULL_TEXT — it genuinely appears in the full text.
 * - Abstract-only content gives verificationScope LIMITED; no content gives
 *   NONE with a warning. Missing content is never an error.
 */

import { stripMarkup } from "@citeverify/publication-retriever";
import {
  type EvidenceAvailability as Availability,
  EvidenceAvailability,
  EvidenceType,
  VerificationScope,
} from "@citeverify/shared";
import { abstractPassages } from "../extractors/abstract-extractor.ts";
import { extractEvidenceWithAi } from "../extractors/ai-extractor.ts";
import { fullTextPassages } from "../extractors/fulltext-extractor.ts";
import { extractEvidenceRuleBased } from "../extractors/rule-based-extractor.ts";
import type {
  EvidenceAiProvider,
  EvidenceExtractionOptions,
  EvidenceExtractionOutput,
  ExtractedEvidence,
  PublicationContent,
  SourcePassage,
} from "../types/evidence.types.ts";
import { EvidenceExtractionError } from "../utils/errors.ts";

export const DEFAULT_MIN_CONFIDENCE = 0.35;
export const DEFAULT_MAX_EVIDENCE = 300;

export type ExtractEvidenceOptions = EvidenceExtractionOptions & {
  method?: "RULE_BASED" | "AI";
  aiProvider?: EvidenceAiProvider | null;
};

const zeroCounts = <T extends string>(keys: readonly T[]) =>
  Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;

/** Source passages for the available content (full text first). */
export function contentPassages(content: PublicationContent): SourcePassage[] {
  const passages: SourcePassage[] = [];
  if (content.fullText?.paragraphs.length)
    passages.push(
      ...fullTextPassages(
        content.fullText.paragraphs,
        content.fullText.sourceUrl,
      ),
    );
  const abstract = content.abstract ? stripMarkup(content.abstract) : "";
  // Offsets must point into the STORED abstract, so markup-free text is required.
  if (abstract && abstract === content.abstract) {
    passages.push(
      ...abstractPassages(abstract, {
        sourceUrl: content.abstractSourceUrl,
        order: Number.MAX_SAFE_INTEGER / 2,
      }),
    );
  } else if (abstract) {
    passages.push(
      ...abstractPassages(abstract, {
        passageId: "abstract-cleaned",
        sourceUrl: content.abstractSourceUrl,
        order: Number.MAX_SAFE_INTEGER / 2,
      }),
    );
  }
  return passages;
}

export async function extractEvidence(
  content: PublicationContent,
  options: ExtractEvidenceOptions = {},
): Promise<EvidenceExtractionOutput> {
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const maxEvidence = options.maxEvidence ?? DEFAULT_MAX_EVIDENCE;
  const createdAt = new Date().toISOString();
  const warnings: string[] = [];
  const passages = contentPassages(content);
  const hasFullText = passages.some(
    (p) => p.availability === EvidenceAvailability.FULL_TEXT,
  );
  const hasAbstract = passages.some(
    (p) => p.availability === EvidenceAvailability.ABSTRACT,
  );

  if (!passages.length)
    warnings.push(
      "No abstract or full text is available for this publication; no evidence was extracted",
    );
  else if (!hasFullText)
    warnings.push(
      "Only the abstract is available: verification scope is limited (methods, results and limitations may be missing)",
    );
  if (
    hasFullText &&
    !passages.some(
      (p) =>
        p.availability === "FULL_TEXT" &&
        p.sectionKind &&
        p.sectionKind !== "OTHER",
    )
  )
    warnings.push(
      "The full text has no recognisable section headings; classification relies on sentence cues only",
    );
  if (content.abstract && passages.some((p) => p.id === "abstract-cleaned"))
    warnings.push(
      "The stored abstract contains markup; offsets refer to its markup-free text",
    );

  let candidates: ExtractedEvidence[];
  let sentencesConsidered = 0;
  if (options.method === "AI") {
    if (!options.aiProvider)
      throw new EvidenceExtractionError(
        "AI_PROVIDER_NOT_CONFIGURED",
        "AI evidence extraction requested but no AI provider is configured",
      );
    const ai = await extractEvidenceWithAi(
      content.publicationId,
      passages,
      options.aiProvider,
      createdAt,
    );
    candidates = ai.evidence;
    warnings.push(...ai.warnings);
  } else {
    const rule = extractEvidenceRuleBased(
      content.publicationId,
      passages,
      createdAt,
    );
    candidates = rule.evidence;
    sentencesConsidered = rule.sentencesConsidered;
  }

  // Deduplicate by fingerprint; the first occurrence (full text before abstract) wins.
  const seen = new Set<string>();
  let duplicatesRemoved = 0;
  const evidence: ExtractedEvidence[] = [];
  for (const item of candidates) {
    if (item.confidence < minConfidence) continue;
    if (seen.has(item.fingerprint)) {
      duplicatesRemoved++;
      continue;
    }
    seen.add(item.fingerprint);
    evidence.push(item);
  }
  if (evidence.length > maxEvidence) {
    warnings.push(
      `Evidence was capped at ${maxEvidence} passages (${evidence.length} found)`,
    );
    evidence.length = maxEvidence;
  }
  for (const [i, item] of evidence.entries()) item.position = i;

  const byType = zeroCounts(Object.values(EvidenceType));
  const byAvailability = zeroCounts<Availability>(
    Object.values(EvidenceAvailability),
  );
  for (const e of evidence) {
    byType[e.evidenceType]++;
    byAvailability[e.evidenceAvailability]++;
  }
  return {
    publicationId: content.publicationId,
    evidence,
    verificationScope: hasFullText
      ? VerificationScope.FULL
      : hasAbstract
        ? VerificationScope.LIMITED
        : VerificationScope.NONE,
    stats: {
      passages: passages.length,
      sentencesConsidered,
      selected: evidence.length,
      duplicatesRemoved,
      byType,
      byAvailability,
    },
    warnings,
  };
}
