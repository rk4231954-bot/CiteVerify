/**
 * Reusable text-cleaning utilities.
 *
 * Design rule: fix extraction artifacts, never change meaning. In particular
 * we use NFC (not NFKC) normalisation, because NFKC would turn "x²" into "x2"
 * and "½" into "1⁄2". Scientific notation, math symbols (± × ≤ ≥ ∑ μ α),
 * numbers, citation markers like [12] or (Doe et al., 2020), URLs and DOIs are
 * left untouched.
 */

/** Typographic ligatures that PDF fonts commonly emit as single code points. */
const LIGATURES: Record<string, string> = {
  "\uFB00": "ff",
  "\uFB01": "fi",
  "\uFB02": "fl",
  "\uFB03": "ffi",
  "\uFB04": "ffl",
  "\uFB05": "st",
  "\uFB06": "st",
};

/** Non-standard spaces (NBSP, en/em/thin spaces, ideographic space…) → regular space. */
const UNICODE_SPACES = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;
/** Invisible characters: zero-width space, word joiner, BOM (soft hyphen is handled separately). */
const INVISIBLE = /[\u200B\u2060\uFEFF]/g;
/** C0/C1 control characters except tab and newline. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matching control characters to strip them
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const SOFT_HYPHEN = "\u00AD";

/**
 * Word starts that usually form genuine hyphenated compounds ("self-reported",
 * "well-known"). When a line ends with one of these + "-", the hyphen is kept.
 */
const COMPOUND_PREFIXES = new Set([
  "anti",
  "co",
  "cross",
  "dose",
  "double",
  "evidence",
  "follow",
  "high",
  "inter",
  "intra",
  "long",
  "low",
  "meta",
  "multi",
  "non",
  "peer",
  "post",
  "pre",
  "quasi",
  "re",
  "self",
  "semi",
  "short",
  "single",
  "sub",
  "time",
  "well",
  "age",
  "sex",
  "state",
  "large",
  "small",
]);

/** NFC + ligature expansion + space/invisible/control-character cleanup. */
export function normalizeUnicode(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\uFB00-\uFB06]/g, (ch) => LIGATURES[ch] ?? ch)
    .replace(UNICODE_SPACES, " ")
    .replace(INVISIBLE, "")
    .replace(CONTROL_CHARS, "")
    .replace(/\r\n?/g, "\n");
}

/** Collapses runs of spaces/tabs and trims each line; keeps line breaks. */
export function collapseWhitespace(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n");
}

/** Collapses 3+ consecutive line breaks to a single blank line. */
export function collapseLineBreaks(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Joins lines that were wrapped by layout, repairing words split across lines.
 *
 * - Soft hyphen at a line end → always joined ("exam­|ple" → "example").
 * - Hard hyphen at a line end → joined without the hyphen only when it's safe:
 *   the next line starts lowercase, the left fragment is a plain word that isn't a common compound
 *   prefix, and the token doesn't look like a URL/DOI/identifier. Otherwise the
 *   hyphen is kept ("self-|reported" → "self-reported", DOI "10.1/ab-|cd" kept).
 * - Any other line break becomes a single space.
 */
export function joinWrappedLines(lines: readonly string[]): string {
  let out = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!out) {
      out = line;
      continue;
    }
    if (out.endsWith(SOFT_HYPHEN)) {
      out = out.slice(0, -1) + line;
      continue;
    }
    if (out.endsWith("-") && !out.endsWith("--")) {
      const leftToken = out.slice(out.lastIndexOf(" ") + 1, -1);
      const rightStartsLower = /^\p{Ll}{2,}/u.test(line);
      const leftIsPlainWord = /^\p{Lu}?\p{Ll}+$/u.test(leftToken); // letters only, e.g. "exam" or "Exam"
      if (
        rightStartsLower &&
        leftIsPlainWord &&
        !COMPOUND_PREFIXES.has(leftToken.toLowerCase())
      ) {
        out = out.slice(0, -1) + line; // broken word
      } else {
        out += line; // real hyphen (compound, identifier, DOI): keep it, no space
      }
      continue;
    }
    out += ` ${line}`;
  }
  return out;
}

/** Removes soft hyphens that remain mid-line (they are invisible formatting hints). */
export function stripSoftHyphens(text: string): string {
  return text.replaceAll(SOFT_HYPHEN, "");
}

/**
 * Full cleaning pipeline for one paragraph of extracted text. Line breaks are
 * treated as layout wrapping and joined; the result is a single line.
 */
export function cleanText(text: string): string {
  const normalized = collapseWhitespace(normalizeUnicode(text));
  return stripSoftHyphens(joinWrappedLines(normalized.split("\n")))
    .replace(/ {2,}/g, " ")
    .trim();
}

/** Cleans text but keeps paragraph breaks (blank lines); for multi-paragraph strings. */
export function cleanMultilineText(text: string): string {
  return collapseLineBreaks(
    collapseLineBreaks(collapseWhitespace(normalizeUnicode(text)))
      .split(/\n{2,}/)
      .map(cleanText)
      .filter(Boolean)
      .join("\n\n"),
  );
}

/** True when the text has no letters or digits (e.g. only bullets or punctuation). */
export function isEffectivelyEmpty(text: string): boolean {
  return !/[\p{L}\p{N}]/u.test(text);
}

export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}
