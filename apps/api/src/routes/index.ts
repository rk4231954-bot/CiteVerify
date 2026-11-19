import { Hono } from "hono";
import type { AppEnv } from "../types/index.ts";
import { authRoutes } from "./auth.routes.ts";
import { documentRoutes } from "./document.routes.ts";
import { healthRoutes } from "./health.routes.ts";

export const apiRoutes = new Hono<AppEnv>()
  .route("/health", healthRoutes)
  .route("/auth", authRoutes)
  .route("/documents", documentRoutes);
