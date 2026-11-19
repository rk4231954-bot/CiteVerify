import { Hono } from "hono";
import * as claims from "../controllers/claim.controller.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../types/index.ts";

export const claimRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/:id", ...claims.getById)
  .delete("/:id", ...claims.remove);
