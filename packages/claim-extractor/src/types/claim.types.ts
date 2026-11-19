import type { ClaimCategory, ClaimCharacteristic } from "@citeverify/shared";
import type { z } from "zod";
import type {
  aiClaimCandidateSchema,
  claimExtractionOptionsSchema,
  claimSchema,
} from "../schemas/claim.schema.ts";

export type Claim = z.infer<typeof claimSchema>;
export type AiClaimCandidate = z.input<typeof aiClaimCandidateSchema>;
export type ClaimExtractionOptions = z.input<
  typeof claimExtractionOptionsSchema
>;
export type ResolvedClaimExtractionOptions = z.output<
  typeof claimExtractionOptionsSchema
>;

/** The parts of a document-parser paragraph the extractor needs. */
export type SourceParagraph = {
  id: string;
  order: number;
  cleanedText: string;
  pageNumber: number | null;
  section: string | null;
};

/** A linguistic cue found in a sentence. */
export type Signal = {
  /** Short machine name, e.g. "p_value". */
  name: string;
  /** Human-readable reason, e.g. 'p-value: "p < 0.05"'. */
  reason: string;
  /** Contribution to extraction confidence (0..1). */
  weight: number;
  /** Category this cue is evidence for, if any. */
  category?: ClaimCategory;
  characteristic?: ClaimCharacteristic;
  /** True for cues that assert something (numbers or context alone don't make a claim). */
  assertive?: boolean;
};

export type Classification = {
  isClaim: boolean;
  category: ClaimCategory | null;
  characteristics: ClaimCharacteristic[];
  confidence: number;
  rationale: string[];
  /** Why the sentence was rejected, when it was. */
  rejectedBecause?: string;
};

export type ClaimExtractionStats = {
  paragraphsAnalyzed: number;
  paragraphsSkipped: number;
  sentencesAnalyzed: number;
  claimsFound: number;
  duplicatesRemoved: number;
};

export type ClaimExtractionOutput = {
  claims: Claim[];
  stats: ClaimExtractionStats;
  warnings: string[];
};

/**
 * Provider-independent hook for LLM-based extraction. Implementations call
 * any model/API they like; CiteVerify verifies every returned sentence is a
 * verbatim quote of the given paragraph before accepting it.
 */
export interface ClaimAiProvider {
  /** Shown in claim rationale, e.g. "openai:gpt-x" or "local:llama". */
  readonly name: string;
  extractClaims(input: {
    documentId: string;
    paragraphs: readonly SourceParagraph[];
  }): Promise<AiClaimCandidate[]>;
}
