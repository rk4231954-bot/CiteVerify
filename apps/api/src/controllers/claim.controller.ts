import { createFactory } from "hono/factory";
import { validate } from "../middleware/validate.ts";
import { claimService } from "../services/claim.service.ts";
import type { AppEnv } from "../types/index.ts";
import { ok } from "../utils/response.ts";
import {
  claimIdParamSchema,
  extractClaimsSchema,
  listClaimsQuerySchema,
} from "../validators/claim.validator.ts";
import { documentIdParamSchema } from "../validators/document.validator.ts";

// All claim handlers run behind requireAuth (applied in the routers).
const factory = createFactory<AppEnv>();

export const extractForDocument = factory.createHandlers(
  validate("param", documentIdParamSchema),
  // The body is optional: an empty request means rule-based extraction.
  validate("json", extractClaimsSchema),
  async (c) =>
    ok(
      c,
      await claimService.extract(
        c.get("userId"),
        c.req.valid("param").id,
        c.req.valid("json"),
      ),
      201,
    ),
);

export const listForDocument = factory.createHandlers(
  validate("param", documentIdParamSchema),
  validate("query", listClaimsQuerySchema),
  async (c) =>
    ok(
      c,
      await claimService.listForDocument(
        c.get("userId"),
        c.req.valid("param").id,
        c.req.valid("query"),
      ),
    ),
);

export const getById = factory.createHandlers(
  validate("param", claimIdParamSchema),
  async (c) =>
    ok(c, {
      claim: await claimService.get(c.get("userId"), c.req.valid("param").id),
    }),
);

export const remove = factory.createHandlers(
  validate("param", claimIdParamSchema),
  async (c) =>
    ok(c, {
      deleted: await claimService.delete(
        c.get("userId"),
        c.req.valid("param").id,
      ),
    }),
);
