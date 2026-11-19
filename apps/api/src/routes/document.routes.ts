import { Hono } from "hono";
import * as documents from "../controllers/document.controller.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../types/index.ts";

export const documentRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .post("/upload", ...documents.upload) // registered before "/:id"
  .post("/", ...documents.create)
  .get("/", ...documents.list)
  .get("/:id", ...documents.getById)
  .post("/:id/extract", ...documents.extract)
  .get("/:id/extraction", ...documents.getExtraction)
  .delete("/:id", ...documents.remove);
