import {
  type DocumentFormat,
  DocumentParseError,
  type ExtractionResult,
  extractionResultSchema,
} from "../types/document.types.ts";

export const SUPPORTED_MIME_TYPES: Record<DocumentFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const startsWith = (data: Uint8Array, bytes: number[], offset = 0) =>
  bytes.every((b, i) => data[offset + i] === b);
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // legacy .doc

/**
 * Determines the format from the file's content (magic bytes), not its name.
 * PDF readers accept a header within the first 1 KB, so we do too.
 */
export function detectFormat(data: Uint8Array): DocumentFormat {
  if (data.length === 0)
    throw new DocumentParseError(
      "CORRUPTED_FILE",
      "The file is empty (0 bytes)",
    );
  const head = data.subarray(0, 1024);
  for (let i = 0; i + PDF_MAGIC.length <= head.length; i++) {
    if (startsWith(head, PDF_MAGIC, i)) return "pdf";
  }
  if (startsWith(data, ZIP_MAGIC)) return "docx"; // confirmed by the DOCX parser (word/document.xml)
  if (startsWith(data, OLE_MAGIC)) {
    throw new DocumentParseError(
      "UNSUPPORTED_FORMAT",
      "Legacy .doc files are not supported; save as .docx",
    );
  }
  throw new DocumentParseError(
    "UNSUPPORTED_FORMAT",
    "Unsupported file format; only PDF and DOCX are supported",
  );
}

/** Validates a stored/serialised extraction result (e.g. read back from the database). */
export function parseExtractionResult(value: unknown): ExtractionResult {
  return extractionResultSchema.parse(value);
}
