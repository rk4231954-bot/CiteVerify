import type {
  EvidenceAvailability,
  EvidenceExtractionMethod,
  EvidenceType,
  VerificationScope,
} from "@citeverify/shared";

/** Coarse role of a section, derived from its heading. */
export type SectionKind =
  | "ABSTRACT"
  | "INTRODUCTION"
  | "METHODS"
  | "RESULTS"
  | "DISCUSSION"
  | "CONCLUSION"
  | "LIMITATIONS"
  | "REFERENCES"
  | "BACK_MATTER"
  | "OTHER";

/** A paragraph of parsed full text (structurally compatible with document-parser's Paragraph). */
export type FullTextParagraph = {
  id: string;
  order: number;
  cleanedText: string;
  pageNumber: number | null;
  section: string | null;
};

/** The content available for one publication. Nothing here is fetched by the extractor. */
export type PublicationContent = {
  publicationId: string;
  /** Abstract text as stored (e.g. from Crossref/OpenAlex metadata). */
  abstract: string | null;
  /** Where the abstract can be read (landing page / DOI URL), if known. */
  abstractSourceUrl: string | null;
  /** Legally accessible full text, already parsed. */
  fullText: {
    paragraphs: readonly FullTextParagraph[];
    sourceUrl: string | null;
  } | null;
};

/** A contiguous piece of source text that sentences are taken from. */
export type SourcePassage = {
  /** "abstract" or the full-text paragraph id. */
  id: string;
  text: string;
  /** Section heading exactly as written in the source ("Abstract" for metadata abstracts). */
  section: string | null;
  sectionKind: SectionKind | null;
  /** Structured-abstract label as written, e.g. "Results". */
  abstractLabel: string | null;
  pageNumber: number | null;
  availability: EvidenceAvailability;
  sourceUrl: string | null;
  order: number;
  /** Offset of `text` within the original passage (non-zero for structured-abstract segments). */
  offset: number;
};

export type StatisticKind =
  | "P_VALUE"
  | "CONFIDENCE_INTERVAL"
  | "EFFECT_SIZE"
  | "MEAN_SD"
  | "TEST_STATISTIC"
  | "PERCENTAGE";

/** Verbatim details found in an evidence passage — every value is a substring of sourceText. */
export type EvidenceDetails = {
  sampleSizes: { value: number; text: string }[];
  statistics: { kind: StatisticKind; text: string }[];
  studyDesign: string[];
  conditions: string[];
  /** Where the passage is: sourceText === <passage text>.slice(charStart, charEnd). */
  location: {
    passageId: string;
    charStart: number;
    charEnd: number;
    abstractLabel: string | null;
  };
  /** Why the passage was selected and classified. */
  signals: string[];
};

export type ExtractedEvidence = {
  id: string;
  publicationId: string;
  sourceText: string;
  normalizedText: string;
  evidenceType: EvidenceType;
  section: string | null;
  pageNumber: number | null;
  sourceUrl: string | null;
  extractionMethod: Exclude<EvidenceExtractionMethod, "MANUAL">;
  evidenceAvailability: EvidenceAvailability;
  /** 0..1: how sure we are of the CLASSIFICATION — not whether the finding is true. */
  confidence: number;
  details: EvidenceDetails;
  position: number;
  fingerprint: string;
  createdAt: string;
};

export type EvidenceExtractionStats = {
  passages: number;
  sentencesConsidered: number;
  selected: number;
  duplicatesRemoved: number;
  byType: Record<EvidenceType, number>;
  byAvailability: Record<EvidenceAvailability, number>;
};

export type EvidenceExtractionOutput = {
  publicationId: string;
  evidence: ExtractedEvidence[];
  /** FULL when full text was processed, LIMITED for abstract only, NONE without content. */
  verificationScope: VerificationScope;
  stats: EvidenceExtractionStats;
  warnings: string[];
};

export type EvidenceExtractionOptions = {
  /** Passages below this classification confidence are dropped (default 0.35). */
  minConfidence?: number;
  /** Upper bound per publication (default 300). */
  maxEvidence?: number;
};

/** What an AI provider may propose. Proposals are validated; nothing unverifiable is accepted. */
export type AiEvidenceCandidate = {
  passageId: string;
  sentence: string;
  evidenceType: EvidenceType;
  confidence?: number;
};

/** Provider-independent AI interface (any vendor or a local model). */
export interface EvidenceAiProvider {
  readonly name: string;
  extractEvidence(input: {
    publicationId: string;
    passages: readonly SourcePassage[];
  }): Promise<unknown[]>;
}

// ─── Claim ↔ evidence relevance ──────────────────────────────────────────

export type RelevanceClaim = { id: string; text: string };

export type RelevanceCandidate = {
  id: string;
  /** normalizedText when available, otherwise sourceText. */
  text: string;
  evidenceType: EvidenceType | null;
};

export type RelevanceLevel = "HIGH" | "MEDIUM" | "LOW";

export type RelevanceBreakdown = {
  terms: number;
  subjectOutcome: number | null;
  phrases: number;
  numbers: number | null;
  characters: number;
  /** Weight of the evidence type for verification (results > methods). */
  typeWeight: number;
};

/** A ranked candidate. relevanceScore is topical overlap — never support, contradiction or truth. */
export type RankedEvidence = {
  evidenceId: string;
  rank: number;
  relevanceScore: number;
  relevanceLevel: RelevanceLevel;
  matchedTerms: string[];
  matchedNumbers: string[];
  breakdown: RelevanceBreakdown;
};
