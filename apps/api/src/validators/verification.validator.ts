import { verdictSchema } from "@citeverify/shared";
import { z } from "zod";

/** POST /documents/:id/verify — the body is optional. */
export const verifyDocumentSchema = z
  .object({
    method: z.enum(["RULE_BASED", "AI"]).default("RULE_BASED"),
    /** Verify only these claims of the document (default: all). */
    claimIds: z.array(z.string().min(1).max(64)).min(1).max(500).optional(),
    /** Extract evidence first for cited publications that have none yet. */
    extractMissingEvidence: z.boolean().default(true),
  })
  .strict();

const booleanQuery = z.enum(["true", "false"]).transform((v) => v === "true");

export const verificationResultsQuerySchema = z.object({
  /** A specific run (default: the latest completed run). */
  jobId: z.string().min(1).max(64).optional(),
  verdict: verdictSchema.optional(),
  humanReview: booleanQuery.optional(),
});

export type VerifyDocumentBody = z.infer<typeof verifyDocumentSchema>;
export type VerificationResultsQuery = z.infer<
  typeof verificationResultsQuerySchema
>;
