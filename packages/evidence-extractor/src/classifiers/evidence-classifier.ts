/**
 * Decides whether a sentence is evidence and, if so, which kind.
 *
 * The section a sentence is in (from its heading) is the strongest signal;
 * sentence cues refine it. Most sentences are NOT evidence: introductions
 * (other people's work), objectives, captions, boilerplate, references and
 * back matter are skipped, and a sentence inside Results or Methods still
 * needs a result/method cue to be kept.
 *
 * Confidence is about the classification only — never about whether the
 * reported finding is true.
 */
import { computeConfidence } from "@citeverify/claim-extractor";

type Penalty = { reason: string; factor: number };

import {
  type EvidenceAvailability,
  EvidenceType,
  type EvidenceType as EvidenceTypeValue,
} from "@citeverify/shared";
import type { SectionKind } from "../types/evidence.types.ts";
import { extractSampleSizes, extractStatistics } from "../utils/details.ts";
import {
  BOILERPLATE,
  CONCLUSION_CUES,
  DESIGN_TERMS,
  DISCUSSION_CUES,
  LIMITATION_CUES,
  METHOD_CUES,
  matchCues,
  OBJECTIVE,
  OWN_STUDY,
  RESULT_CUES,
  SIGNIFICANCE,
} from "../utils/patterns.ts";

export type SentenceSignals = {
  statistics: string[];
  significance: string | null;
  results: string[];
  methods: string[];
  design: string[];
  sampleSizes: string[];
  limitations: string[];
  conclusions: string[];
  discussion: string[];
  ownStudy: boolean;
  objective: boolean;
  hasNumber: boolean;
};

export type EvidenceClassification = {
  evidenceType: EvidenceTypeValue;
  confidence: number;
  /** Human-readable reasons, e.g. 'section "Results"', 'statistic "p < 0.01"'. */
  signals: string[];
};

const MIN_WORDS = 6;
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

export function detectSignals(sentence: string): SentenceSignals {
  const stats = extractStatistics(sentence)
    .filter((s) => s.kind !== "PERCENTAGE")
    .map((s) => s.text);
  return {
    statistics: stats,
    significance: sentence.match(SIGNIFICANCE)?.[0] ?? null,
    results: matchCues(sentence, RESULT_CUES),
    methods: matchCues(sentence, METHOD_CUES),
    design: [
      ...new Set(
        [...sentence.matchAll(new RegExp(DESIGN_TERMS.source, "giu"))].map(
          (m) => m[0],
        ),
      ),
    ],
    sampleSizes: extractSampleSizes(sentence).map((s) => s.text),
    limitations: matchCues(sentence, LIMITATION_CUES),
    conclusions: matchCues(sentence, CONCLUSION_CUES),
    discussion: matchCues(sentence, DISCUSSION_CUES),
    ownStudy: OWN_STUDY.test(sentence),
    objective: OBJECTIVE.test(sentence),
    hasNumber: /\d/.test(sentence.replace(/\[\d[\d,\s–-]*\]/g, "")),
  };
}

/** Sentences that are never evidence, whatever section they are in. */
export function isNonEvidence(sentence: string): string | null {
  const text = sentence.trim();
  if (words(text) < MIN_WORDS) return "too short";
  if (text.endsWith("?")) return "question";
  if (BOILERPLATE.test(text)) return "caption or boilerplate";
  // Statistics-heavy sentences are fine; rows of bare numbers are not.
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  const visible = text.replace(/\s/g, "").length;
  if (letters / visible < 0.4 || (text.match(/\p{L}{3,}/gu) ?? []).length < 4)
    return "mostly numbers or symbols (table fragment)";
  return null;
}

type Decision = { type: EvidenceTypeValue; prior: number } | null;

const hasStats = (s: SentenceSignals) =>
  s.statistics.length > 0 || s.significance !== null;
const isResult = (s: SentenceSignals) => s.results.length > 0;
const isMethod = (s: SentenceSignals) =>
  s.methods.length > 0 || s.design.length > 0 || s.sampleSizes.length > 0;

function decide(kind: SectionKind | null, s: SentenceSignals): Decision {
  switch (kind) {
    case "REFERENCES":
    case "BACK_MATTER":
    case "INTRODUCTION":
      return null; // background and other people's work, or administrative text
    case "LIMITATIONS":
      return { type: EvidenceType.LIMITATION, prior: 0.6 };
    case "CONCLUSION":
      if (s.limitations.length)
        return { type: EvidenceType.LIMITATION, prior: 0.45 };
      if (s.objective) return null;
      return { type: EvidenceType.CONCLUSION, prior: 0.55 };
    case "METHODS":
      if (s.objective) return null;
      return isMethod(s)
        ? { type: EvidenceType.METHODOLOGY, prior: 0.5 }
        : null;
    case "RESULTS":
      if (s.limitations.length && !hasStats(s))
        return { type: EvidenceType.LIMITATION, prior: 0.35 };
      if (hasStats(s))
        return { type: EvidenceType.STATISTICAL_RESULT, prior: 0.5 };
      if (isResult(s))
        return { type: EvidenceType.EXPERIMENTAL_RESULT, prior: 0.45 };
      return null; // e.g. "Table 2 shows baseline characteristics."
    case "DISCUSSION":
      if (s.limitations.length)
        return { type: EvidenceType.LIMITATION, prior: 0.5 };
      if (s.conclusions.length)
        return { type: EvidenceType.CONCLUSION, prior: 0.45 };
      // Only the authors' interpretation of THEIR results, not reviews of other work.
      if ((s.discussion.length || isResult(s)) && s.ownStudy)
        return { type: EvidenceType.DISCUSSION, prior: 0.4 };
      return null;
    default:
      // Unlabelled abstract, OTHER or no heading at all: cues only.
      if (s.objective && !isResult(s)) return null;
      if (s.limitations.length)
        return { type: EvidenceType.LIMITATION, prior: 0.3 };
      if (s.conclusions.length)
        return { type: EvidenceType.CONCLUSION, prior: 0.3 };
      if (hasStats(s))
        return { type: EvidenceType.STATISTICAL_RESULT, prior: 0.3 };
      if (isResult(s))
        return { type: EvidenceType.EXPERIMENTAL_RESULT, prior: 0.25 };
      if (isMethod(s)) return { type: EvidenceType.METHODOLOGY, prior: 0.25 };
      return null;
  }
}

function supportingSignals(
  type: EvidenceTypeValue,
  s: SentenceSignals,
): [string, number][] {
  const out: [string, number][] = [];
  const add = (
    label: string,
    items: readonly string[],
    weight: number,
    max = 2,
  ) => {
    for (const item of items.slice(0, max))
      out.push([`${label} "${item}"`, weight]);
  };
  switch (type) {
    case EvidenceType.STATISTICAL_RESULT:
      add("statistic", s.statistics, 0.3);
      if (s.significance) add("significance", [s.significance], 0.2, 1);
      add("result cue", s.results, 0.2, 1);
      break;
    case EvidenceType.EXPERIMENTAL_RESULT:
    case EvidenceType.ABSTRACT_FINDING:
      add("result cue", s.results, 0.3);
      add("statistic", s.statistics, 0.2, 1);
      if (s.hasNumber) out.push(["reports a quantity", 0.1]);
      break;
    case EvidenceType.METHODOLOGY:
      add("method cue", s.methods, 0.3);
      add("study design", s.design, 0.3, 1);
      add("sample size", s.sampleSizes, 0.25, 1);
      break;
    case EvidenceType.LIMITATION:
      add("limitation cue", s.limitations, 0.4);
      break;
    case EvidenceType.CONCLUSION:
      add("conclusion cue", s.conclusions, 0.4);
      add("result cue", s.results, 0.15, 1);
      break;
    case EvidenceType.DISCUSSION:
      add("discussion cue", s.discussion, 0.25);
      add("result cue", s.results, 0.15, 1);
      break;
  }
  if (s.ownStudy && type !== EvidenceType.METHODOLOGY)
    out.push(["refers to this study", 0.1]);
  return out;
}

export function classifyEvidenceSentence(
  sentence: string,
  context: {
    sectionKind: SectionKind | null;
    section: string | null;
    availability: EvidenceAvailability;
  },
): EvidenceClassification | null {
  if (isNonEvidence(sentence)) return null;
  const s = detectSignals(sentence);
  const decision = decide(context.sectionKind, s);
  if (!decision) return null;

  // A result stated in an abstract is labelled as an abstract finding.
  const inAbstract =
    context.availability === "ABSTRACT" || context.sectionKind === "ABSTRACT";
  let type = decision.type;
  if (inAbstract && type === EvidenceType.EXPERIMENTAL_RESULT)
    type = EvidenceType.ABSTRACT_FINDING;

  const supporting = supportingSignals(type, s);
  const sectionLabel = context.section
    ? `section "${context.section}"`
    : "no section heading";
  const penalties: Penalty[] = [];
  if (
    !context.sectionKind ||
    context.sectionKind === "OTHER" ||
    context.sectionKind === "ABSTRACT"
  )
    penalties.push({
      reason: "classified from sentence cues only",
      factor: 0.85,
    });
  if (!supporting.length)
    penalties.push({ reason: "no specific cue", factor: 0.75 });
  return {
    evidenceType: type,
    confidence: computeConfidence(
      [decision.prior, ...supporting.map(([, w]) => w)],
      penalties,
    ),
    signals: [
      sectionLabel,
      ...supporting.map(([label]) => label),
      ...penalties.map((p) => p.reason),
    ],
  };
}
