import type {
  EvidenceAvailability,
  EvidenceType,
  Verdict,
  VerificationScope,
} from "@citeverify/shared";

// ─── Input (provider- and database-independent) ─────────────────────────

export type VerificationClaim = {
  id: string;
  /** The claim as written in the document. */
  text: string;
  /** Citation-marker-free text, if available (preferred for matching). */
  normalizedText?: string | null;
};

export type PublicationInfo = {
  id: string;
  title: string;
  year: number | null;
  doi: string | null;
  journal: string | null;
  sourceUrl: string | null;
  /** FullTextStatus of the last attempt to obtain legally accessible full text. */
  fullTextStatus: string | null;
};

/** One in-text citation attached to the claim, and how far it resolves. */
export type CitationLink = {
  citationId: string;
  citationText: string;
  /** ClaimCitationStatus: LINKED | NEEDS_REVIEW. */
  linkStatus: string;
  linkConfidence: number | null;
  /** CitationMatchStatus of the citation → bibliography match. */
  citationMatchStatus: string | null;
  /** Set only when the citation is confidently matched to a reference. */
  referenceId: string | null;
  /** PublicationMatchStatus of the reference → publication match. */
  publicationMatchStatus: string | null;
  publicationMatchConfidence: number | null;
  /** Set only when the reference is confidently matched to a publication. */
  publication: PublicationInfo | null;
};

export type EvidenceInput = {
  id: string;
  publicationId: string;
  sourceText: string;
  normalizedText: string | null;
  /** null for legacy rows that were never classified. */
  evidenceType: EvidenceType | null;
  evidenceAvailability: EvidenceAvailability;
  section: string | null;
  pageNumber: number | null;
  sourceUrl: string | null;
  confidence: number | null;
};

export type ClaimVerificationInput = {
  claim: VerificationClaim;
  citations: readonly CitationLink[];
  /** Evidence of the claim's publications (other rows are ignored). */
  evidence: readonly EvidenceInput[];
};

// ─── Analysis ────────────────────────────────────────────────────────────

/** Direction of the asserted relationship. NONE = "no effect / no association". */
export type Polarity = "UP" | "DOWN" | "NONE" | "UNSIGNED";
export type RelationKind = "CAUSAL" | "EFFECT" | "ASSOCIATION";
export type Significance = "SIGNIFICANT" | "NOT_SIGNIFICANT" | "MIXED";
export type PopulationGroup =
  | "ANIMAL"
  | "IN_VITRO"
  | "CHILDREN"
  | "OLDER_ADULTS"
  | "ADULTS"
  | "WOMEN"
  | "MEN";

/** What a sentence asserts, as far as explicit wording shows. */
export type Assertion = {
  polarity: Polarity | null;
  relation: RelationKind | null;
  /** The wording the polarity was read from, verbatim (lower-cased). */
  cue: string | null;
  hedged: boolean;
  absoluteTerms: string[];
  /** Quantities with units ("8.2 mmhg", "40 %"); p-values excluded. */
  quantities: string[];
  significance: Significance | null;
  populations: PopulationGroup[];
};

export type Stance = "AGREES" | "PARTIAL" | "DISAGREES" | "NEUTRAL";

export type AssessmentFlag =
  /** The claim states cause/effect; the source reports an association. */
  | "CAUSAL_OVERSTATEMENT"
  /** The claim uses absolute wording ("always", "cures") the source does not. */
  | "OVERGENERALIZATION"
  /** Same unit, different numbers. */
  | "NUMBER_MISMATCH"
  | "NUMBER_MATCH"
  /** Animal / in-vitro / different age or sex group than the claim. */
  | "POPULATION_MISMATCH"
  /** The source reports a relationship without a direction. */
  | "UNSIGNED_SOURCE"
  | "MIXED_SIGNIFICANCE"
  | "NOT_SIGNIFICANT"
  /** The source reports no effect / no association. */
  | "NO_EFFECT_REPORTED"
  | "HEDGED_SOURCE"
  /** The passage does not mention the claim's outcome (or subject). */
  | "OFF_OUTCOME"
  | "NO_DIRECTION"
  | "NON_FINDING_TYPE"
  /** AI and rules disagree on the direction: treated as neutral. */
  | "AI_RULE_CONFLICT"
  /** Stance only from the AI provider; rules saw no stance. */
  | "AI_ONLY";

export type PassageContext = {
  passage: EvidenceInput;
  publication: PublicationInfo;
  relevanceScore: number;
  matchedTerms: string[];
  /** Publication title + methodology passages: who/what was studied. */
  studyProfile: string;
};

export type PassageAssessment = {
  evidenceId: string;
  stance: Stance;
  flags: AssessmentFlag[];
  rationale: string[];
  /** 0..1 weight of this passage in the verdict (relevance × type × wording). */
  strength: number;
};

/** Decides the stance of each candidate passage. Aggregation into a verdict is shared. */
export interface VerificationStrategy {
  readonly name: string;
  readonly method: VerificationMethod;
  assess(
    claim: VerificationClaim,
    passages: readonly PassageContext[],
  ): Promise<PassageAssessment[]>;
}

export type VerificationMethod = "RULE_BASED" | "AI";

/** What an AI provider may propose per passage; validated before use. */
export type AiStanceProposal = {
  evidenceId: string;
  stance: Stance;
  rationale?: string;
};

export interface VerificationAiProvider {
  readonly name: string;
  assessEvidence(input: {
    claim: { id: string; text: string };
    passages: {
      evidenceId: string;
      text: string;
      evidenceType: EvidenceType | null;
      evidenceAvailability: EvidenceAvailability;
      section: string | null;
      publicationTitle: string;
    }[];
  }): Promise<unknown[]>;
}

// ─── Output ──────────────────────────────────────────────────────────────

export type EvidenceRole =
  | "SUPPORTING"
  | "CONTRADICTING"
  | "CONTEXT"
  | "LIMITATION";

export type AssessedEvidence = {
  evidenceId: string;
  publicationId: string;
  role: EvidenceRole;
  stance: Stance;
  /** Verbatim passage and where it was read. */
  sourceText: string;
  evidenceType: EvidenceType | null;
  evidenceAvailability: EvidenceAvailability;
  section: string | null;
  pageNumber: number | null;
  sourceUrl: string | null;
  /** 0..1 topical relevance — NOT support. */
  relevanceScore: number;
  flags: AssessmentFlag[];
  rationale: string[];
};

export type EvidenceSourceType = "FULL_TEXT" | "ABSTRACT" | "MIXED" | "NONE";

export type PublicationAssessment = PublicationInfo & {
  citationIds: string[];
  citationTexts: string[];
  evidenceCount: number;
  /** What content of this publication was available. */
  evidenceSource: EvidenceSourceType;
  /** Does the publication's content concern the claim's topic at all? */
  onTopic: boolean;
  contribution:
    | "SUPPORTING"
    | "CONTRADICTING"
    | "MIXED"
    | "NEUTRAL"
    | "NO_EVIDENCE";
};

export type UnresolvedCitation = {
  citationId: string;
  citationText: string;
  reason: string;
};

export type ReasonCode =
  | "NO_CITATION"
  | "UNRESOLVED_CITATION"
  | "NO_EVIDENCE"
  | "CLAIM_NOT_ANALYSABLE"
  | "CONFLICTING_EVIDENCE"
  | "INSUFFICIENT_EVIDENCE"
  | "SUPERSEDED_BY_NEWER_EVIDENCE"
  | "CONTRADICTING_EVIDENCE"
  | "OVERSTATED_CLAIM"
  | "SUPPORTING_EVIDENCE"
  | "CITED_SOURCE_OFF_TOPIC"
  | "FINDING_NOT_REPORTED";

export type ClaimVerification = {
  claimId: string;
  verdict: Verdict;
  /** 0–100: confidence in this AUTOMATED assessment, not in the science. */
  confidence: number;
  explanation: string;
  reasonCode: ReasonCode;
  supportingEvidence: AssessedEvidence[];
  contradictingEvidence: AssessedEvidence[];
  /** Relevant passages without a stance, and stated limitations of the sources. */
  contextEvidence: AssessedEvidence[];
  publications: PublicationAssessment[];
  unresolvedCitations: UnresolvedCitation[];
  evidenceSource: EvidenceSourceType;
  verificationScope: VerificationScope;
  limitations: string[];
  humanReview: { recommended: boolean; reasons: string[] };
  method: VerificationMethod;
  strategy: string;
  rulesApplied: string[];
  /** Always "AUTOMATED": a machine assessment, never a confirmed fact. */
  assessmentType: "AUTOMATED";
  disclaimer: string;
};
