/**
 * @citeverify/citation-engine — in-text citation detection, bibliography
 * parsing, citation→reference matching, DOI normalisation and claim↔citation
 * mapping. Fully offline: no publication metadata is fetched here.
 */
import { CitationMatchStatus } from "@citeverify/shared";
import { detectAuthorYearCitations } from "./detector/author-year-detector.ts";
import { detectNumericCitations } from "./detector/numeric-detector.ts";
import {
  mapClaimsToCitations,
  summarizeClaimMappings,
} from "./mapper/claim-citation-mapper.ts";
import { matchCitations } from "./matcher/citation-matcher.ts";
import { extractReferences } from "./parser/reference-parser.ts";
import type {
  CitationAnalysis,
  ClaimInput,
  DetectedCitation,
  SourceParagraph,
} from "./types/citation.types.ts";

export type DetectCitationsResult = {
  citations: DetectedCitation[];
  markers: number;
  duplicatesRemoved: number;
};

/** Finds in-text citations in every paragraph outside the bibliography. */
export function detectCitations(
  documentId: string,
  paragraphs: readonly SourceParagraph[],
  skipParagraphIds: ReadonlySet<string> = new Set(),
): DetectCitationsResult {
  const citations: DetectedCitation[] = [];
  const seen = new Set<string>();
  let markers = 0;
  let duplicatesRemoved = 0;
  for (const p of [...paragraphs].sort((a, b) => a.order - b.order)) {
    if (skipParagraphIds.has(p.id)) continue;
    const found = [
      ...detectNumericCitations(p.cleanedText),
      ...detectAuthorYearCitations(p.cleanedText),
    ].sort((a, b) => a.start - b.start);
    for (const marker of found) {
      markers++;
      for (const { key, target } of marker.targets) {
        // The same item twice in one marker ("(Doe, 2020; Doe, 2020)") is one citation.
        const dedupKey = `${p.id}:${marker.start}:${key}`;
        if (seen.has(dedupKey)) {
          duplicatesRemoved++;
          continue;
        }
        seen.add(dedupKey);
        citations.push({
          id: crypto.randomUUID(),
          documentId,
          format: marker.format,
          citationText: marker.text,
          citationKey: key,
          target,
          paragraphId: p.id,
          pageNumber: p.pageNumber,
          section: p.section,
          start: marker.start,
          end: marker.end,
        });
      }
    }
  }
  return { citations, markers, duplicatesRemoved };
}

export type AnalyzeCitationsInput = {
  documentId: string;
  extraction: { paragraphs: readonly SourceParagraph[] };
  /** Existing claims (e.g. from @citeverify/claim-extractor) to map citations onto. */
  claims?: readonly ClaimInput[];
};

/** Full pipeline: bibliography → in-text citations → matching → claim mapping. */
export function analyzeCitations({
  documentId,
  extraction,
  claims = [],
}: AnalyzeCitationsInput): CitationAnalysis {
  const { paragraphs } = extraction;
  const warnings: string[] = [];

  const refs = extractReferences(documentId, paragraphs);
  if (!refs.references.length)
    warnings.push(
      "No bibliography section (References, Bibliography, Works Cited, Literature Cited) was found",
    );

  const detected = detectCitations(
    documentId,
    paragraphs,
    refs.bibliographyParagraphIds,
  );
  const matches = matchCitations(detected.citations, refs.references);
  const links = mapClaimsToCitations(claims, paragraphs, detected.citations);
  const claimMappings = summarizeClaimMappings(
    claims,
    links,
    detected.citations,
    matches,
  );

  const numeric = detected.citations.filter(
    (c) => c.format === "NUMERIC",
  ).length;
  if (numeric && refs.style === "AUTHOR_YEAR")
    warnings.push(
      "Numeric citations found, but the bibliography is not numbered; matches by position need review",
    );

  const count = (status: string) =>
    matches.filter((m) => m.status === status).length;
  const cited = new Set(
    matches.flatMap((m) => (m.referenceId ? [m.referenceId] : [])),
  );

  return {
    citations: detected.citations,
    references: refs.references,
    matches,
    links,
    claimMappings,
    stats: {
      paragraphsScanned: paragraphs.length - refs.bibliographyParagraphIds.size,
      bibliographyParagraphs: refs.bibliographyParagraphIds.size,
      markers: detected.markers,
      citations: detected.citations.length,
      duplicateCitationsRemoved: detected.duplicatesRemoved,
      references: refs.references.length,
      duplicateReferencesRemoved: refs.duplicatesRemoved,
      matched: count(CitationMatchStatus.MATCHED),
      ambiguous: count(CitationMatchStatus.AMBIGUOUS),
      unmatched: count(CitationMatchStatus.UNMATCHED),
      needsReview: count(CitationMatchStatus.NEEDS_REVIEW),
      uncitedReferences: refs.references.filter((r) => !cited.has(r.id)).length,
      claimsWithCitations: claimMappings.filter(
        (m) => m.status !== "NO_CITATION",
      ).length,
      claimLinks: links.length,
    },
    warnings,
  };
}

export { detectAuthorYearCitations } from "./detector/author-year-detector.ts";
export {
  detectNumericCitations,
  parseNumericList,
} from "./detector/numeric-detector.ts";
export {
  LINK_CONFIDENCE,
  mapClaimsToCitations,
  summarizeClaimMappings,
} from "./mapper/claim-citation-mapper.ts";
export {
  MATCH_THRESHOLD,
  matchCitation,
  matchCitations,
  scoreAuthorYear,
  surnameSimilarity,
} from "./matcher/citation-matcher.ts";
export {
  extractReferences,
  findBibliography,
  isBibliographyHeading,
  parseReferenceFields,
  referenceFingerprint,
  splitAuthors,
} from "./parser/reference-parser.ts";
export {
  doiToUrl,
  extractDois,
  isValidDoi,
  normalizeDoi,
} from "./resolver/doi-resolver.ts";
export * from "./schemas/citation.schema.ts";
export * from "./types/citation.types.ts";
export { surnameOf } from "./utils/names.ts";
