import { citationMatchStatusSchema } from "@citeverify/shared";
import { z } from "zod";

export const listCitationsQuerySchema = z.object({
  status: citationMatchStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const citationIdParamSchema = z.object({
  id: z.string().min(1).max(64),
});

export type ListCitationsQuery = z.infer<typeof listCitationsQuerySchema>;
