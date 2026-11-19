import type { ClaimAiProvider } from "@citeverify/claim-extractor";
import type { VerificationAiProvider } from "@citeverify/verification-engine";

/**
 * The AI provider used for `method: "AI"` claim extraction.
 *
 * None is configured: CiteVerify works fully with rule-based extraction and
 * needs no paid API. To enable AI extraction, implement `ClaimAiProvider`
 * from @citeverify/claim-extractor (any vendor or a local model) and return
 * it here. Its output is still validated — every candidate must be a verbatim
 * sentence of the stored extraction, or it is discarded.
 */
export function getAiProvider(): ClaimAiProvider | null {
  return null;
}

/**
 * The AI provider for `method: "AI"` verification. None is configured: the
 * deterministic rule-based strategy needs no external API. Implement
 * `VerificationAiProvider` from @citeverify/verification-engine and return it
 * here. The provider may only propose stances for the given passages; the
 * rules still check every proposal, and disagreements go to human review.
 */
let verificationAi: VerificationAiProvider | null = null;
export const getVerificationAiProvider = (): VerificationAiProvider | null =>
  verificationAi;
/** For tests: null restores "not configured". */
export function setVerificationAiProvider(
  provider: VerificationAiProvider | null,
) {
  verificationAi = provider;
}
