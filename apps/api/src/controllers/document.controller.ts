import { bodyLimit } from "hono/body-limit";
import { createFactory } from "hono/factory";
import { env } from "../config/env.ts";
import { validate } from "../middleware/validate.ts";
import { documentService } from "../services/document.service.ts";
import type { AppEnv } from "../types/index.ts";
import { Errors } from "../utils/errors.ts";
import { ok } from "../utils/response.ts";
import {
  createDocumentSchema,
  documentIdParamSchema,
  listDocumentsQuerySchema,
  uploadDocumentSchema,
} from "../validators/document.validator.ts";

// All document handlers run behind requireAuth (applied in the router).
const factory = createFactory<AppEnv>();

const MULTIPART_OVERHEAD = 64 * 1024;

export const create = factory.createHandlers(
  validate("json", createDocumentSchema),
  async (c) =>
    ok(
      c,
      {
        document: await documentService.create(
          c.get("userId"),
          c.req.valid("json"),
        ),
      },
      201,
    ),
);

export const list = factory.createHandlers(
  validate("query", listDocumentsQuerySchema),
  async (c) =>
    ok(c, await documentService.list(c.get("userId"), c.req.valid("query"))),
);

export const getById = factory.createHandlers(
  validate("param", documentIdParamSchema),
  async (c) =>
    ok(c, {
      document: await documentService.get(
        c.get("userId"),
        c.req.valid("param").id,
      ),
    }),
);

export const remove = factory.createHandlers(
  validate("param", documentIdParamSchema),
  async (c) =>
    ok(c, {
      deleted: await documentService.delete(
        c.get("userId"),
        c.req.valid("param").id,
      ),
    }),
);

export const upload = factory.createHandlers(
  // Reject oversized bodies while streaming, before buffering the whole upload.
  bodyLimit({
    maxSize: env.MAX_FILE_SIZE + MULTIPART_OVERHEAD,
    onError: () => {
      throw Errors.fileTooLarge(env.MAX_FILE_SIZE);
    },
  }),
  validate("form", uploadDocumentSchema),
  async (c) => {
    const { file, title } = c.req.valid("form");
    const result = await documentService.upload(c.get("userId"), file, title);
    return ok(c, result, 201);
  },
);
