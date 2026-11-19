/**
 * Claim normalisation for display, deduplication, and later matching.
 *
 * Allowed: whitespace and quote-style normalisation, removing citation
 * markers ("[1]", "[2–4]", "(Doe et al., 2021)"), and dropping a leading
 * discourse connective ("However, …").
 *
 * Never allowed: changing numbers, units, symbols, or wording. A safety check
 * compares every numeric token before and after; on any mismatch the
 * whitespace-normalised original is returned instead.
 */

const NUMERIC_CITATION = /\s*\[\d+(?:\s*[-–,]\s*\d+)*\]/g;
const AUTHOR_YEAR_CITATION =
  /\s*\((?:(?:e\.g\.|see|cf\.)[,\s]+)?(?:\p{Lu}[\p{L}'’-]+(?:\s+(?:et al\.|and|&)(?:\s+\p{Lu}[\p{L}'’-]+)?)?,?\s+\d{4}[a-z]?(?:\s*[;,]\s*)?)+\)/gu;
const LEADING_CONNECTIVE =
  /^(?:however|moreover|furthermore|in addition|additionally|notably|importantly|interestingly|consequently|thus|therefore|hence|overall|finally|similarly|likewise|in contrast|conversely|in particular|specifically),\s+/i;
const NUMBER_TOKEN = /\d+(?:[.,]\d+)*/g;

export function stripCitationMarkers(text: string): string {
  return text.replace(NUMERIC_CITATION, "").replace(AUTHOR_YEAR_CITATION, "");
}

/** True when the sentence contains an in-text citation marker. */
export function hasCitationMarker(text: string): boolean {
  return (
    new RegExp(NUMERIC_CITATION.source).test(text) ||
    new RegExp(AUTHOR_YEAR_CITATION.source, "u").test(text)
  );
}

const collapse = (text: string) =>
  text.normalize("NFC").replace(/\s+/g, " ").trim();
const numbers = (text: string) => (text.match(NUMBER_TOKEN) ?? []).join("|");

export function normalizeClaimText(sentence: string): string {
  const base = collapse(sentence);
  const normalized = collapse(
    stripCitationMarkers(base)
      .replace(/[“”„]/g, '"')
      .replace(/[‘’‚]/g, "'")
      .replace(LEADING_CONNECTIVE, "")
      .replace(/\s+([.,;:!?])/g, "$1"), // "sleep [1]." → "sleep ." → "sleep."
  );
  // Safety net: every number outside citation markers must survive unchanged.
  if (
    !normalized ||
    numbers(normalized) !== numbers(stripCitationMarkers(base))
  )
    return base;
  return normalized;
}

/** Coarse key for duplicate detection: case/punctuation-insensitive, values kept. */
export function claimFingerprint(normalizedText: string): string {
  return normalizedText
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%.<>=±×−-]+/gu, " ")
    .replace(/\.(?=\s|$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
