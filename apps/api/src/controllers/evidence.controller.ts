import { createFactory } from "hono/factory";
import { validate } from "../middleware/validate.ts";
import { evidenceService } from "../services/evidence.service.ts";
import type { AppEnv } from "../types/index.ts";
import { ok } from "../utils/response.ts";
import { claimIdParamSchema } from "../validators/claim.validator.ts";
import {
  extractEvidenceSchema,
  findEvidenceSchema,
  listEvidenceQuerySchema,
} from "../validators/evidence.validator.ts";
import { idParamSchema } from "../validators/publication.validator.ts";

// All evidence handlers run behind requireAuth (applied in the routers).
const factory = createFactory<AppEnv>();

export const extractForPublication = factory.createHandlers(
  validate("param", idParamSchema),
  validate("json", extractEvidenceSchema),
  async (c) =>
    ok(
      c,
      await evidenceService.extract(
        c.get("userId"),
        c.req.valid("param").id,
        c.req.valid("json"),
      ),
    ),
);

export const listForPublication = factory.createHandlers(
  validate("param", idParamSchema),
  validate("query", listEvidenceQuerySchema),
  async (c) =>
    ok(
      c,
      await evidenceService.listForPublication(
        c.get("userId"),
        c.req.valid("param").id,
        c.req.valid("query"),
      ),
    ),
);

export const listForClaim = factory.createHandlers(
  validate("param", claimIdParamSchema),
  async (c) =>
    ok(
      c,
      await evidenceService.listForClaim(
        c.get("userId"),
        c.req.valid("param").id,
      ),
    ),
);

export const findForClaim = factory.createHandlers(
  validate("param", claimIdParamSchema),
  validate("json", findEvidenceSchema),
  async (c) =>
    ok(
      c,
      await evidenceService.findForClaim(
        c.get("userId"),
        c.req.valid("param").id,
        c.req.valid("json"),
      ),
    ),
);
