/**
 * DOI detection and normalisation — purely syntactic, no network access.
 *
 * "Resolution" here means turning any DOI notation (bare, `doi:` prefix,
 * doi.org / dx.doi.org link, URL-encoded) into one canonical form and its
 * resolver URL. Fetching publication metadata is a separate, later stage.
 * A DOI is only ever returned when it is present in the input text.
 */

/** Crossref-recommended shape: "10." + registrant code + "/" + suffix. */
const DOI_SHAPE = /^10\.\d{4,9}(?:\.\d+)*\/\S+$/;
const PREFIXES =
  /^(?:(?:https?:\/\/)?(?:dx\.|www\.)?doi\.org\/|urn:doi:|doi:\s*|doi\s+)/i;
/** Finds DOI candidates in running text (with or without a prefix). */
const DOI_IN_TEXT =
  /(?:https?:\/\/(?:dx\.|www\.)?doi\.org\/|\bdoi:\s*|\bDOI\s+)?\b(10\.\d{4,9}(?:\.\d+)*\/[^\s"<>]+)/gi;
const TRAILING_PUNCT = /[.,;:'"’”]+$/;

/** Removes trailing sentence punctuation and unbalanced closing brackets. */
function trimTrailing(doi: string): string {
  let out = doi.replace(TRAILING_PUNCT, "");
  for (const [open, close] of [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
    ["<", ">"],
  ] as const) {
    while (
      out.endsWith(close) &&
      out.split(close).length > out.split(open).length
    ) {
      out = out.slice(0, -1).replace(TRAILING_PUNCT, "");
    }
  }
  return out;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Normalises a DOI written in any common notation. Returns null when the
 * input is not a syntactically valid DOI. DOIs are case-insensitive, so the
 * canonical form is lowercase.
 */
export function normalizeDoi(input: string): string | null {
  let value = input.trim().replace(PREFIXES, "");
  value = trimTrailing(safeDecode(value).trim());
  if (!DOI_SHAPE.test(value)) return null;
  return value.toLowerCase();
}

export const isValidDoi = (input: string): boolean =>
  normalizeDoi(input) !== null;

/** All distinct DOIs that appear in `text`, normalised, in order of appearance. */
export function extractDois(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(DOI_IN_TEXT)) {
    const doi = normalizeDoi(match[1] ?? "");
    if (doi && !found.includes(doi)) found.push(doi);
  }
  return found;
}

/** The doi.org resolver URL for a DOI (no request is made). */
export function doiToUrl(doi: string): string | null {
  const normalized = normalizeDoi(doi);
  if (!normalized) return null;
  // Encode each path segment, keeping the "/" separators readable.
  return `https://doi.org/${normalized.split("/").map(encodeURIComponent).join("/")}`;
}
