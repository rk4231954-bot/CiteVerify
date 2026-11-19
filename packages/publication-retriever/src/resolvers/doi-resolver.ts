/**
 * DOI handling for retrieval. Syntax rules come from @citeverify/citation-engine
 * (normalizeDoi / extractDois) so references and publications use one format.
 */
import {
  doiToUrl,
  extractDois,
  normalizeDoi,
} from "@citeverify/citation-engine";

export { doiToUrl, extractDois, normalizeDoi };

/** A reference's DOI if it is valid, else the first DOI written in its raw text, else null. */
export function resolveReferenceDoi(ref: {
  doi: string | null;
  rawText: string;
}): string | null {
  const fromField = ref.doi ? normalizeDoi(ref.doi) : null;
  return fromField ?? extractDois(ref.rawText)[0] ?? null;
}

/** OpenAlex writes DOIs as "https://doi.org/10.…"; returns the bare normalised DOI. */
export const doiFromUrl = (value: string | null | undefined): string | null =>
  value ? normalizeDoi(value) : null;

/** Path segment for a DOI in a REST URL (the "/" stays literal; everything else is encoded). */
export const encodeDoiPath = (doi: string) =>
  doi.split("/").map(encodeURIComponent).join("/");
