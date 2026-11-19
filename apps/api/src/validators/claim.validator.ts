import { claimCategorySchema } from "@citeverify/shared";
import { z } from "zod";

/** POST /documents/:id/extract-claims — the body is optional. */
export const extractClaimsSchema = z
  .object({
    method: z.enum(["RULE_BASED", "AI"]).default("RULE_BASED"),
    /** Delete this method's previous claims for the document before saving. */
    replace: z.boolean().default(false),
    minConfidence: z.number().min(0).max(1).optional(),
  })
  .strict();

export const listClaimsQuerySchema = z.object({
  category: claimCategorySchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const claimIdParamSchema = z.object({ id: z.string().min(1).max(64) });

export type ExtractClaimsBody = z.infer<typeof extractClaimsSchema>;
export type ListClaimsQuery = z.infer<typeof listClaimsQuerySchema>;
