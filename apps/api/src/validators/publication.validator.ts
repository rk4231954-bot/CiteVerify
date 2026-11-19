import { publicationMatchStatusSchema } from "@citeverify/shared";
import { z } from "zod";

/** POST /documents/:id/retrieve-publications — the body is optional. */
export const retrievePublicationsSchema = z
  .object({
    /** Limit the run to these references (default: all that still need retrieval). */
    referenceIds: z.array(z.string().min(1).max(64)).min(1).max(100).optional(),
    /** Re-query references that already have a result. */
    force: z.boolean().default(false),
  })
  .strict();

export const listPublicationsQuerySchema = z.object({
  status: publicationMatchStatusSchema.optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1).max(64) });

export type RetrievePublicationsBody = z.infer<
  typeof retrievePublicationsSchema
>;
export type ListPublicationsQuery = z.infer<typeof listPublicationsQuerySchema>;
