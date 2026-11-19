import { Hono } from "hono";
import * as publications from "../controllers/publication.controller.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../types/index.ts";

export const publicationRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/:id", ...publications.getById);
