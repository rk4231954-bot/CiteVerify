/** Text helpers for comparing and cleaning bibliographic metadata. */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Decodes the handful of HTML entities that appear in provider metadata. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
      String.fromCodePoint(Number.parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(
      /&([a-z]+);/gi,
      (m, name: string) => ENTITIES[name.toLowerCase()] ?? m,
    );
}

/** Strips JATS/HTML markup (Crossref abstracts and titles), keeping the words. */
export function stripMarkup(text: string): string {
  return decodeEntities(
    text
      .replace(/<jats:title[^>]*>[\s\S]*?<\/jats:title>/gi, " ") // the literal "Abstract" heading
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Rebuilds an abstract from OpenAlex's inverted index ({ word: [positions] }). */
export function invertedIndexToText(
  index: Record<string, number[]> | null | undefined,
): string | null {
  if (!index) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index))
    for (const p of positions) words[p] = word;
  const text = words
    .filter((w) => w !== undefined)
    .join(" ")
    .trim();
  return text || null;
}

/** Comparable title: no markup, accents, case or punctuation. */
export function normalizeTitle(title: string): string {
  return stripMarkup(title)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const bigrams = (s: string) => {
  const out = new Map<string, number>();
  const t = s.replace(/\s+/g, " ");
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
};

/** Sørensen–Dice similarity on character bigrams (0..1). */
export function diceSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const x = bigrams(a);
  const y = bigrams(b);
  let overlap = 0;
  let total = 0;
  for (const [g, n] of x) {
    overlap += Math.min(n, y.get(g) ?? 0);
    total += n;
  }
  for (const n of y.values()) total += n;
  return total ? (2 * overlap) / total : 0;
}

/**
 * Title similarity: 1 for identical normalised titles, 0.92 when one title is
 * the other plus a subtitle (≥ 4 shared words), otherwise bigram similarity.
 */
export function titleSimilarity(a: string, b: string): number {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (
    short.split(" ").length >= 4 &&
    (long.startsWith(`${short} `) || long.endsWith(` ${short}`))
  )
    return 0.92;
  return Math.round(diceSimilarity(x, y) * 100) / 100;
}

/** Surname of a provider author string: "Smith, John" → "Smith"; "John A. Smith" → "Smith". */
export function providerSurname(author: string): string {
  const a = author.trim();
  if (a.includes(",")) return a.split(",")[0]?.trim() ?? a;
  return a.split(/\s+/).pop() ?? a;
}

export const surnameKey = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}]/gu, "");

export const wordCount = (text: string) =>
  normalizeTitle(text).split(" ").filter(Boolean).length;
