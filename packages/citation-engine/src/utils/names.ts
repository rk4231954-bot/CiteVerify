/** Name handling shared by the detectors, the reference parser and the matcher. */

/** Lowercase name particles that may precede a surname ("van der Berg"). */
export const PARTICLES = [
  "van",
  "von",
  "der",
  "den",
  "de",
  "del",
  "della",
  "di",
  "da",
  "du",
  "dos",
  "le",
  "la",
  "ter",
  "ten",
];
const PARTICLE_PREFIX = new RegExp(`^(?:(?:${PARTICLES.join("|")})\\s+)+`, "i");

/** Regex source for one surname: optional particles + a capitalised word containing a lowercase letter. */
export const SURNAME_SOURCE = `(?:(?:${PARTICLES.join("|")})\\s+)*\\p{Lu}[\\p{L}'’\\-]*\\p{Ll}[\\p{L}'’\\-]*`;

/** Capitalised words that look like surnames but start non-citation parentheticals. */
export const NON_AUTHOR_WORDS = new Set([
  "the",
  "this",
  "these",
  "that",
  "those",
  "in",
  "on",
  "at",
  "by",
  "for",
  "from",
  "since",
  "until",
  "during",
  "table",
  "tables",
  "figure",
  "figures",
  "fig",
  "figs",
  "eq",
  "equation",
  "equations",
  "section",
  "chapter",
  "appendix",
  "supplement",
  "supplementary",
  "panel",
  "step",
  "phase",
  "wave",
  "version",
  "model",
  "study",
  "survey",
  "report",
  "data",
  "dataset",
  "census",
  "year",
  "years",
  "spring",
  "summer",
  "autumn",
  "fall",
  "winter",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
  "approximately",
  "about",
  "around",
  "circa",
  "before",
  "after",
  "between",
  "and",
  "or",
  "see",
  "also",
  "ref",
  "refs",
]);

export function isNonAuthorWord(word: string): boolean {
  return NON_AUTHOR_WORDS.has(word.toLowerCase().replace(/[.’']/g, ""));
}

/** Comparable form of a surname: no diacritics, lowercase, letters only. */
export function surnameKey(
  name: string,
  { dropParticles = false } = {},
): string {
  let value = name.normalize("NFD").replace(/\p{M}/gu, "");
  if (dropParticles) value = value.replace(PARTICLE_PREFIX, "");
  return value.toLowerCase().replace(/[^\p{L}]/gu, "");
}

const INITIALS = /^(?:\p{Lu}\.?[\s-]*){1,4}$/u;

/**
 * Surname of one bibliography author string, as written:
 * "Smith, J." → "Smith"; "J. A. Smith" → "Smith"; "Smith JA" → "Smith";
 * "van der Berg, K." → "van der Berg". Returns null when no surname is visible.
 */
export function surnameOf(author: string): string | null {
  const a = author.trim().replace(/[.,;]+$/, "");
  if (!a) return null;
  if (a.includes(",")) {
    const [head = ""] = a.split(",");
    return /\p{Ll}/u.test(head) ? head.trim() : null;
  }
  const words = a.split(/\s+/);
  // Vancouver: "Smith JA" — surname first, uppercase initials last.
  const last = words[words.length - 1] ?? "";
  if (words.length >= 2 && /^\p{Lu}{1,4}$/u.test(last))
    return words.slice(0, -1).join(" ");
  // "J. A. Smith" / "J.A. van der Berg": drop leading initials.
  let i = 0;
  while (i < words.length - 1 && INITIALS.test(words[i] ?? "")) i++;
  const rest = words.slice(i).join(" ");
  return /\p{Ll}/u.test(rest) ? rest : null;
}

export const isInitials = (token: string) => INITIALS.test(token.trim());

/** Levenshtein distance, capped for speed (returns cap+1 when exceeded). */
export function editDistance(a: string, b: string, cap = 2): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur.push(
        Math.min(
          (prev[j] ?? 0) + 1,
          (cur[j - 1] ?? 0) + 1,
          (prev[j - 1] ?? 0) + cost,
        ),
      );
    }
    prev = cur;
  }
  return prev[b.length] ?? cap + 1;
}
