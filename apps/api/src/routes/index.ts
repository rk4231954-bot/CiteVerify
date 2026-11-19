import { Hono } from "hono";
import type { AppEnv } from "../types/index.ts";
import { authRoutes } from "./auth.routes.ts";
import { citationRoutes } from "./citation.routes.ts";
import { claimRoutes } from "./claim.routes.ts";
import { documentRoutes } from "./document.routes.ts";
import { healthRoutes } from "./health.routes.ts";
import { publicationRoutes } from "./publication.routes.ts";
import { referenceRoutes } from "./reference.routes.ts";

export const apiRoutes = new Hono<AppEnv>()
  .route("/health", healthRoutes)
  .route("/auth", authRoutes)
  .route("/documents", documentRoutes)
  .route("/claims", claimRoutes)
  .route("/citations", citationRoutes)
  .route("/publications", publicationRoutes)
  .route("/references", referenceRoutes);
