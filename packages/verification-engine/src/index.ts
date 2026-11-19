/**
 * @citeverify/verification-engine — compares extracted claims with the
 * evidence of the publications they cite and produces explainable,
 * conservative verdicts.
 *
 * Every result is an AUTOMATED assessment: it quotes the evidence it used
 * verbatim, states its limitations, and recommends human review whenever the
 * evidence is thin, abstract-only, conflicting or serious.
 */
export { analyzeAssertion, populationsOf } from "./analysis/assertion.ts";
export {
  analyzeClaim,
  assessPassage,
  type ClaimProfile,
  MIN_OUTCOME_COVERAGE,
  TYPE_WEIGHT,
} from "./analysis/stance.ts";
export * from "./rules/verdict-rules.ts";
export * from "./schemas/verification.schema.ts";
export { createAiStrategy } from "./strategies/ai.strategy.ts";
export { ruleBasedStrategy } from "./strategies/rule-based.strategy.ts";
export * from "./types/verification.types.ts";
export {
  VerificationError,
  type VerificationErrorCode,
} from "./utils/errors.ts";
export {
  DISCLAIMER,
  MIN_CANDIDATE_RELEVANCE,
  ON_TOPIC_RELEVANCE,
  type VerifyOptions,
  verifyClaim,
  verifyClaims,
} from "./verifier.ts";
