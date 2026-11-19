/**
 * Extracts sample sizes, statistics, design terms and study conditions from an
 * evidence passage. Every value is copied verbatim from the passage — nothing
 * is computed, converted or inferred.
 */
import type {
  EvidenceDetails,
  StatisticKind,
} from "../types/evidence.types.ts";
import {
  allMatches,
  CONDITION_PATTERNS,
  DESIGN_TERMS,
  SAMPLE_SIZE_PATTERNS,
  STATISTIC_PATTERNS,
} from "./patterns.ts";

const uniq = <T>(items: T[], key: (t: T) => string) => {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = key(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

export function extractStatistics(
  text: string,
): { kind: StatisticKind; text: string }[] {
  const spans: {
    kind: StatisticKind;
    text: string;
    start: number;
    end: number;
  }[] = [];
  for (const [kind, pattern] of STATISTIC_PATTERNS) {
    for (const m of allMatches(text, pattern)) {
      const start = m.index;
      const end = start + m[0].length;
      // A percentage inside a CI ("95% CI") or a larger statistic is not reported separately.
      if (spans.some((s) => start < s.end && end > s.start)) continue;
      spans.push({ kind, text: m[0].trim(), start, end });
    }
  }
  return uniq(
    spans.sort((a, b) => a.start - b.start),
    (s) => `${s.kind}:${s.text}`,
  ).map(({ kind, text }) => ({ kind, text }));
}

export function extractSampleSizes(
  text: string,
): { value: number; text: string }[] {
  const out: { value: number; text: string }[] = [];
  for (const pattern of SAMPLE_SIZE_PATTERNS) {
    for (const m of allMatches(text, pattern)) {
      const raw = m[1];
      if (!raw) continue;
      const value = Number(raw.replace(/,/g, ""));
      // A four-digit number followed by a noun is more often a year ("2019 patients" is rare).
      if (
        !Number.isSafeInteger(value) ||
        (/^(?:19|20)\d{2}$/.test(raw) && !/=/.test(m[0]))
      )
        continue;
      out.push({ value, text: m[0].trim() });
    }
  }
  return uniq(out, (s) => s.text);
}

export function extractDetails(
  text: string,
): Omit<EvidenceDetails, "location" | "signals"> {
  return {
    sampleSizes: extractSampleSizes(text),
    statistics: extractStatistics(text),
    studyDesign: uniq(
      allMatches(text, DESIGN_TERMS).map((m) => m[0]),
      (s) => s.toLowerCase(),
    ),
    conditions: uniq(
      CONDITION_PATTERNS.flatMap((p) =>
        allMatches(text, p).map((m) => m[0].trim()),
      ),
      (s) => s.toLowerCase(),
    ),
  };
}
