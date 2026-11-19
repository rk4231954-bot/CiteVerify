# @citeverify/verification-engine

Compares an extracted claim with the evidence of the publications it cites and returns an **explainable, conservative verdict**. Pure TypeScript: no database, no network, no external AI API.

Every result is an **automated assessment**, never a confirmed scientific fact. It quotes the evidence it used verbatim (with section, page and URL), states its limitations, and recommends human review whenever the evidence is thin, abstract-only, conflicting or the verdict is serious.

```ts
import { verifyClaim } from "@citeverify/verification-engine";

const result = await verifyClaim({
  claim: { id, text, normalizedText },
  citations, // claim → citation → reference → publication, with match statuses
  evidence, // Evidence rows of those publications
});
// { verdict, confidence (0–100), explanation, supportingEvidence, contradictingEvidence,
//   contextEvidence, publications, evidenceSource, limitations, humanReview, ... }
```

## How a verdict is reached

1. **Resolve sources.** Only confidently matched citations → references → publications are used; the rest are reported as unresolved.
2. **Relevance filter.** Evidence is ranked with `rankEvidenceForClaim` (evidence-extractor). Relevance only selects candidates — it is never treated as support.
3. **Stance per passage** (strategy). The rule-based strategy reads explicit wording:
   - direction of the claim and of the passage (increase / decrease / no effect / unsigned association), using the cue closest to the claim's outcome terms;
   - "not significant" / `p ≥ 0.05` turns a reported change into "no effect";
   - `AGREES` (same direction), `DISAGREES` (opposite or no effect), `PARTIAL` (agrees but the claim overreaches: causal wording for an association, absolute wording, different numbers, different population, unsigned source), `NEUTRAL` (off-outcome, no direction, methods, limitations).
4. **Conservative aggregation** (`rules/verdict-rules.ts`):

| Situation                                                              | Verdict               |
| ---------------------------------------------------------------------- | --------------------- |
| no citation / unresolved citations / no evidence                       | `NEEDS_HUMAN_REVIEW`  |
| no cited publication shares any key term with the claim                | `MISLEADING_CITATION` |
| the claim states no comparable direction                               | `NEEDS_HUMAN_REVIEW`  |
| support only from publications ≥ 3 years older than contradicting ones | `OUTDATED`            |
| support and contradiction otherwise                                    | `NEEDS_HUMAN_REVIEW`  |
| contradiction only                                                     | `CONTRADICTED`        |
| support, but the claim overreaches                                     | `PARTIALLY_SUPPORTED` |
| support                                                                | `SUPPORTED`           |
| on topic, no stance, full text was read                                | `UNSUPPORTED`         |
| on topic, no stance, abstract only                                     | `NEEDS_HUMAN_REVIEW`  |

**Confidence (0–100)** grows with the strongest passage (relevance × evidence type × wording), corroboration and link certainty, and is capped per verdict — lower for abstract-only evidence (e.g. `SUPPORTED` ≤ 90 with full text, ≤ 65 with abstracts). Review outcomes report how much usable evidence there was (0 = none).

## Strategies

- `ruleBasedStrategy` — deterministic baseline (default).
- `createAiStrategy(provider)` — any `VerificationAiProvider` proposes per-passage stances. Proposals are schema-validated, unknown evidence ids are dropped, the rules' overreach checks still apply, and an AI/rule disagreement makes the passage neutral and the claim go to human review.

## Layout

```
src/
  analysis/    patterns, assertion (direction, significance, hedging, populations), stance
  strategies/  rule-based.strategy, ai.strategy
  rules/       verdict-rules (caps, thresholds, overreach flags)
  schemas/     zod: AI proposals, stored details/rationale
  types/       verification.types.ts
  verifier.ts  verifyClaim / verifyClaims
tests/         synthetic fixtures only
```

## Limitations

- Explicit wording only: synonyms, paraphrases, tables, figures and effect sizes without direction words are not understood; such claims go to human review rather than being guessed.
- Only the claim's own cited publications are considered; no literature search is done, so `OUTDATED` needs newer evidence among the citations.
- Retractions and corrections are not checked.
- Population checks cover animals/cells, children vs adults and sex only.
