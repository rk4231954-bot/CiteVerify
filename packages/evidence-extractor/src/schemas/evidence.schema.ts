import {
  evidenceAvailabilitySchema,
  evidenceExtractionMethodSchema,
  evidenceTypeSchema,
  verificationScopeSchema,
} from "@citeverify/shared";
import { z } from "zod";

export const statisticKindSchema = z.enum([
  "P_VALUE",
  "CONFIDENCE_INTERVAL",
  "EFFECT_SIZE",
  "MEAN_SD",
  "TEST_STATISTIC",
  "PERCENTAGE",
]);

export const evidenceDetailsSchema = z.object({
  sampleSizes: z.array(
    z.object({ value: z.number().int().nonnegative(), text: z.string() }),
  ),
  statistics: z.array(
    z.object({ kind: statisticKindSchema, text: z.string() }),
  ),
  studyDesign: z.array(z.string()),
  conditions: z.array(z.string()),
  location: z.object({
    passageId: z.string(),
    charStart: z.number().int().nonnegative(),
    charEnd: z.number().int().nonnegative(),
    abstractLabel: z.string().nullable(),
  }),
  signals: z.array(z.string()),
});

export const extractedEvidenceSchema = z.object({
  id: z.string(),
  publicationId: z.string(),
  sourceText: z.string().min(1),
  normalizedText: z.string().min(1),
  evidenceType: evidenceTypeSchema,
  section: z.string().nullable(),
  pageNumber: z.number().int().positive().nullable(),
  sourceUrl: z.string().nullable(),
  extractionMethod: evidenceExtractionMethodSchema.exclude(["MANUAL"]),
  evidenceAvailability: evidenceAvailabilitySchema,
  confidence: z.number().min(0).max(1),
  details: evidenceDetailsSchema,
  position: z.number().int().nonnegative(),
  fingerprint: z.string().min(1),
  createdAt: z.string(),
});

export const aiEvidenceCandidateSchema = z.object({
  passageId: z.string().min(1),
  sentence: z.string().min(1),
  evidenceType: evidenceTypeSchema,
  confidence: z.number().min(0).max(1).optional(),
});

export const fullTextParagraphSchema = z.object({
  id: z.string(),
  order: z.number().int().nonnegative(),
  cleanedText: z.string(),
  pageNumber: z.number().int().positive().nullable(),
  section: z.string().nullable(),
});

export const publicationContentSchema = z.object({
  publicationId: z.string().min(1),
  abstract: z.string().nullable(),
  abstractSourceUrl: z.string().nullable(),
  fullText: z
    .object({
      paragraphs: z.array(fullTextParagraphSchema),
      sourceUrl: z.string().nullable(),
    })
    .nullable(),
});

export const relevanceBreakdownSchema = z.object({
  terms: z.number(),
  subjectOutcome: z.number().nullable(),
  phrases: z.number(),
  numbers: z.number().nullable(),
  characters: z.number(),
  typeWeight: z.number(),
});

export const rankedEvidenceSchema = z.object({
  evidenceId: z.string(),
  rank: z.number().int().positive(),
  relevanceScore: z.number().min(0).max(1),
  relevanceLevel: z.enum(["HIGH", "MEDIUM", "LOW"]),
  matchedTerms: z.array(z.string()),
  matchedNumbers: z.array(z.string()),
  breakdown: relevanceBreakdownSchema,
});

/** What is stored in ClaimEvidence.matchedTerms. */
export const storedRelevanceSchema = rankedEvidenceSchema.pick({
  relevanceLevel: true,
  matchedTerms: true,
  matchedNumbers: true,
  breakdown: true,
});

export { verificationScopeSchema };
