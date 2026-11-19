/**
 * Claim ↔ citation mapping by sentence-level proximity.
 *
 * Citations are NOT spread over every claim in a paragraph:
 *  - LINKED (0.9)        the marker is inside the claim sentence;
 *  - LINKED (0.8)        a bracket/parenthesis marker directly follows it ("… rate. [3]");
 *  - NEEDS_REVIEW (0.35) the claim sentence cites nothing and the very next
 *                        sentence does — the citation may cover both.
 * A link means the citation is attached to the claim's text, never that the
 * cited work supports the claim.
 */
import { splitSentences } from "@citeverify/claim-extractor";
import { CitationMatchStatus, ClaimCitationStatus } from "@citeverify/shared";
import type {
  CitationMatch,
  ClaimCitationLink,
  ClaimCitationMapping,
  ClaimInput,
  DetectedCitation,
  SourceParagraph,
} from "../types/citation.types.ts";

export const LINK_CONFIDENCE = {
  inside: 0.9,
  trailing: 0.8,
  nextSentence: 0.35,
} as const;

/** Locates a claim in its paragraph: by paragraphId, or by unique verbatim text match. */
function locate(claim: ClaimInput, paragraphs: readonly SourceParagraph[]) {
  const pool = claim.paragraphId
    ? paragraphs.filter((p) => p.id === claim.paragraphId)
    : paragraphs;
  const hits = pool.filter((p) => p.cleanedText.includes(claim.originalText));
  if (hits.length !== 1 || !hits[0]) return null;
  const start = hits[0].cleanedText.indexOf(claim.originalText);
  return { paragraph: hits[0], start, end: start + claim.originalText.length };
}

export function mapClaimsToCitations(
  claims: readonly ClaimInput[],
  paragraphs: readonly SourceParagraph[],
  citations: readonly DetectedCitation[],
): ClaimCitationLink[] {
  const links: ClaimCitationLink[] = [];
  for (const claim of claims) {
    const at = locate(claim, paragraphs);
    if (!at) continue;
    const text = at.paragraph.cleanedText;
    const inParagraph = citations
      .filter((c) => c.paragraphId === at.paragraph.id)
      .sort((a, b) => a.start - b.start);
    const add = (
      c: DetectedCitation,
      status: ClaimCitationLink["status"],
      confidence: number,
      reason: string,
    ) =>
      links.push({
        claimId: claim.id,
        citationId: c.id,
        status,
        confidence,
        reason,
      });

    let cursor = at.end; // end of the claim text, extended over directly-adjacent markers
    let found = false;
    for (const c of inParagraph) {
      if (c.start >= at.start && c.end <= at.end) {
        add(
          c,
          ClaimCitationStatus.LINKED,
          LINK_CONFIDENCE.inside,
          "citation marker inside the claim sentence",
        );
        found = true;
      } else if (
        // Only standalone markers ("[3]", "(Doe, 2020)") can trail a sentence; a narrative
        // citation ("Lee and Park (2019) described…") belongs to the sentence it opens.
        /^[[(]/.test(c.citationText) &&
        c.start >= cursor &&
        /^[\s.,;]*$/.test(text.slice(cursor, c.start))
      ) {
        add(
          c,
          ClaimCitationStatus.LINKED,
          LINK_CONFIDENCE.trailing,
          "citation marker directly follows the claim sentence",
        );
        cursor = Math.max(cursor, c.end);
        found = true;
      }
    }
    if (found) continue;

    // No citation of its own: look at the next sentence only.
    const sentences = splitSentences(text);
    const idx = sentences.findIndex(
      (s) => s.start <= at.end - 1 && s.end >= at.end,
    );
    const next = idx >= 0 ? sentences[idx + 1] : undefined;
    if (!next) continue;
    for (const c of inParagraph) {
      if (c.start >= next.start && c.end <= next.end) {
        add(
          c,
          ClaimCitationStatus.NEEDS_REVIEW,
          LINK_CONFIDENCE.nextSentence,
          "claim sentence has no citation; marker is in the following sentence",
        );
      }
    }
  }
  return links;
}

export function summarizeClaimMappings(
  claims: readonly ClaimInput[],
  links: readonly ClaimCitationLink[],
  citations: readonly DetectedCitation[],
  matches: readonly CitationMatch[],
): ClaimCitationMapping[] {
  const citationById = new Map(citations.map((c) => [c.id, c]));
  const matchById = new Map(matches.map((m) => [m.citationId, m]));
  return claims.map((claim) => {
    const entries = links
      .filter((l) => l.claimId === claim.id)
      .flatMap((l) => {
        const c = citationById.get(l.citationId);
        const m = matchById.get(l.citationId);
        if (!c || !m) return [];
        return [
          {
            citationId: c.id,
            citationText: c.citationText,
            citationKey: c.citationKey,
            linkStatus: l.status,
            linkConfidence: l.confidence,
            matchStatus: m.status,
            referenceId: m.referenceId,
            matchConfidence: m.confidence,
          },
        ];
      });
    const certain = entries.every(
      (e) =>
        e.linkStatus === ClaimCitationStatus.LINKED &&
        e.matchStatus === CitationMatchStatus.MATCHED,
    );
    return {
      claimId: claim.id,
      status: !entries.length
        ? "NO_CITATION"
        : certain
          ? "MAPPED"
          : "NEEDS_REVIEW",
      citationIds: entries.map((e) => e.citationId),
      referenceIds: [
        ...new Set(
          entries.flatMap((e) => (e.referenceId ? [e.referenceId] : [])),
        ),
      ],
      confidence: entries.length
        ? Math.round(
            Math.min(
              ...entries.map((e) => e.linkConfidence * e.matchConfidence),
            ) * 100,
          ) / 100
        : 0,
      citations: entries,
    };
  });
}
