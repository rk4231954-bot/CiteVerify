import {
  publicationMatchStatusSchema,
  publicationProviderSchema,
} from "@citeverify/shared";
import { z } from "zod";

export const normalizedPublicationSchema = z.object({
  provider: publicationProviderSchema,
  sources: z.array(publicationProviderSchema),
  providerId: z.string().min(1),
  doi: z.string().nullable(),
  title: z.string().min(1),
  authors: z.array(z.string()),
  year: z.number().int().nullable(),
  journal: z.string().nullable(),
  publisher: z.string().nullable(),
  abstract: z.string().nullable(),
  url: z.string().nullable(),
  openAccess: z.boolean().nullable(),
  openAccessStatus: z.string().nullable(),
  openAccessUrl: z.string().nullable(),
  openAlexId: z.string().nullable(),
  type: z.string().nullable(),
});

export const referenceQuerySchema = z.object({
  id: z.string(),
  rawText: z.string(),
  doi: z.string().nullable(),
  title: z.string().nullable(),
  authors: z.array(z.string()),
  year: z.number().int().nullable(),
});

/** Compact candidate summary suitable for storage (e.g. Reference.publicationCandidates). */
export const storedCandidateSchema = z.object({
  provider: publicationProviderSchema,
  providerId: z.string(),
  doi: z.string().nullable(),
  title: z.string(),
  authors: z.array(z.string()),
  year: z.number().int().nullable(),
  journal: z.string().nullable(),
  url: z.string().nullable(),
  score: z.number().min(0).max(1),
  reasons: z.array(z.string()),
});

export const retrievalSummarySchema = z.object({
  status: publicationMatchStatusSchema,
  confidence: z.number().min(0).max(1),
});
