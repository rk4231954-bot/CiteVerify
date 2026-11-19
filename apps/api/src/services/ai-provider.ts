import type { ClaimAiProvider } from "@citeverify/claim-extractor";

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
