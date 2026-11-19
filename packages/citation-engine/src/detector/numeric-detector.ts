/**
 * Numeric in-text citations: [1], [1, 2], [1–3], [1, 3, 5], [2,4-6].
 *
 * Guarding against non-citations:
 * - only 1–3 digit positive integers (so "[2020]" and "[0.5, 1]" are ignored);
 * - ranges must ascend and span at most MAX_RANGE items;
 * - array/matrix indexing such as "x[1]" or "a[2][3]" is ignored;
 * - two-number intervals after "=", "∈", "range", "interval"… ("x ∈ [1, 10]") are ignored.
 */
import type {
  NumericTarget,
  RawCitationMarker,
} from "../types/citation.types.ts";

const BRACKET = /\[([^[\]]{1,80})\]/g;
const ITEM = /^(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?$/;
const MAX_RANGE = 50;
/** Text just before "[a, b]" that marks it as a numeric interval, not a citation. */
const INTERVAL_OPERATOR = /[=∈≤≥<>]\s*$/;
const INTERVAL_WORD = /\b(?:intervals?|ranges?|domain|scale|bounded by)\b/i;

/** Parses the inside of a bracket into cited numbers, or null when it is not a citation list. */
export function parseNumericList(inner: string): number[] | null {
  const parts = inner.split(/\s*[,;]\s*/);
  const numbers: number[] = [];
  for (const part of parts) {
    const m = part.trim().match(ITEM);
    if (!m) return null;
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : Number(m[2]);
    if (from < 1 || to < from || to - from > MAX_RANGE) return null;
    for (let n = from; n <= to; n++) if (!numbers.includes(n)) numbers.push(n);
  }
  return numbers.length ? numbers : null;
}

function looksLikeIndexing(text: string, start: number, end: number): boolean {
  const before = text[start - 1] ?? "";
  const after = text[end] ?? "";
  if (after === "[" || before === "]") return true; // a[1][2]
  if (/[\p{L}\p{N}_]/u.test(before)) {
    // "x[1]" / "A1[2]" (short identifier glued to the bracket) or "v[1] = 3"
    const token = text.slice(0, start).match(/[\p{L}\p{N}_]+$/u)?.[0] ?? "";
    return token.length <= 2 || /^\s*[=+\-*/^]/.test(text.slice(end));
  }
  return false;
}

export function detectNumericCitations(text: string): RawCitationMarker[] {
  const markers: RawCitationMarker[] = [];
  for (const match of text.matchAll(BRACKET)) {
    const start = match.index;
    const end = start + match[0].length;
    const numbers = parseNumericList(match[1] ?? "");
    if (!numbers) continue;
    if (looksLikeIndexing(text, start, end)) continue;
    if (numbers.length === 2 && (match[1] ?? "").includes(",")) {
      const before = text.slice(Math.max(0, start - 25), start);
      if (INTERVAL_OPERATOR.test(before) || INTERVAL_WORD.test(before))
        continue;
    }
    markers.push({
      text: match[0],
      start,
      end,
      format: "NUMERIC",
      targets: numbers.map((number) => ({
        key: String(number),
        target: { kind: "NUMERIC", number } satisfies NumericTarget,
      })),
    });
  }
  return markers;
}
