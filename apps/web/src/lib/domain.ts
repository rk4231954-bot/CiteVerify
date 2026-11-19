/** Presentation metadata for backend enums (labels, tones, descriptions). */

import { ClaimCategory, Verdict } from "@citeverify/shared";
import type { BadgeTone, IconName } from "@citeverify/ui";

export interface VerdictMeta {
  label: string;
  short: string;
  description: string;
  /** Chart mark colour (never used for text). */
  color: string;
  tone: BadgeTone;
  icon: IconName;
}

/** Order used everywhere verdicts are listed. Colours are paired with labels and icons. */
export const VERDICT_ORDER: Verdict[] = [
  Verdict.SUPPORTED,
  Verdict.PARTIALLY_SUPPORTED,
  Verdict.UNSUPPORTED,
  Verdict.CONTRADICTED,
  Verdict.OUTDATED,
  Verdict.MISLEADING_CITATION,
  Verdict.NEEDS_HUMAN_REVIEW,
];

export const VERDICTS: Record<Verdict, VerdictMeta> = {
  SUPPORTED: {
    label: "Supported",
    short: "Supported",
    description:
      "The cited source's available text reports a finding consistent with the claim.",
    color: "#008300",
    tone: "success",
    icon: "checkCircle",
  },
  PARTIALLY_SUPPORTED: {
    label: "Partially supported",
    short: "Partial",
    description:
      "The source supports part of the claim, or the claim goes further than the source.",
    color: "#1baf7a",
    tone: "teal",
    icon: "check",
  },
  UNSUPPORTED: {
    label: "Unsupported",
    short: "Unsupported",
    description:
      "The cited full text concerns the topic but no passage takes a position on the claim.",
    color: "#2a78d6",
    tone: "primary",
    icon: "minus",
  },
  CONTRADICTED: {
    label: "Contradicted",
    short: "Contradicted",
    description:
      "The available source text reports a finding that conflicts with the claim.",
    color: "#e34948",
    tone: "danger",
    icon: "x",
  },
  OUTDATED: {
    label: "Outdated",
    short: "Outdated",
    description:
      "Support comes only from sources ≥3 years older than cited evidence that contradicts the claim.",
    color: "#6250d6",
    tone: "violet",
    icon: "clock",
  },
  MISLEADING_CITATION: {
    label: "Misleading citation",
    short: "Misleading",
    description:
      "None of the cited sources appear to concern the claim's topic.",
    color: "#c94f9e",
    tone: "pink",
    icon: "alert",
  },
  NEEDS_HUMAN_REVIEW: {
    label: "Needs human review",
    short: "Review",
    description:
      "The automated assessment could not reach a reliable verdict (e.g. missing citation, no evidence, or conflicting evidence).",
    color: "#b88700",
    tone: "warning",
    icon: "user",
  },
};

export function verdictMeta(v: string): VerdictMeta {
  return VERDICTS[v as Verdict] ?? VERDICTS.NEEDS_HUMAN_REVIEW;
}

export const CATEGORY_LABEL: Record<ClaimCategory, string> = {
  [ClaimCategory.SCIENTIFIC_FACT]: "Scientific fact",
  [ClaimCategory.EXPERIMENTAL_FINDING]: "Experimental finding",
  [ClaimCategory.STATISTICAL_CLAIM]: "Statistical claim",
  [ClaimCategory.CAUSAL_CLAIM]: "Causal claim",
  [ClaimCategory.COMPARATIVE_CLAIM]: "Comparative claim",
  [ClaimCategory.RESEARCH_CONCLUSION]: "Research conclusion",
  [ClaimCategory.NUMERICAL_CLAIM]: "Numerical claim",
};

export function categoryLabel(c: string): string {
  return CATEGORY_LABEL[c as ClaimCategory] ?? c;
}

export const MATCH_TONE: Record<string, BadgeTone> = {
  MATCHED: "success",
  AMBIGUOUS: "warning",
  NEEDS_REVIEW: "warning",
  UNMATCHED: "slate",
  NOT_FOUND: "slate",
  FAILED: "danger",
  LINKED: "primary",
};

export const SOURCE_LABEL: Record<string, string> = {
  FULL_TEXT: "Full text",
  ABSTRACT: "Abstract only",
  MIXED: "Full text + abstract",
  NONE: "No content",
  METADATA: "Metadata only",
};

export const SCOPE_LABEL: Record<string, string> = {
  FULL: "Full-text scope",
  LIMITED: "Limited scope (abstract)",
  NONE: "No content available",
};

/** Confidence (0–100) wording that never implies a guarantee. */
export function confidenceLabel(c: number): string {
  if (c >= 75) return "Higher confidence";
  if (c >= 50) return "Moderate confidence";
  if (c >= 25) return "Low confidence";
  return "Very low confidence";
}

export const CONFIDENCE_BUCKETS = [
  { key: "0–19", min: 0, max: 19 },
  { key: "20–39", min: 20, max: 39 },
  { key: "40–59", min: 40, max: 59 },
  { key: "60–79", min: 60, max: 79 },
  { key: "80–100", min: 80, max: 100 },
] as const;
