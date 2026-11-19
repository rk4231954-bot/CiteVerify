import { Hono } from "hono";
import * as citations from "../controllers/citation.controller.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../types/index.ts";

export const citationRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/:id", ...citations.getById)
  .get("/:id/matches", ...citations.getMatches);
