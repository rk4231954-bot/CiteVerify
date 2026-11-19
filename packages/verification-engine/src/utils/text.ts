import { contentTokens, stem } from "@citeverify/evidence-extractor";

/** Population words are scope, not outcome: "older adults" must not count as the outcome. */
const POPULATION_STEMS = new Set(
  "older adult adults elderly children child women woman men infant infants adolescent adolescents mice mouse rat rats people person persons individual individuals healthy aged young year years human humans subject subjects volunteer volunteers"
    .split(" ")
    .map(stem),
);

export const tokenSet = (text: string) => new Set(contentTokens(text));

export const withoutPopulation = (terms: readonly string[]) =>
  terms.filter((t) => !POPULATION_STEMS.has(t));

/** Share of `terms` present in `tokens` (1 when there are no terms). */
export function coverage(
  terms: readonly string[],
  tokens: ReadonlySet<string>,
) {
  if (!terms.length) return 1;
  return terms.filter((t) => tokens.has(t)).length / terms.length;
}

/** Character offsets of each content token, for proximity checks. */
export function tokenPositions(
  text: string,
): { token: string; index: number }[] {
  const out: { token: string; index: number }[] = [];
  for (const m of text.toLowerCase().matchAll(/[\p{L}][\p{L}\p{N}-]*/gu)) {
    for (const t of contentTokens(m[0])) out.push({ token: t, index: m.index });
  }
  return out;
}

export const round = (value: number, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

export const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

export function truncate(text: string, max = 80) {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
