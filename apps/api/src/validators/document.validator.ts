import { z } from "zod";
import { env } from "../config/env.ts";
import { SUPPORTED_MIME_TYPES } from "../utils/file-type.ts";

const title = z.string().trim().min(1).max(200);

/** POST /documents — metadata-only record (no file attached yet). */
export const createDocumentSchema = z.object({
  title,
  originalFilename: z.string().trim().min(1).max(255),
  fileType: z.enum(SUPPORTED_MIME_TYPES as [string, ...string[]], {
    error: "fileType must be a PDF or DOCX MIME type",
  }),
  fileSize: z.number().int().positive().max(env.MAX_FILE_SIZE),
});

/** POST /documents/upload — multipart/form-data. */
export const uploadDocumentSchema = z.object({
  file: z.instanceof(File, { error: "A file is required in the 'file' field" }),
  title: title.optional(),
});

export const listDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const documentIdParamSchema = z.object({
  id: z.string().min(1).max(64),
});

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;
