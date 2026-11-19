import {
  evidenceAvailabilitySchema,
  evidenceTypeSchema,
} from "@citeverify/shared";
import { z } from "zod";

/** POST /publications/:id/extract-evidence — the body is optional. */
export const extractEvidenceSchema = z
  .object({
    /** Try to obtain legally accessible (open-access PDF) full text. */
    fullText: z.boolean().default(true),
    method: z.enum(["RULE_BASED", "AI"]).default("RULE_BASED"),
    /** Delete previously EXTRACTED evidence (rule-based/AI) first; manual rows are kept. */
    replace: z.boolean().default(false),
    minConfidence: z.number().min(0).max(1).optional(),
  })
  .strict();

export const listEvidenceQuerySchema = z.object({
  type: evidenceTypeSchema.optional(),
  availability: evidenceAvailabilitySchema.optional(),
});

/** POST /claims/:id/find-evidence — the body is optional. */
export const findEvidenceSchema = z
  .object({
    /**
     * CITED: only publications of references the claim's citations are confidently
     * matched to. DOCUMENT: every retrieved publication of the claim's document.
     */
    scope: z.enum(["CITED", "DOCUMENT"]).default("CITED"),
    /** Extract evidence for linked publications that have none yet. */
    extractMissing: z.boolean().default(true),
    topK: z.number().int().min(1).max(50).default(10),
    minRelevance: z.number().min(0).max(1).default(0.2),
  })
  .strict();

export type ExtractEvidenceBody = z.infer<typeof extractEvidenceSchema>;
export type ListEvidenceQuery = z.infer<typeof listEvidenceQuerySchema>;
export type FindEvidenceBody = z.infer<typeof findEvidenceSchema>;
