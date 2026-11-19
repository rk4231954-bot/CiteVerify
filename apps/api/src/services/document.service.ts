import type { DocumentStatus } from "@citeverify/shared";
import { env } from "../config/env.ts";
import { documentRepository } from "../repositories/document.repository.ts";
import { Errors } from "../utils/errors.ts";
import { detectFileKind } from "../utils/file-type.ts";
import type {
  CreateDocumentInput,
  ListDocumentsQuery,
} from "../validators/document.validator.ts";
import { storageService } from "./storage.service.ts";

const titleFromFilename = (name: string) =>
  name.replace(/\.[^.]+$/, "").trim() || name;

export const documentService = {
  create(userId: string, input: CreateDocumentInput) {
    return documentRepository.create({ userId, ...input });
  },

  async list(userId: string, { page, limit }: ListDocumentsQuery) {
    const { items, total } = await documentRepository.listForUser(
      userId,
      (page - 1) * limit,
      limit,
    );
    return { items, page, limit, total };
  },

  async get(userId: string, id: string) {
    const doc = await documentRepository.findDetailForUser(id, userId);
    if (!doc) throw Errors.notFound("Document");
    const { _count, jobs, ...rest } = doc;
    return { ...rest, counts: _count, latestJob: jobs[0] ?? null };
  },

  async delete(userId: string, id: string) {
    const doc = await documentRepository.findFilePathForUser(id, userId);
    if (!doc) throw Errors.notFound("Document");
    await documentRepository.delete(doc.id); // claims, citations, jobs… cascade
    if (doc.filePath) await storageService.remove(doc.filePath);
    return { id: doc.id };
  },

  async upload(userId: string, file: File, title?: string) {
    if (file.size === 0) throw Errors.badRequest("Uploaded file is empty");
    if (file.size > env.MAX_FILE_SIZE)
      throw Errors.fileTooLarge(env.MAX_FILE_SIZE);

    const kind = await detectFileKind(file);
    const filePath = await storageService.save(file, kind.extension);
    try {
      const doc = await documentRepository.create({
        userId,
        title: title ?? titleFromFilename(file.name),
        originalFilename: file.name,
        fileType: kind.mimeType,
        fileSize: file.size,
        filePath,
      });
      return {
        id: doc.id,
        status: doc.status as DocumentStatus,
        document: doc,
      };
    } catch (error) {
      await storageService.remove(filePath); // don't leave orphaned files behind
      throw error;
    }
  },
};
