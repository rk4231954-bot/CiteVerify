/**
 * Conservative aggregation of passage stances into one verdict.
 *
 *   no citation / unresolved citations / no evidence   → NEEDS_HUMAN_REVIEW
 *   every cited publication is off-topic                → MISLEADING_CITATION
 *   the claim states no comparable direction            → NEEDS_HUMAN_REVIEW
 *   support AND contradiction:
 *     support only from publications ≥3 years older     → OUTDATED
 *     otherwise                                         → NEEDS_HUMAN_REVIEW
 *   contradiction only                                  → CONTRADICTED
 *   support only, the claim overreaches somewhere       → PARTIALLY_SUPPORTED
 *   support only                                        → SUPPORTED
 *   on-topic, no stance, full text was read             → UNSUPPORTED
 *   on-topic, no stance, abstract only                  → NEEDS_HUMAN_REVIEW
 *
 * Abstract-only evidence never counts like full text: its confidence is
 * capped lower and a human check is always recommended.
 */
import { Verdict } from "@citeverify/shared";
import type {
  AssessmentFlag,
  EvidenceSourceType,
  ReasonCode,
} from "../types/verification.types.ts";

/** Upper bound of the confidence (0..1) per verdict and evidence source. */
export const CONFIDENCE_CAP: Record<
  Verdict,
  { full: number; abstract: number }
> = {
  SUPPORTED: { full: 0.9, abstract: 0.65 },
  PARTIALLY_SUPPORTED: { full: 0.8, abstract: 0.6 },
  CONTRADICTED: { full: 0.85, abstract: 0.6 },
  OUTDATED: { full: 0.65, abstract: 0.5 },
  MISLEADING_CITATION: { full: 0.75, abstract: 0.55 },
  UNSUPPORTED: { full: 0.65, abstract: 0.5 },
  NEEDS_HUMAN_REVIEW: { full: 0.4, abstract: 0.4 },
};

/** Confidence (0..1) reported for review outcomes: how much usable evidence there was. */
export const REVIEW_CONFIDENCE: Partial<Record<ReasonCode, number>> = {
  NO_CITATION: 0,
  UNRESOLVED_CITATION: 0,
  NO_EVIDENCE: 0,
  CLAIM_NOT_ANALYSABLE: 0.15,
  INSUFFICIENT_EVIDENCE: 0.2,
  CONFLICTING_EVIDENCE: 0.3,
};

/** Years by which supporting evidence must predate contradicting evidence for OUTDATED. */
export const OUTDATED_GAP_YEARS = 3;

/** Review is recommended below this confidence (0–100). */
export const REVIEW_BELOW = 60;

/** Flags meaning the CLAIM says more than the source (→ partial support). */
export const CLAIM_OVERREACH = new Set<AssessmentFlag>([
  "CAUSAL_OVERSTATEMENT",
  "OVERGENERALIZATION",
  "NUMBER_MISMATCH",
  "POPULATION_MISMATCH",
]);

export const FLAG_TEXT: Partial<Record<AssessmentFlag, string>> = {
  CAUSAL_OVERSTATEMENT:
    "the claim states cause/effect while the source reports an association",
  OVERGENERALIZATION: "the claim uses absolute wording the source does not",
  NUMBER_MISMATCH: "the claim's figures differ from the source's",
  POPULATION_MISMATCH: "the source studied a different population",
  UNSIGNED_SOURCE:
    "the source does not state the direction of the relationship",
  MIXED_SIGNIFICANCE:
    "the source reports both significant and non-significant results",
};

export function capFor(verdict: Verdict, source: EvidenceSourceType) {
  const cap = CONFIDENCE_CAP[verdict];
  return source === "ABSTRACT" || source === "NONE" ? cap.abstract : cap.full;
}

export const SERIOUS_VERDICTS = new Set<Verdict>([
  Verdict.CONTRADICTED,
  Verdict.OUTDATED,
  Verdict.MISLEADING_CITATION,
]);
