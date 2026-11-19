import { createFactory } from "hono/factory";
import { validate } from "../middleware/validate.ts";
import { verificationService } from "../services/verification.service.ts";
import type { AppEnv } from "../types/index.ts";
import { ok } from "../utils/response.ts";
import { claimIdParamSchema } from "../validators/claim.validator.ts";
import { documentIdParamSchema } from "../validators/document.validator.ts";
import {
  verificationResultsQuerySchema,
  verifyDocumentSchema,
} from "../validators/verification.validator.ts";

// All verification handlers run behind requireAuth (applied in the routers).
const factory = createFactory<AppEnv>();

export const verifyDocument = factory.createHandlers(
  validate("param", documentIdParamSchema),
  // The body is optional: an empty request means rule-based verification of every claim.
  validate("json", verifyDocumentSchema),
  async (c) =>
    ok(
      c,
      await verificationService.verifyDocument(
        c.get("userId"),
        c.req.valid("param").id,
        c.req.valid("json"),
      ),
      201,
    ),
);

export const resultsForDocument = factory.createHandlers(
  validate("param", documentIdParamSchema),
  validate("query", verificationResultsQuerySchema),
  async (c) =>
    ok(
      c,
      await verificationService.resultsForDocument(
        c.get("userId"),
        c.req.valid("param").id,
        c.req.valid("query"),
      ),
    ),
);

export const statusForDocument = factory.createHandlers(
  validate("param", documentIdParamSchema),
  async (c) =>
    ok(
      c,
      await verificationService.status(
        c.get("userId"),
        c.req.valid("param").id,
      ),
    ),
);

export const forClaim = factory.createHandlers(
  validate("param", claimIdParamSchema),
  async (c) =>
    ok(
      c,
      await verificationService.forClaim(
        c.get("userId"),
        c.req.valid("param").id,
      ),
    ),
);
