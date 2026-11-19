/** Tokenisation helpers for lexical relevance matching (no external NLP dependency). */

const STOPWORDS = new Set(
  `a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each either et al etc few for from further had has have having here how however i if in into is it its itself just may might more most much must my no nor not of off on once only or other our out over own per same should so some such than that the their them then there these they this those through thus to too under until up upon us very via was we were what when where whether which while who whom why will with within without would yet you your
  study studies result results showed show shows shown found find finding findings observed suggest suggests suggested data analysis analyses reported report reports evidence using used use based effect effects among compared versus vs respectively significant significantly statistically overall total group groups participant participants patient patients subject subjects`
    .split(/\s+/)
    .filter(Boolean),
);

/** Very light suffix stripping so "reduces"/"reduced"/"reduction" meet at "reduc". */
export function stem(word: string): string {
  let w = word;
  if (w.length <= 4) return w;
  for (const [suffix, replacement] of [
    ["ational", "ate"],
    ["ization", "ize"],
    ["isation", "ize"],
    ["iveness", "ive"],
    ["fulness", "ful"],
    ["ousness", "ous"],
    ["ations", ""],
    ["ation", ""],
    ["ments", ""],
    ["ment", ""],
    ["ities", ""],
    ["ity", ""],
    ["ness", ""],
    ["ings", ""],
    ["ing", ""],
    ["ions", ""],
    ["ion", ""],
    ["ies", "y"],
    ["ied", "y"],
    ["ed", ""],
    ["es", ""],
    ["ly", ""],
    ["s", ""],
  ] as const) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 4) {
      w = w.slice(0, w.length - suffix.length) + replacement;
      break;
    }
  }
  return w.endsWith("e") && w.length > 4 ? w.slice(0, -1) : w;
}

export const fold = (text: string) =>
  text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Content tokens (stopwords removed, stemmed). Hyphenated terms are kept whole and split. */
export function contentTokens(text: string): string[] {
  const out: string[] = [];
  for (const raw of fold(text).match(
    /[\p{L}][\p{L}\p{N}]*(?:-[\p{L}\p{N}]+)*/gu,
  ) ?? []) {
    const parts = raw.includes("-")
      ? [raw.replace(/-/g, ""), ...raw.split("-")]
      : [raw];
    for (const p of parts)
      if (p.length > 2 && !STOPWORDS.has(p)) out.push(stem(p));
  }
  return out;
}

/** Numbers with an optional unit, normalised ("30 min" → "30 min", "2,400" → "2400"). */
export function numericExpressions(text: string): string[] {
  const out: string[] = [];
  const re =
    /(?<![\p{L}\d.])(-?\d{1,3}(?:,\d{3})+|-?\d+(?:[.·]\d+)?)\s*(%|percent|mg|g|kg|µg|mcg|ml|l|iu|mmhg|mmol|kcal|years?|yrs?|weeks?|wks?|days?|months?|hours?|hrs?|h|minutes?|mins?|min|fold|times)?(?![\p{L}])/giu;
  for (const m of fold(text).matchAll(re)) {
    const value = (m[1] ?? "").replace(/,/g, "").replace("·", ".");
    if (!value || /^(?:19|20)\d{2}$/.test(value)) continue; // years are dates, not quantities
    const unit = (m[2] ?? "")
      .replace(/^percent$/, "%")
      .replace(/^(year|week|day|month|hour|minute)s?$/, "$1")
      .replace(/^(?:yrs?)$/, "year")
      .replace(/^(?:wks?)$/, "week")
      .replace(/^(?:hrs?|h)$/, "hour")
      .replace(/^(?:mins?|min)$/, "minute");
    out.push(unit ? `${value} ${unit}` : value);
  }
  return out;
}

export function charTrigrams(text: string): Map<string, number> {
  const s = ` ${fold(text)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `;
  const grams = new Map<string, number>();
  for (let i = 0; i + 3 <= s.length; i++) {
    const g = s.slice(i, i + 3);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  return grams;
}

export function diceOf(a: Map<string, number>, b: Map<string, number>): number {
  let inter = 0;
  let total = 0;
  for (const [g, n] of a) {
    inter += Math.min(n, b.get(g) ?? 0);
    total += n;
  }
  for (const n of b.values()) total += n;
  return total ? (2 * inter) / total : 0;
}
