import { analyzeClaim, assessPassage } from "../analysis/stance.ts";
import type { VerificationStrategy } from "../types/verification.types.ts";

/** Deterministic baseline: explicit-wording rules only, no external service. */
export const ruleBasedStrategy: VerificationStrategy = {
  name: "rule-based-v1",
  method: "RULE_BASED",
  assess: async (claim, passages) => {
    const profile = analyzeClaim(claim);
    return passages.map((p) => assessPassage(profile, p));
  },
};
