/** Crossref REST API (api.crossref.org) — only the fields we use; unknown keys are ignored. */
import { z } from "zod";

const dateParts = z
  .object({
    "date-parts": z.array(z.array(z.number().int().nullable())).optional(),
  })
  .partial();

export const crossrefWorkSchema = z.object({
  DOI: z.string(),
  title: z.array(z.string()).optional(),
  subtitle: z.array(z.string()).optional(),
  author: z
    .array(
      z.object({
        given: z.string().optional(),
        family: z.string().optional(),
        name: z.string().optional(),
      }),
    )
    .optional(),
  issued: dateParts.optional(),
  published: dateParts.optional(),
  "published-print": dateParts.optional(),
  "published-online": dateParts.optional(),
  "container-title": z.array(z.string()).optional(),
  publisher: z.string().optional(),
  abstract: z.string().optional(),
  URL: z.string().optional(),
  resource: z
    .object({ primary: z.object({ URL: z.string().optional() }).optional() })
    .optional(),
  type: z.string().optional(),
});
export type CrossrefWork = z.infer<typeof crossrefWorkSchema>;

export const crossrefWorkResponseSchema = z.object({
  status: z.literal("ok"),
  message: crossrefWorkSchema,
});

export const crossrefSearchResponseSchema = z.object({
  status: z.literal("ok"),
  message: z.object({ items: z.array(crossrefWorkSchema) }),
});
