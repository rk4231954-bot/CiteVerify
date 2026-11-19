import type { ParsedReference, SourceParagraph } from "../src/index.ts";

let n = 0;
/** A synthetic paragraph; cleanedText = text, originalText keeps "\n" line breaks. */
export function para(
  text: string,
  section: string | null = "Introduction",
  pageNumber: number | null = 1,
): SourceParagraph {
  n++;
  return {
    id: `p${n}`,
    order: n,
    originalText: text,
    cleanedText: text.replace(/\n/g, " "),
    pageNumber,
    section,
  };
}

export function ref(
  partial: Partial<ParsedReference> & { authors: string[] },
): ParsedReference {
  return {
    id: crypto.randomUUID(),
    documentId: "d",
    rawText: partial.rawText ?? partial.authors.join(", "),
    label: null,
    authorsTruncated: false,
    title: null,
    year: null,
    yearSuffix: null,
    venue: null,
    doi: null,
    url: null,
    paragraphId: "bib",
    pageNumber: null,
    position: 0,
    fingerprint: crypto.randomUUID(),
    ...partial,
  };
}
