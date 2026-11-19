/**
 * @citeverify/claim-extractor — finds scientific claims in document-parser output.
 *
 * Independent of the database and HTTP layers. The default method is the
 * offline rule-based extractor; AI extraction is opt-in via a provider.
 */
import {
  type ClaimExtractionMethod,
  ClaimExtractionMethod as Method,
} from "@citeverify/shared";
import { extractClaimsWithAi } from "./extractors/ai-extractor.ts";
import { extractClaimsRuleBased } from "./extractors/rule-based-extractor.ts";
import type {
  ClaimAiProvider,
  ClaimExtractionOptions,
  ClaimExtractionOutput,
  SourceParagraph,
} from "./types/claim.types.ts";
import { ClaimExtractionError } from "./utils/errors.ts";

export type ExtractClaimsInput = {
  documentId: string;
  /** Typically `ExtractionResult` from @citeverify/document-parser (only paragraphs are used). */
  extraction: { paragraphs: readonly SourceParagraph[] };
};

export type ExtractClaimsOptions = ClaimExtractionOptions & {
  method?: Exclude<ClaimExtractionMethod, "MANUAL">;
  aiProvider?: ClaimAiProvider | null;
};

export async function extractClaims(
  input: ExtractClaimsInput,
  {
    method = Method.RULE_BASED,
    aiProvider,
    ...options
  }: ExtractClaimsOptions = {},
): Promise<ClaimExtractionOutput> {
  if (method === Method.AI) {
    if (!aiProvider) {
      throw new ClaimExtractionError(
        "AI_PROVIDER_NOT_CONFIGURED",
        "AI extraction requested but no AI provider is configured",
      );
    }
    return extractClaimsWithAi(
      input.documentId,
      input.extraction.paragraphs,
      aiProvider,
    );
  }
  return extractClaimsRuleBased(
    input.documentId,
    input.extraction.paragraphs,
    options,
  );
}

export {
  classifySentence,
  detectSignals,
} from "./classifiers/claim-classifier.ts";
export { extractClaimsWithAi } from "./extractors/ai-extractor.ts";
export { extractClaimsRuleBased } from "./extractors/rule-based-extractor.ts";
export {
  claimFingerprint,
  hasCitationMarker,
  normalizeClaimText,
  stripCitationMarkers,
} from "./normalizers/claim-normalizer.ts";
export * from "./schemas/claim.schema.ts";
export * from "./types/claim.types.ts";
export {
  combineSignalWeights,
  computeConfidence,
  roundConfidence,
} from "./utils/confidence.ts";
export { ClaimExtractionError } from "./utils/errors.ts";
export { splitSentences } from "./utils/sentences.ts";
