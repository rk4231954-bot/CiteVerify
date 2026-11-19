import { createFactory } from "hono/factory";
import { validate } from "../middleware/validate.ts";
import { publicationService } from "../services/publication.service.ts";
import type { AppEnv } from "../types/index.ts";
import { ok } from "../utils/response.ts";
import { documentIdParamSchema } from "../validators/document.validator.ts";
import {
  idParamSchema,
  listPublicationsQuerySchema,
  retrievePublicationsSchema,
} from "../validators/publication.validator.ts";

// All publication handlers run behind requireAuth (applied in the routers).
const factory = createFactory<AppEnv>();

export const retrieveForDocument = factory.createHandlers(
  validate("param", documentIdParamSchema),
  validate("json", retrievePublicationsSchema),
  async (c) =>
    ok(
      c,
      await publicationService.retrieve(
        c.get("userId"),
        c.req.valid("param").id,
        c.req.valid("json"),
      ),
    ),
);

export const listForDocument = factory.createHandlers(
  validate("param", documentIdParamSchema),
  validate("query", listPublicationsQuerySchema),
  async (c) =>
    ok(
      c,
      await publicationService.listForDocument(
        c.get("userId"),
        c.req.valid("param").id,
        c.req.valid("query"),
      ),
    ),
);

export const getById = factory.createHandlers(
  validate("param", idParamSchema),
  async (c) =>
    ok(
      c,
      await publicationService.get(c.get("userId"), c.req.valid("param").id),
    ),
);

export const getForReference = factory.createHandlers(
  validate("param", idParamSchema),
  async (c) =>
    ok(
      c,
      await publicationService.forReference(
        c.get("userId"),
        c.req.valid("param").id,
      ),
    ),
);
