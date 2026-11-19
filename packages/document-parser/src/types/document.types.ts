import { extractionStatusSchema } from "@citeverify/shared";
import { z } from "zod";

/**
 * Extraction output format. The zod schemas are the source of truth; the
 * TypeScript types are inferred from them so stored results can be validated
 * when read back.
 *
 * Conventions:
 * - `pageNumber` is 1-based, and `null` when the format has no reliable pages (DOCX).
 * - `order` is the block's position in reading order across paragraphs,
 *   headings, and tables, so the three lists can be interleaved again.
 * - Metadata fields are `null` (or `[]`) when not present — never guessed.
 */

export const documentFormatSchema = z.enum(["pdf", "docx"]);
export type DocumentFormat = z.infer<typeof documentFormatSchema>;

export const paragraphSchema = z.object({
  id: z.string(),
  order: z.number().int().nonnegative(),
  /** Text as extracted; for PDFs, original line breaks are kept as "\n". */
  originalText: z.string(),
  /** Normalised text for downstream processing (see text-cleaner). */
  cleanedText: z.string(),
  pageNumber: z.number().int().positive().nullable(),
  /** Text of the nearest preceding heading, when there is one. */
  section: z.string().nullable(),
});
export type Paragraph = z.infer<typeof paragraphSchema>;

export const headingSchema = z.object({
  id: z.string(),
  order: z.number().int().nonnegative(),
  text: z.string(),
  /** 1 = top level. Null when the level can't be determined (some PDF headings). */
  level: z.number().int().min(1).max(6).nullable(),
  pageNumber: z.number().int().positive().nullable(),
});
export type Heading = z.infer<typeof headingSchema>;

export const tableSchema = z.object({
  id: z.string(),
  order: z.number().int().nonnegative(),
  /** Cell text, row by row. */
  rows: z.array(z.array(z.string())),
  pageNumber: z.number().int().positive().nullable(),
  section: z.string().nullable(),
});
export type Table = z.infer<typeof tableSchema>;

export const pageSummarySchema = z.object({
  pageNumber: z.number().int().positive(),
  paragraphCount: z.number().int().nonnegative(),
  characterCount: z.number().int().nonnegative(),
  hasText: z.boolean(),
});
export type PageSummary = z.infer<typeof pageSummarySchema>;

/** Where a derived field came from, so consumers can judge how much to trust it. */
export const fieldSourceSchema = z.enum(["metadata", "content"]).nullable();

/** Embedded file properties exactly as stored in the document (PDF Info/XMP, DOCX core.xml). */
export const fileMetadataSchema = z.object({
  title: z.string().nullable(),
  authors: z.array(z.string()),
  subject: z.string().nullable(),
  keywords: z.string().nullable(),
  language: z.string().nullable(),
  creator: z.string().nullable(),
  producer: z.string().nullable(),
  createdAt: z.string().nullable(),
  modifiedAt: z.string().nullable(),
});
export type FileMetadata = z.infer<typeof fileMetadataSchema>;

export const extractionResultSchema = z.object({
  format: documentFormatSchema,
  status: extractionStatusSchema,
  /** Best available title: file metadata first, then a title/heading found in the content. */
  title: z.string().nullable(),
  titleSource: fieldSourceSchema,
  /** From file metadata only — authors are never guessed from body text. */
  authors: z.array(z.string()),
  abstract: z.string().nullable(),
  /** Null for DOCX: page layout isn't stored in the file. */
  totalPages: z.number().int().nonnegative().nullable(),
  pages: z.array(pageSummarySchema),
  paragraphs: z.array(paragraphSchema),
  headings: z.array(headingSchema),
  tables: z.array(tableSchema),
  metadata: fileMetadataSchema,
  warnings: z.array(z.string()),
  stats: z.object({
    paragraphCount: z.number().int().nonnegative(),
    wordCount: z.number().int().nonnegative(),
    characterCount: z.number().int().nonnegative(),
  }),
  extractedAt: z.string(),
  parser: z.object({ name: z.string(), version: z.string() }),
});
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

/** Errors that mean the file itself could not be parsed. */
export const parseErrorCodeSchema = z.enum([
  "UNSUPPORTED_FORMAT",
  "CORRUPTED_FILE",
  "ENCRYPTED_FILE",
  "PARSE_ERROR",
]);
export type ParseErrorCode = z.infer<typeof parseErrorCodeSchema>;

export class DocumentParseError extends Error {
  constructor(
    readonly code: ParseErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "DocumentParseError";
  }
}

/**
 * What a format-specific parser hands to the shared assembly step
 * (metadata detection, stats, status). Text is not yet cleaned.
 */
export type RawBlock =
  | { kind: "paragraph"; text: string; pageNumber: number | null }
  | {
      kind: "heading";
      text: string;
      level: number | null;
      pageNumber: number | null;
      isTitle?: boolean;
    }
  | { kind: "table"; rows: string[][]; pageNumber: number | null };

export type RawExtraction = {
  format: DocumentFormat;
  blocks: RawBlock[];
  metadata: FileMetadata;
  totalPages: number | null;
  pages: PageSummary[];
  warnings: string[];
  /** Content-derived title candidate (e.g. a DOCX "Title" paragraph or large first-page text). */
  titleCandidate: string | null;
};
