import { Hono } from "hono";
import * as citations from "../controllers/citation.controller.ts";
import * as claims from "../controllers/claim.controller.ts";
import * as documents from "../controllers/document.controller.ts";
import * as publications from "../controllers/publication.controller.ts";
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
  .post("/:id/extract-claims", ...claims.extractForDocument)
  .get("/:id/claims", ...claims.listForDocument)
  .post("/:id/detect-citations", ...citations.detectForDocument)
  .get("/:id/citations", ...citations.listForDocument)
  .get("/:id/references", ...citations.listReferences)
  .post("/:id/retrieve-publications", ...publications.retrieveForDocument)
  .get("/:id/publications", ...publications.listForDocument)
  .delete("/:id", ...documents.remove);
