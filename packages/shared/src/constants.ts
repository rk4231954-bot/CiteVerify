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
