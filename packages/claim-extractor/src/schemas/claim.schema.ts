import {
  claimCategorySchema,
  claimCharacteristicSchema,
  claimExtractionMethodSchema,
  confidenceSchema,
} from "@citeverify/shared";
import { z } from "zod";

/** One extracted claim. `originalText` is an exact substring of the source paragraph. */
export const claimSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  /** The exact sentence as it appears in the paragraph's cleaned text. */
  originalText: z.string().min(1),
  /** Whitespace/quote-normalised text with citation markers removed; values untouched. */
  normalizedText: z.string().min(1),
  category: claimCategorySchema,
  characteristics: z.array(claimCharacteristicSchema),
  pageNumber: z.number().int().positive().nullable(),
  section: z.string().nullable(),
  paragraphId: z.string().min(1),
  /** Reading-order position of the claim within the document (0-based). */
  position: z.number().int().nonnegative(),
  /** Confidence that this sentence IS a scientific claim — not that the claim is true. */
  confidence: confidenceSchema,
  /** Human-readable reasons the sentence was selected. */
  rationale: z.array(z.string()),
  extractionMethod: claimExtractionMethodSchema,
  createdAt: z.string(),
});

/** What an AI provider must return for each proposed claim (verified before use). */
export const aiClaimCandidateSchema = z.object({
  paragraphId: z.string().min(1),
  /** Must be copied verbatim from the paragraph text, or the candidate is rejected. */
  sentence: z.string().min(1),
  category: claimCategorySchema,
  characteristics: z.array(claimCharacteristicSchema).default([]),
  confidence: confidenceSchema,
  rationale: z.string().min(1),
});

export const claimExtractionOptionsSchema = z.object({
  /** Minimum extraction confidence for a sentence to be kept (rule-based). */
  minConfidence: confidenceSchema.default(0.5),
  /** Sentences longer than this many words are treated as merged/garbled text. */
  maxWords: z.number().int().positive().default(90),
  minWords: z.number().int().positive().default(5),
});
