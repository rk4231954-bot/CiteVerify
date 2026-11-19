/**
 * Sentence splitting tuned for scientific prose. Returns exact substrings of
 * the input (with offsets), so a claim's text can always be traced back to
 * its paragraph.
 */

/** Abbreviations whose trailing period does not end a sentence (lowercased, no period). */
const ABBREVIATIONS = new Set([
  "al",
  "approx",
  "ca",
  "cf",
  "ch",
  "co",
  "dept",
  "dr",
  "e.g",
  "eg",
  "eq",
  "eqs",
  "esp",
  "est",
  "etc",
  "fig",
  "figs",
  "i.e",
  "ie",
  "inc",
  "jr",
  "ltd",
  "mr",
  "mrs",
  "ms",
  "no",
  "nos",
  "pp",
  "prof",
  "ref",
  "refs",
  "resp",
  "sec",
  "sect",
  "sr",
  "st",
  "suppl",
  "tab",
  "viz",
  "vol",
  "vs",
]);

export type Sentence = { text: string; start: number; end: number };

function isAbbreviation(text: string, dotIndex: number): boolean {
  const before = text.slice(0, dotIndex);
  const token = before.slice(before.search(/\S+$/)).replace(/^[([{"'“‘]+/, "");
  if (!token) return false;
  if (/^\p{Lu}$/u.test(token)) return true; // initial, e.g. "J. Doe"
  return ABBREVIATIONS.has(token.toLowerCase());
}

/** Splits text into sentences at . ! ? followed by whitespace and an uppercase letter, digit, or bracket. */
export function splitSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  let start = 0;
  const push = (end: number) => {
    const raw = text.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed)
      sentences.push({
        text: trimmed,
        start: start + lead,
        end: start + lead + trimmed.length,
      });
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    // Absorb closing quotes/brackets after the terminator: 'said "yes."' / '(see above.)'
    let end = i + 1;
    while (end < text.length && /["'”’)\]]/.test(text[end] ?? "")) end++;
    if (end >= text.length) break;
    if (!/\s/.test(text[end] ?? "")) continue; // "0.05", "e.g.,", "U.S.A"
    const next = text.slice(end).trimStart()[0] ?? "";
    if (!/[\p{Lu}\p{N}([“"'‘]/u.test(next)) continue;
    if (ch === "." && isAbbreviation(text, i)) continue;
    push(end);
    start = end;
  }
  push(text.length);
  return sentences;
}
