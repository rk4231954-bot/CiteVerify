/**
 * @citeverify/document-parser — structured text extraction from PDF and DOCX.
 *
 * Pure library: no database or HTTP code. Callers (API, worker) read the file
 * and decide where to store the result.
 */
import { parseDocx } from "./docx/docx-parser.ts";
import { parsePdf } from "./pdf/pdf-parser.ts";
import type {
  DocumentFormat,
  ExtractionResult,
} from "./types/document.types.ts";
import { DocumentParseError } from "./types/document.types.ts";
import { detectFormat } from "./utils/validation.ts";

export type ParseOptions = {
  /** Expected format (e.g. from the upload's MIME type); must match the content. */
  expectedFormat?: DocumentFormat;
};

/** Parses a PDF or DOCX file from memory. Throws DocumentParseError if it can't be read. */
export async function parseDocument(
  data: Uint8Array,
  options: ParseOptions = {},
): Promise<ExtractionResult> {
  const format = detectFormat(data);
  if (options.expectedFormat && options.expectedFormat !== format) {
    throw new DocumentParseError(
      "UNSUPPORTED_FORMAT",
      `File content is ${format.toUpperCase()} but ${options.expectedFormat.toUpperCase()} was expected`,
    );
  }
  return format === "pdf" ? parsePdf(data) : parseDocx(data);
}

/** Reads a file from disk (read-only — the file is never modified) and parses it. */
export async function parseDocumentFile(
  filePath: string,
  options?: ParseOptions,
): Promise<ExtractionResult> {
  const file = Bun.file(filePath);
  if (!(await file.exists()))
    throw new DocumentParseError("PARSE_ERROR", `File not found: ${filePath}`);
  return parseDocument(new Uint8Array(await file.arrayBuffer()), options);
}

export { parseDocx } from "./docx/docx-parser.ts";
export { EXTRACTOR_VERSION } from "./metadata/metadata-extractor.ts";
export { parsePdf } from "./pdf/pdf-parser.ts";
export * from "./text/text-cleaner.ts";
export * from "./types/document.types.ts";
export {
  detectFormat,
  parseExtractionResult,
  SUPPORTED_MIME_TYPES,
} from "./utils/validation.ts";
