import {
  evidenceAvailabilitySchema,
  evidenceTypeSchema,
  verdictSchema,
  verificationScopeSchema,
} from "@citeverify/shared";
import { z } from "zod";

export const stanceSchema = z.enum([
  "AGREES",
  "PARTIAL",
  "DISAGREES",
  "NEUTRAL",
]);

/** One AI stance proposal. Anything else the provider returns is discarded. */
export const aiStanceProposalSchema = z.object({
  evidenceId: z.string().min(1),
  stance: stanceSchema,
  rationale: z.string().max(1000).optional(),
});

export const assessmentFlagSchema = z.enum([
  "CAUSAL_OVERSTATEMENT",
  "OVERGENERALIZATION",
  "NUMBER_MISMATCH",
  "NUMBER_MATCH",
  "POPULATION_MISMATCH",
  "UNSIGNED_SOURCE",
  "MIXED_SIGNIFICANCE",
  "NOT_SIGNIFICANT",
  "NO_EFFECT_REPORTED",
  "HEDGED_SOURCE",
  "OFF_OUTCOME",
  "NO_DIRECTION",
  "NON_FINDING_TYPE",
  "AI_RULE_CONFLICT",
  "AI_ONLY",
]);

export const evidenceSourceTypeSchema = z.enum([
  "FULL_TEXT",
  "ABSTRACT",
  "MIXED",
  "NONE",
]);

const publicationAssessmentSchema = z.object({
  id: z.string(),
  title: z.string(),
  year: z.number().int().nullable(),
  doi: z.string().nullable(),
  journal: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  fullTextStatus: z.string().nullable(),
  citationIds: z.array(z.string()),
  citationTexts: z.array(z.string()),
  evidenceCount: z.number().int(),
  evidenceSource: evidenceSourceTypeSchema,
  onTopic: z.boolean(),
  contribution: z.enum([
    "SUPPORTING",
    "CONTRADICTING",
    "MIXED",
    "NEUTRAL",
    "NO_EVIDENCE",
  ]),
});

/** What is stored in VerificationResult.details (JSON). */
export const storedVerificationDetailsSchema = z.object({
  reasonCode: z.string(),
  publications: z.array(publicationAssessmentSchema),
  unresolvedCitations: z.array(
    z.object({
      citationId: z.string(),
      citationText: z.string(),
      reason: z.string(),
    }),
  ),
  verificationScope: verificationScopeSchema,
  humanReviewReasons: z.array(z.string()),
  strategy: z.string(),
  rulesApplied: z.array(z.string()),
});

export const storedRationaleSchema = z.object({
  flags: z.array(assessmentFlagSchema),
  rationale: z.array(z.string()),
});

export { evidenceAvailabilitySchema, evidenceTypeSchema, verdictSchema };
