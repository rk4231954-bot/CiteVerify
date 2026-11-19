import type { DocumentExtraction } from "@citeverify/database";
import {
  type DocumentFormat,
  DocumentParseError,
  type ExtractionResult,
  parseDocument,
  parseExtractionResult,
  SUPPORTED_MIME_TYPES,
} from "@citeverify/document-parser";
import { DocumentStatus, ExtractionStatus } from "@citeverify/shared";
import { documentRepository } from "../repositories/document.repository.ts";
import { extractionRepository } from "../repositories/extraction.repository.ts";
import { AppError, Errors } from "../utils/errors.ts";
import { storageService } from "./storage.service.ts";

/** A PROCESSING state older than this is considered abandoned and may be retried. */
const STALE_PROCESSING_MS = 10 * 60 * 1000;

const FORMAT_BY_MIME = new Map(
  Object.entries(SUPPORTED_MIME_TYPES).map(([format, mime]) => [
    mime,
    format as DocumentFormat,
  ]),
);

/** Extraction outcomes that leave the document usable for the next pipeline stage. */
const USABLE: ReadonlySet<string> = new Set([
  ExtractionStatus.COMPLETED,
  ExtractionStatus.PARTIAL,
]);

/** Extraction outcomes that can feed claim extraction. */
export const isUsableExtraction = (status: string) => USABLE.has(status);

/** Parses and validates the stored extraction JSON (null when none was stored). */
export function readStoredResult(
  record: Pick<DocumentExtraction, "result">,
): ExtractionResult | null {
  if (!record.result) return null;
  try {
    return parseExtractionResult(JSON.parse(record.result));
  } catch {
    throw new AppError(
      500,
      "EXTRACTION_UNREADABLE",
      "Stored extraction is invalid; re-run extraction",
    );
  }
}

function toPublic(record: DocumentExtraction, result?: ExtractionResult) {
  const parsed = result ?? readStoredResult(record);
  return {
    status: record.status,
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    extractedAt: record.extractedAt,
    result: parsed,
  };
}

export const extractionService = {
  async extract(userId: string, documentId: string) {
    const doc = await documentRepository.findForExtraction(documentId, userId);
    if (!doc) throw Errors.notFound("Document");
    if (!doc.filePath)
      throw Errors.conflict(
        "Document has no uploaded file to extract; upload a file first",
      );

    const expectedFormat = FORMAT_BY_MIME.get(doc.fileType);
    if (!expectedFormat)
      throw Errors.unsupportedFile(
        `Extraction is not supported for "${doc.fileType}"`,
      );

    const claimed = await extractionRepository.claimForProcessing(
      doc.id,
      new Date(Date.now() - STALE_PROCESSING_MS),
    );
    if (!claimed)
      throw Errors.conflict(
        "Extraction is already in progress for this document",
      );

    try {
      const data = await storageService.read(doc.filePath); // read-only; the upload is never modified
      if (!data)
        throw new DocumentParseError(
          "PARSE_ERROR",
          "The uploaded file is missing from storage",
        );

      const result = await parseDocument(data, { expectedFormat });
      const documentStatus = USABLE.has(result.status)
        ? DocumentStatus.EXTRACTED
        : DocumentStatus.FAILED;
      const record = await extractionRepository.save(doc.id, documentStatus, {
        status: result.status,
        result: JSON.stringify(result),
        errorCode: null,
        errorMessage: null,
        pageCount: result.totalPages,
        paragraphCount: result.stats.paragraphCount,
        extractedAt: new Date(result.extractedAt),
      });
      return {
        documentId: doc.id,
        documentStatus,
        extraction: toPublic(record, result),
      };
    } catch (error) {
      const parseError = error instanceof DocumentParseError ? error : null;
      try {
        await extractionRepository.save(doc.id, DocumentStatus.FAILED, {
          status: ExtractionStatus.FAILED,
          result: null,
          errorCode: parseError?.code ?? "INTERNAL_ERROR",
          errorMessage:
            parseError?.message ?? "Unexpected error during extraction",
          pageCount: null,
          paragraphCount: 0,
          extractedAt: new Date(),
        });
      } catch (saveError) {
        // e.g. database unavailable: make sure the document isn't stuck in PROCESSING
        console.error("[api] could not record failed extraction:", saveError);
        await extractionRepository
          .setDocumentStatus(doc.id, DocumentStatus.FAILED)
          .catch(() => {});
      }
      if (parseError)
        throw Errors.extractionFailed(parseError.message, parseError.code);
      throw error; // unexpected: let the central error handler map it (503, 500…)
    }
  },

  async get(userId: string, documentId: string) {
    const doc = await documentRepository.findStatusForUser(documentId, userId);
    if (!doc) throw Errors.notFound("Document");
    const record = await extractionRepository.findByDocumentId(doc.id);
    return {
      documentId: doc.id,
      documentStatus: doc.status,
      extraction: record ? toPublic(record) : null,
    };
  },
};
