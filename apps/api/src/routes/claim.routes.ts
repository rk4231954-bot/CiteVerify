import { Hono } from "hono";
import * as claims from "../controllers/claim.controller.ts";
import * as evidence from "../controllers/evidence.controller.ts";
import * as verification from "../controllers/verification.controller.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../types/index.ts";

export const claimRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/:id", ...claims.getById)
  .delete("/:id", ...claims.remove)
  .get("/:id/evidence", ...evidence.listForClaim)
  .post("/:id/find-evidence", ...evidence.findForClaim)
  .get("/:id/verification", ...verification.forClaim);
