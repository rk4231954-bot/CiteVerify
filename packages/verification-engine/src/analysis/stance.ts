/**
 * Deterministic stance of one evidence passage towards a claim.
 *
 * A passage AGREES only when it explicitly reports the same direction for the
 * claim's outcome; DISAGREES when it reports the opposite direction or no
 * (significant) effect; PARTIAL when it agrees but the claim goes further
 * (causal wording for an association, absolute wording, other numbers or a
 * different population). Topical similarity alone never produces a stance.
 */
import { normalizeClaimText } from "@citeverify/claim-extractor";
import { subjectOutcome } from "@citeverify/evidence-extractor";
import type { EvidenceType } from "@citeverify/shared";
import type {
  Assertion,
  AssessmentFlag,
  PassageAssessment,
  PassageContext,
  Polarity,
  PopulationGroup,
  Stance,
  VerificationClaim,
} from "../types/verification.types.ts";
import { coverage, round, tokenSet, withoutPopulation } from "../utils/text.ts";
import { analyzeAssertion, populationsOf } from "./assertion.ts";

export type ClaimProfile = {
  text: string;
  subject: string[];
  outcome: string[];
  /** All content terms, population words removed. */
  terms: string[];
  assertion: Assertion;
};

export function analyzeClaim(claim: VerificationClaim): ClaimProfile {
  const text = claim.normalizedText?.trim() || normalizeClaimText(claim.text);
  const so = subjectOutcome(text);
  const outcome = withoutPopulation(so?.outcome ?? []);
  return {
    text,
    subject: so?.subject ?? [],
    outcome,
    terms: withoutPopulation([...tokenSet(text)]),
    assertion: analyzeAssertion(text, { outcomeTerms: outcome }),
  };
}

/** How much a passage of each type can weigh in a verdict. */
export const TYPE_WEIGHT: Record<EvidenceType, number> = {
  STATISTICAL_RESULT: 1,
  EXPERIMENTAL_RESULT: 1,
  ABSTRACT_FINDING: 0.9,
  CONCLUSION: 0.85,
  DISCUSSION: 0.7,
  LIMITATION: 0,
  METHODOLOGY: 0,
};
const LEGACY_WEIGHT = 0.7;

/** Coverage needed before a passage can take a stance at all. */
export const MIN_OUTCOME_COVERAGE = 0.5;

const POLARITY_WORD: Record<Polarity, string> = {
  UP: "an increase/improvement",
  DOWN: "a decrease/reduction",
  NONE: "no effect or no association",
  UNSIGNED: "a relationship (direction not stated)",
};

function compare(claim: Polarity, passage: Polarity): Stance {
  if (claim === "NONE") return passage === "NONE" ? "AGREES" : "DISAGREES";
  if (passage === "NONE") return "DISAGREES";
  if (claim === "UNSIGNED") return "AGREES";
  if (passage === "UNSIGNED") return "PARTIAL";
  return claim === passage ? "AGREES" : "DISAGREES";
}

function populationMismatch(
  claim: PopulationGroup[],
  study: PopulationGroup[],
): string | null {
  const c = new Set(claim);
  const s = new Set(study);
  if (
    (s.has("ANIMAL") || s.has("IN_VITRO")) &&
    !c.has("ANIMAL") &&
    !c.has("IN_VITRO")
  )
    return s.has("ANIMAL")
      ? "the source studied animals, the claim does not say so"
      : "the source is an in-vitro (cell) study, the claim does not say so";
  if (
    c.has("CHILDREN") &&
    !s.has("CHILDREN") &&
    (s.has("ADULTS") || s.has("OLDER_ADULTS"))
  )
    return "the claim concerns children, the source studied adults";
  if (
    (c.has("ADULTS") || c.has("OLDER_ADULTS")) &&
    s.has("CHILDREN") &&
    !s.has("ADULTS") &&
    !s.has("OLDER_ADULTS")
  )
    return "the claim concerns adults, the source studied children";
  if (c.has("WOMEN") && !c.has("MEN") && s.has("MEN") && !s.has("WOMEN"))
    return "the claim concerns women, the source studied men";
  if (c.has("MEN") && !c.has("WOMEN") && s.has("WOMEN") && !s.has("MEN"))
    return "the claim concerns men, the source studied women";
  return null;
}

function compareQuantities(claim: string[], passage: string[]) {
  const split = (q: string) => {
    const [value = "", ...unit] = q.split(" ");
    return { value: Number(value), unit: unit.join(" ") };
  };
  let matched = false;
  let mismatched = false;
  for (const cq of claim.map(split)) {
    const same = passage.map(split).filter((p) => p.unit === cq.unit);
    if (!same.length) continue;
    if (
      same.some(
        (p) => Math.abs(p.value - cq.value) <= Math.abs(cq.value) * 0.05,
      )
    )
      matched = true;
    else mismatched = true;
  }
  return { matched, mismatched };
}

const neutral = (
  ctx: PassageContext,
  flags: AssessmentFlag[],
  rationale: string,
): PassageAssessment => ({
  evidenceId: ctx.passage.id,
  stance: "NEUTRAL",
  flags,
  rationale: [rationale],
  strength: 0,
});

export function assessPassage(
  claim: ClaimProfile,
  ctx: PassageContext,
): PassageAssessment {
  const { passage } = ctx;
  const type = passage.evidenceType;
  if (type === "METHODOLOGY")
    return neutral(
      ctx,
      ["NON_FINDING_TYPE"],
      "Methodology passage: describes how the study was done, not what it found",
    );
  if (type === "LIMITATION")
    return neutral(
      ctx,
      ["NON_FINDING_TYPE"],
      "Limitation stated by the source",
    );

  const text = passage.normalizedText ?? passage.sourceText;
  const tokens = tokenSet(text);
  const context = tokenSet(
    `${text} ${ctx.publication.title} ${ctx.studyProfile}`,
  );
  const outcomeCov = claim.outcome.length
    ? coverage(claim.outcome, tokens)
    : coverage(claim.terms, tokens);
  const subjectCov = coverage(claim.subject, context);
  if (
    outcomeCov < MIN_OUTCOME_COVERAGE ||
    (claim.subject.length > 0 && subjectCov === 0)
  )
    return neutral(
      ctx,
      ["OFF_OUTCOME"],
      outcomeCov < MIN_OUTCOME_COVERAGE
        ? "The passage does not mention most of the claim's outcome terms"
        : "Neither the passage nor its publication mention the claim's subject",
    );

  const pa = analyzeAssertion(text, {
    outcomeTerms: claim.outcome.length ? claim.outcome : claim.terms,
  });
  const flags: AssessmentFlag[] = [];
  const rationale: string[] = [];
  let polarity = pa.polarity;
  if (polarity === null)
    return neutral(
      ctx,
      ["NO_DIRECTION"],
      "The passage mentions the outcome but states no direction of effect or association",
    );
  if (polarity !== "NONE" && pa.significance === "NOT_SIGNIFICANT") {
    polarity = "NONE";
    flags.push("NOT_SIGNIFICANT");
    rationale.push(
      "The reported difference is explicitly not statistically significant",
    );
  }
  const claimPolarity = claim.assertion.polarity;
  if (!claimPolarity)
    return neutral(
      ctx,
      ["NO_DIRECTION"],
      "The claim states no direction that could be compared",
    );

  let stance = compare(claimPolarity, polarity);
  if (polarity === "NONE" && claimPolarity !== "NONE")
    flags.push("NO_EFFECT_REPORTED");
  rationale.unshift(
    `Claim asserts ${POLARITY_WORD[claimPolarity]}${claim.assertion.cue ? ` ("${claim.assertion.cue}")` : ""}; passage reports ${POLARITY_WORD[polarity]}${pa.cue ? ` ("${pa.cue}")` : ""}`,
  );

  const mismatch = populationMismatch(
    claim.assertion.populations,
    populationsOf(`${text} ${ctx.publication.title} ${ctx.studyProfile}`),
  );
  if (mismatch) {
    flags.push("POPULATION_MISMATCH");
    rationale.push(`Population differs: ${mismatch}`);
  }

  if (stance === "AGREES" || stance === "PARTIAL") {
    if (stance === "PARTIAL") {
      flags.push("UNSIGNED_SOURCE");
      rationale.push("The source reports a relationship but not its direction");
    }
    if (
      (claim.assertion.relation === "CAUSAL" ||
        claim.assertion.relation === "EFFECT") &&
      pa.relation === "ASSOCIATION"
    ) {
      flags.push("CAUSAL_OVERSTATEMENT");
      rationale.push(
        "The claim states an effect; the source reports only an association",
      );
    }
    const absent = claim.assertion.absoluteTerms.filter(
      (t) => !pa.absoluteTerms.includes(t),
    );
    if (absent.length) {
      flags.push("OVERGENERALIZATION");
      rationale.push(
        `The claim uses absolute wording the source does not ("${absent.join('", "')}")`,
      );
    }
    const q = compareQuantities(claim.assertion.quantities, pa.quantities);
    if (q.mismatched && !q.matched) {
      flags.push("NUMBER_MISMATCH");
      rationale.push(
        `Numbers differ: claim ${claim.assertion.quantities.join(", ")}; passage ${pa.quantities.join(", ")}`,
      );
    } else if (q.matched) {
      flags.push("NUMBER_MATCH");
      rationale.push("The claim's figures appear in the passage");
    }
    if (pa.significance === "MIXED") {
      flags.push("MIXED_SIGNIFICANCE");
      rationale.push(
        "The passage reports both significant and non-significant results",
      );
    }
    if (flags.some((f) => OVERREACH.has(f))) stance = "PARTIAL";
  } else if (stance === "DISAGREES" && mismatch) {
    // A different population cannot contradict the claim on its own.
    return {
      evidenceId: passage.id,
      stance: "NEUTRAL",
      flags,
      rationale: [
        ...rationale,
        "Not counted as contradicting because the population differs",
      ],
      strength: 0,
    };
  }

  if (pa.hedged) {
    flags.push("HEDGED_SOURCE");
    rationale.push('The source words this tentatively (e.g. "may", "suggest")');
  }
  const weight = type ? TYPE_WEIGHT[type] : LEGACY_WEIGHT;
  const strength =
    ctx.relevanceScore *
    weight *
    (pa.hedged ? 0.85 : 1) *
    (stance === "PARTIAL" ? 0.75 : 1);
  return {
    evidenceId: passage.id,
    stance,
    flags,
    rationale,
    strength: round(strength, 3),
  };
}

/** Flags that make an otherwise agreeing passage only PARTIAL support. */
export const OVERREACH = new Set<AssessmentFlag>([
  "UNSIGNED_SOURCE",
  "CAUSAL_OVERSTATEMENT",
  "OVERGENERALIZATION",
  "NUMBER_MISMATCH",
  "POPULATION_MISMATCH",
  "MIXED_SIGNIFICANCE",
]);
