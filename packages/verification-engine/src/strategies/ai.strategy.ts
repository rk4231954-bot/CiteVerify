/**
 * AI-assisted stance assessment behind a provider-independent interface.
 *
 * The provider only proposes a stance for passages it was given; it cannot
 * add evidence. Proposals are validated, and the rule-based assessment is
 * always computed too: where AI and rules point in opposite directions the
 * passage is treated as neutral (and the claim goes to human review), and the
 * rules' overreach checks (causal wording, numbers, population) still apply.
 */
import {
  analyzeClaim,
  assessPassage,
  OVERREACH,
  TYPE_WEIGHT,
} from "../analysis/stance.ts";
import { aiStanceProposalSchema } from "../schemas/verification.schema.ts";
import type {
  PassageAssessment,
  Stance,
  VerificationAiProvider,
  VerificationStrategy,
} from "../types/verification.types.ts";
import { VerificationError } from "../utils/errors.ts";
import { round } from "../utils/text.ts";

const opposite = (a: Stance, b: Stance) =>
  (a === "DISAGREES" && (b === "AGREES" || b === "PARTIAL")) ||
  (b === "DISAGREES" && (a === "AGREES" || a === "PARTIAL"));

export function createAiStrategy(
  provider: VerificationAiProvider,
): VerificationStrategy {
  return {
    name: `ai:${provider.name}`,
    method: "AI",
    assess: async (claim, passages) => {
      const profile = analyzeClaim(claim);
      const rules = passages.map((p) => assessPassage(profile, p));
      let raw: unknown[];
      try {
        raw = await provider.assessEvidence({
          claim: { id: claim.id, text: profile.text },
          passages: passages.map((p) => ({
            evidenceId: p.passage.id,
            text: p.passage.sourceText,
            evidenceType: p.passage.evidenceType,
            evidenceAvailability: p.passage.evidenceAvailability,
            section: p.passage.section,
            publicationTitle: p.publication.title,
          })),
        });
      } catch (error) {
        throw new VerificationError(
          "AI_PROVIDER_ERROR",
          `AI provider "${provider.name}" failed`,
          {
            cause: error,
          },
        );
      }
      const proposals = new Map<
        string,
        { stance: Stance; rationale?: string }
      >();
      const known = new Set(passages.map((p) => p.passage.id));
      for (const item of Array.isArray(raw) ? raw : []) {
        const parsed = aiStanceProposalSchema.safeParse(item);
        // Unknown ids (invented evidence) and malformed proposals are dropped.
        if (
          parsed.success &&
          known.has(parsed.data.evidenceId) &&
          !proposals.has(parsed.data.evidenceId)
        )
          proposals.set(parsed.data.evidenceId, parsed.data);
      }

      return rules.map((rule, i): PassageAssessment => {
        const ctx = passages[i];
        const ai = proposals.get(rule.evidenceId);
        if (!ai || !ctx) return rule;
        const note = `AI (${provider.name}): ${ai.stance}${ai.rationale ? ` — ${ai.rationale}` : ""}`;
        if (opposite(ai.stance, rule.stance))
          return {
            ...rule,
            stance: "NEUTRAL",
            flags: [...rule.flags, "AI_RULE_CONFLICT"],
            rationale: [
              ...rule.rationale,
              note,
              "AI and rule-based readings disagree: not counted",
            ],
            strength: 0,
          };
        const type = ctx.passage.evidenceType;
        const weight = type ? TYPE_WEIGHT[type] : 0.7;
        if (weight === 0 || ai.stance === "NEUTRAL")
          return { ...rule, rationale: [...rule.rationale, note] };
        let stance = ai.stance;
        if (stance === "AGREES" && rule.flags.some((f) => OVERREACH.has(f)))
          stance = "PARTIAL";
        const aiOnly = rule.stance === "NEUTRAL";
        return {
          evidenceId: rule.evidenceId,
          stance,
          flags: aiOnly ? [...rule.flags, "AI_ONLY"] : rule.flags,
          rationale: [...rule.rationale, note],
          strength: round(
            ctx.relevanceScore *
              weight *
              (aiOnly ? 0.8 : 1) *
              (stance === "PARTIAL" ? 0.75 : 1),
            3,
          ),
        };
      });
    },
  };
}
