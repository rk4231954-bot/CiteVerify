import type {
  CitationMatchStatus,
  ClaimCitationStatus,
} from "@citeverify/shared";
import type { z } from "zod";
import type {
  authorYearTargetSchema,
  citationFormatSchema,
  citationMatchSchema,
  citationTargetSchema,
  claimCitationLinkSchema,
  claimInputSchema,
  detectedCitationSchema,
  matchCandidateSchema,
  numericTargetSchema,
  parsedReferenceSchema,
  sourceParagraphSchema,
} from "../schemas/citation.schema.ts";

export type CitationFormat = z.infer<typeof citationFormatSchema>;
export type SourceParagraph = z.infer<typeof sourceParagraphSchema>;
export type NumericTarget = z.infer<typeof numericTargetSchema>;
export type AuthorYearTarget = z.infer<typeof authorYearTargetSchema>;
export type CitationTarget = z.infer<typeof citationTargetSchema>;
export type DetectedCitation = z.infer<typeof detectedCitationSchema>;
export type ParsedReference = z.infer<typeof parsedReferenceSchema>;
export type MatchCandidate = z.infer<typeof matchCandidateSchema>;
export type CitationMatch = z.infer<typeof citationMatchSchema>;
export type ClaimInput = z.infer<typeof claimInputSchema>;
export type ClaimCitationLink = z.infer<typeof claimCitationLinkSchema>;

/** A citation marker found by a detector, before ids/paragraph info are attached. */
export type RawCitationMarker = {
  text: string;
  start: number;
  end: number;
  format: CitationFormat;
  targets: { key: string; target: CitationTarget }[];
};

/** Claim-level summary: which citations and references a claim is attached to. */
export type ClaimCitationMapping = {
  claimId: string;
  /** MAPPED: every link is LINKED and every citation MATCHED. */
  status: "MAPPED" | "NEEDS_REVIEW" | "NO_CITATION";
  citationIds: string[];
  referenceIds: string[];
  /** Weakest link × match confidence across the claim's citations (0 when none). */
  confidence: number;
  citations: {
    citationId: string;
    citationText: string;
    citationKey: string;
    linkStatus: ClaimCitationStatus;
    linkConfidence: number;
    matchStatus: CitationMatchStatus;
    referenceId: string | null;
    matchConfidence: number;
  }[];
};

export type CitationAnalysisStats = {
  paragraphsScanned: number;
  bibliographyParagraphs: number;
  markers: number;
  citations: number;
  duplicateCitationsRemoved: number;
  references: number;
  duplicateReferencesRemoved: number;
  matched: number;
  ambiguous: number;
  unmatched: number;
  needsReview: number;
  uncitedReferences: number;
  claimsWithCitations: number;
  claimLinks: number;
};

export type CitationAnalysis = {
  citations: DetectedCitation[];
  references: ParsedReference[];
  matches: CitationMatch[];
  links: ClaimCitationLink[];
  claimMappings: ClaimCitationMapping[];
  stats: CitationAnalysisStats;
  warnings: string[];
};
