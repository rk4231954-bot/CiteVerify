import { createFactory } from "hono/factory";
import { validate } from "../middleware/validate.ts";
import { citationService } from "../services/citation.service.ts";
import type { AppEnv } from "../types/index.ts";
import { ok } from "../utils/response.ts";
import {
  citationIdParamSchema,
  listCitationsQuerySchema,
} from "../validators/citation.validator.ts";
import { documentIdParamSchema } from "../validators/document.validator.ts";

// All citation handlers run behind requireAuth (applied in the routers).
const factory = createFactory<AppEnv>();

export const detectForDocument = factory.createHandlers(
  validate("param", documentIdParamSchema),
  async (c) =>
    ok(
      c,
      await citationService.detect(c.get("userId"), c.req.valid("param").id),
    ),
);

export const listForDocument = factory.createHandlers(
  validate("param", documentIdParamSchema),
  validate("query", listCitationsQuerySchema),
  async (c) =>
    ok(
      c,
      await citationService.listForDocument(
        c.get("userId"),
        c.req.valid("param").id,
        c.req.valid("query"),
      ),
    ),
);

export const listReferences = factory.createHandlers(
  validate("param", documentIdParamSchema),
  async (c) =>
    ok(
      c,
      await citationService.listReferences(
        c.get("userId"),
        c.req.valid("param").id,
      ),
    ),
);

export const getById = factory.createHandlers(
  validate("param", citationIdParamSchema),
  async (c) =>
    ok(c, {
      citation: await citationService.get(
        c.get("userId"),
        c.req.valid("param").id,
      ),
    }),
);

export const getMatches = factory.createHandlers(
  validate("param", citationIdParamSchema),
  async (c) =>
    ok(
      c,
      await citationService.matches(c.get("userId"), c.req.valid("param").id),
    ),
);
