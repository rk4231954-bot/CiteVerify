/** OpenAlex API (api.openalex.org) — only the fields we use; unknown keys are ignored. */
import { z } from "zod";

export const openAlexWorkSchema = z.object({
  id: z.string(),
  doi: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  publication_year: z.number().int().nullable().optional(),
  type: z.string().nullable().optional(),
  authorships: z
    .array(
      z.object({
        author: z
          .object({ display_name: z.string().nullable().optional() })
          .nullable()
          .optional(),
        raw_author_name: z.string().nullable().optional(),
      }),
    )
    .optional(),
  primary_location: z
    .object({
      landing_page_url: z.string().nullable().optional(),
      source: z
        .object({
          display_name: z.string().nullable().optional(),
          host_organization_name: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
  open_access: z
    .object({
      is_oa: z.boolean().nullable().optional(),
      oa_status: z.string().nullable().optional(),
      oa_url: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  abstract_inverted_index: z
    .record(z.string(), z.array(z.number().int().nonnegative()))
    .nullable()
    .optional(),
});
export type OpenAlexWork = z.infer<typeof openAlexWorkSchema>;

export const openAlexSearchResponseSchema = z.object({
  results: z.array(openAlexWorkSchema),
});
