/**
 * Domain status values. SQLite has no native enums, so the database stores
 * these as TEXT; these constants (and the zod schemas in ./schemas.ts) are
 * the single source of truth for the allowed values.
 */

export const DocumentStatus = {
  UPLOADED: "UPLOADED",
  PROCESSING: "PROCESSING",
  /** Text extraction finished; ready for claim extraction. */
  EXTRACTED: "EXTRACTED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;
export type DocumentStatus =
  (typeof DocumentStatus)[keyof typeof DocumentStatus];

export const Verdict = {
  SUPPORTED: "SUPPORTED",
  PARTIALLY_SUPPORTED: "PARTIALLY_SUPPORTED",
  UNSUPPORTED: "UNSUPPORTED",
  CONTRADICTED: "CONTRADICTED",
  OUTDATED: "OUTDATED",
  MISLEADING_CITATION: "MISLEADING_CITATION",
  NEEDS_HUMAN_REVIEW: "NEEDS_HUMAN_REVIEW",
} as const;
export type Verdict = (typeof Verdict)[keyof typeof Verdict];

export const JobStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

/** Pipeline stage a verification job is currently in. */
export const JobStage = {
  PARSING: "PARSING",
  EXTRACTING_CLAIMS: "EXTRACTING_CLAIMS",
  RESOLVING_CITATIONS: "RESOLVING_CITATIONS",
  RETRIEVING_SOURCES: "RETRIEVING_SOURCES",
  VERIFYING: "VERIFYING",
  REPORTING: "REPORTING",
} as const;
export type JobStage = (typeof JobStage)[keyof typeof JobStage];

/** Whether the cited publication's metadata/content could be fetched. */
export const RetrievalStatus = {
  PENDING: "PENDING",
  RETRIEVED: "RETRIEVED",
  NOT_FOUND: "NOT_FOUND",
  FAILED: "FAILED",
} as const;
export type RetrievalStatus =
  (typeof RetrievalStatus)[keyof typeof RetrievalStatus];

/** In-text citation style, e.g. "[3]" vs "(Smith et al., 2020)". */
export const CitationType = {
  NUMERIC: "NUMERIC",
  AUTHOR_YEAR: "AUTHOR_YEAR",
  FOOTNOTE: "FOOTNOTE",
  OTHER: "OTHER",
} as const;
export type CitationType = (typeof CitationType)[keyof typeof CitationType];

/** Which part of a publication an evidence passage came from. */
export const EvidenceType = {
  ABSTRACT: "ABSTRACT",
  FULL_TEXT: "FULL_TEXT",
  METADATA: "METADATA",
} as const;
export type EvidenceType = (typeof EvidenceType)[keyof typeof EvidenceType];

/** Outcome of document text extraction. */
export const ExtractionStatus = {
  /** Text extracted from every page/section. */
  COMPLETED: "COMPLETED",
  /** Some text extracted, but parts (e.g. pages) had none or failed. */
  PARTIAL: "PARTIAL",
  /** Readable file but no extractable text (e.g. scanned images; OCR is not supported). */
  EMPTY: "EMPTY",
  /** The file could not be parsed (corrupted, encrypted, missing, unsupported). */
  FAILED: "FAILED",
} as const;
export type ExtractionStatus =
  (typeof ExtractionStatus)[keyof typeof ExtractionStatus];

/** Primary category of an extracted scientific claim. */
export const ClaimCategory = {
  /** General established statement ("X is associated with Y", "X regulates Y"). */
  SCIENTIFIC_FACT: "SCIENTIFIC_FACT",
  /** Something observed or measured in a study ("we observed…", "treatment increased…"). */
  EXPERIMENTAL_FINDING: "EXPERIMENTAL_FINDING",
  /** Backed by statistics: p-values, confidence intervals, test statistics, coefficients. */
  STATISTICAL_CLAIM: "STATISTICAL_CLAIM",
  /** Asserts cause and effect ("X causes / leads to / induces Y"). */
  CAUSAL_CLAIM: "CAUSAL_CLAIM",
  /** Compares groups, conditions, or methods ("higher than", "compared with"). */
  COMPARATIVE_CLAIM: "COMPARATIVE_CLAIM",
  /** Authors' conclusion or interpretation ("these results indicate…"). */
  RESEARCH_CONCLUSION: "RESEARCH_CONCLUSION",
  /** A quantity is the core of the assertion ("prevalence is 9.3%"). */
  NUMERICAL_CLAIM: "NUMERICAL_CLAIM",
} as const;
export type ClaimCategory = (typeof ClaimCategory)[keyof typeof ClaimCategory];

/** Additional properties of a claim (a claim can have several). */
export const ClaimCharacteristic = {
  PERCENTAGE: "PERCENTAGE",
  NUMERIC_VALUE: "NUMERIC_VALUE",
  MEASUREMENT_UNIT: "MEASUREMENT_UNIT",
  P_VALUE: "P_VALUE",
  CONFIDENCE_INTERVAL: "CONFIDENCE_INTERVAL",
  TEST_STATISTIC: "TEST_STATISTIC",
  STATISTICAL_SIGNIFICANCE: "STATISTICAL_SIGNIFICANCE",
  SAMPLE_SIZE: "SAMPLE_SIZE",
  COMPARISON: "COMPARISON",
  CAUSAL_LANGUAGE: "CAUSAL_LANGUAGE",
  CHANGE_DIRECTION: "CHANGE_DIRECTION",
  ASSOCIATION: "ASSOCIATION",
  HEDGED: "HEDGED",
  NEGATED: "NEGATED",
  CITES_SOURCE: "CITES_SOURCE",
} as const;
export type ClaimCharacteristic =
  (typeof ClaimCharacteristic)[keyof typeof ClaimCharacteristic];

/** How a claim was produced. */
export const ClaimExtractionMethod = {
  /** Deterministic pattern-based extractor (no AI). */
  RULE_BASED: "RULE_BASED",
  /** Proposed by an AI provider, then verified to be a verbatim sentence of the document. */
  AI: "AI",
  /** Entered by hand (e.g. seed / demo data). */
  MANUAL: "MANUAL",
} as const;
export type ClaimExtractionMethod =
  (typeof ClaimExtractionMethod)[keyof typeof ClaimExtractionMethod];

/**
 * Outcome of matching an in-text citation to a bibliography entry.
 * Only MATCHED sets Citation.referenceId; the others keep their candidates
 * visible for review. A match says nothing about scientific support.
 */
export const CitationMatchStatus = {
  /** Exactly one confident bibliography match. */
  MATCHED: "MATCHED",
  /** Several entries fit equally well (e.g. "Smith 2020" vs 2020a/2020b). */
  AMBIGUOUS: "AMBIGUOUS",
  /** No bibliography entry fits. */
  UNMATCHED: "UNMATCHED",
  /** A plausible but uncertain candidate (partial author/year agreement). */
  NEEDS_REVIEW: "NEEDS_REVIEW",
} as const;
export type CitationMatchStatus =
  (typeof CitationMatchStatus)[keyof typeof CitationMatchStatus];

/** How confidently an in-text citation is attached to a claim. */
export const ClaimCitationStatus = {
  /** The citation marker is inside (or directly ends) the claim sentence. */
  LINKED: "LINKED",
  /** Only a nearby citation (e.g. in the next sentence) — needs a human check. */
  NEEDS_REVIEW: "NEEDS_REVIEW",
} as const;
export type ClaimCitationStatus =
  (typeof ClaimCitationStatus)[keyof typeof ClaimCitationStatus];

/**
 * Outcome of looking up a bibliography reference in publication databases.
 * Only MATCHED links a Publication to the Reference. Metadata being found says
 * nothing about full-text availability or scientific support.
 */
export const PublicationMatchStatus = {
  /** One publication matches confidently (exact DOI, or a clear title/author/year match). */
  MATCHED: "MATCHED",
  /** Several publications fit similarly well. */
  AMBIGUOUS: "AMBIGUOUS",
  /** The providers answered, but nothing fits. */
  NOT_FOUND: "NOT_FOUND",
  /** A plausible but uncertain candidate. */
  NEEDS_REVIEW: "NEEDS_REVIEW",
  /** Retrieval could not complete (providers unavailable); safe to retry. */
  FAILED: "FAILED",
} as const;
export type PublicationMatchStatus =
  (typeof PublicationMatchStatus)[keyof typeof PublicationMatchStatus];

/** External scholarly metadata sources. */
export const PublicationProvider = {
  CROSSREF: "CROSSREF",
  OPENALEX: "OPENALEX",
} as const;
export type PublicationProvider =
  (typeof PublicationProvider)[keyof typeof PublicationProvider];
