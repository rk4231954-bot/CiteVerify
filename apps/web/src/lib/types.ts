/**
 * Response DTOs of the CiteVerify API (apps/api). Enum-like values reuse the
 * constants of @citeverify/shared so the frontend and backend cannot drift.
 */
import type {
  CitationMatchStatus,
  CitationType,
  ClaimCategory,
  ClaimCharacteristic,
  ClaimCitationStatus,
  ClaimExtractionMethod,
  DocumentStatus,
  EvidenceAvailability,
  EvidenceType,
  ExtractionStatus,
  FullTextStatus,
  JobStage,
  JobStatus,
  PublicationMatchStatus,
  Verdict,
  VerificationScope,
} from "@citeverify/shared";

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface AppConfig {
  upload: { maxBytes: number; extensions: string[]; mimeTypes: string[] };
  features: {
    aiClaimExtraction: boolean;
    aiEvidenceExtraction: boolean;
    aiVerification: boolean;
    openAccessFullText: boolean;
    reportExport: boolean;
  };
}

export interface DocumentSummary {
  id: string;
  title: string;
  originalFilename: string;
  fileType: string;
  fileSize: number;
  status: DocumentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface JobSummary {
  id: string;
  status: JobStatus;
  currentStage: JobStage | null;
  createdAt: string;
  completedAt: string | null;
}

export interface DocumentDetail extends DocumentSummary {
  counts: { claims: number; citations: number; references: number };
  latestJob: JobSummary | null;
}

export interface DocumentList {
  items: DocumentSummary[];
  page: number;
  limit: number;
  total: number;
}

export interface UploadResponse {
  id: string;
  status: DocumentStatus;
  document: DocumentSummary;
}

export interface Paragraph {
  id: string;
  order: number;
  originalText: string;
  cleanedText: string;
  pageNumber: number | null;
  section: string | null;
}

export interface ExtractionResult {
  format: string;
  title: string | null;
  authors: string[];
  abstract: string | null;
  totalPages: number | null;
  pages: Array<{
    pageNumber: number;
    paragraphCount: number;
    characterCount: number;
    hasText: boolean;
  }>;
  paragraphs: Paragraph[];
  headings?: Array<{
    text: string;
    level?: number;
    pageNumber?: number | null;
  }>;
  tables?: unknown[];
  metadata?: Record<string, unknown>;
  warnings: string[];
  stats: { paragraphCount: number; wordCount: number; characterCount: number };
  parser?: { name?: string; version?: string } | string;
}

export interface ExtractionResponse {
  documentId: string;
  documentStatus: DocumentStatus;
  extraction: {
    status: ExtractionStatus;
    errorCode: string | null;
    errorMessage: string | null;
    extractedAt: string | null;
    result: ExtractionResult | null;
  } | null;
}

export interface Claim {
  id: string;
  documentId: string;
  originalText: string;
  normalizedText: string;
  category: ClaimCategory;
  characteristics: ClaimCharacteristic[];
  rationale: string[];
  pageNumber: number | null;
  section: string | null;
  paragraphId: string | null;
  position: number;
  confidence: number;
  extractionMethod: ClaimExtractionMethod;
  createdAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ClaimList {
  documentId: string;
  claims: Claim[];
  pagination: Pagination;
}

export interface ClaimCitationLink {
  citationId: string;
  citationText: string;
  citationKey: string | null;
  linkStatus: ClaimCitationStatus;
  linkConfidence: number;
  linkReason: string | null;
  matchStatus: CitationMatchStatus;
  matchConfidence: number | null;
  referenceId: string | null;
}

export interface ClaimDetail extends Claim {
  citations: ClaimCitationLink[];
}

export interface ExtractClaimsResponse {
  method: string;
  created: number;
  skippedDuplicates: number;
  removed: number;
  stats: Record<string, unknown>;
  warnings: string[];
  claims: Claim[];
}

export interface ReferenceBrief {
  id: string;
  label: string | null;
  rawText: string;
  authors: string[];
  year: number | null;
  yearSuffix: string | null;
  title: string | null;
  doi: string | null;
}

export interface Citation {
  id: string;
  documentId: string;
  citationText: string;
  citationKey: string | null;
  citationType: CitationType;
  pageNumber: number | null;
  section: string | null;
  paragraphId: string | null;
  charStart: number | null;
  charEnd: number | null;
  position: number;
  matchStatus: CitationMatchStatus;
  matchConfidence: number | null;
  referenceId: string | null;
  reference: ReferenceBrief | null;
  claims: Array<{
    claimId: string;
    status: ClaimCitationStatus;
    confidence: number;
    reason: string | null;
  }>;
  createdAt: string;
}

export interface CitationList {
  documentId: string;
  citations: Citation[];
  pagination: Pagination;
}

export interface DetectCitationsResponse {
  stats: {
    citations?: number;
    references?: number;
    matched: number;
    ambiguous: number;
    unmatched: number;
    needsReview: number;
    claimLinks: number;
    [k: string]: unknown;
  };
  warnings: string[];
}

export interface Reference {
  id: string;
  label: string | null;
  rawText: string;
  authors: string[];
  title: string | null;
  year: number | null;
  venue: string | null;
  doi: string | null;
  doiUrl: string | null;
  pageNumber: number | null;
  position: number;
  publicationId: string | null;
}

export interface ReferenceList {
  references: Reference[];
  total: number;
}

export interface Publication {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  doiUrl: string | null;
  journal: string | null;
  publisher: string | null;
  abstract: string | null;
  sourceUrl: string | null;
  openAccess: boolean;
  openAccessStatus: string | null;
  openAccessUrl: string | null;
  openAlexId: string | null;
  providers: string[];
  retrievalStatus: string;
  retrievedAt: string | null;
}

export interface PublicationCandidate {
  score?: number;
  confidence?: number;
  title?: string | null;
  year?: number | null;
  doi?: string | null;
  [k: string]: unknown;
}

export interface ReferencePublicationRow {
  reference: Reference;
  retrieval: {
    status: PublicationMatchStatus | null;
    confidence: number | null;
    method: string | null;
    retrievedAt: string | null;
    errors: unknown;
  };
  publication: Publication | null;
  candidates: PublicationCandidate[];
}

export interface DocumentPublications {
  references: ReferencePublicationRow[];
  publications: Publication[];
  total: number;
  note: string;
}

export interface RetrievePublicationsResponse {
  stats: {
    references: number;
    processed: number;
    skipped: number;
    remaining: number;
    publicationsCreated: number;
    byStatus: Record<string, number>;
  };
  providers: unknown;
  note: string;
}

export interface PublicationDetail {
  publication: Publication;
  references: Array<{
    id: string;
    documentId: string;
    label: string | null;
    rawText: string;
    publicationMatchStatus: PublicationMatchStatus | null;
    publicationMatchConfidence: number | null;
  }>;
  note: string;
}

export interface Evidence {
  id: string;
  publicationId: string;
  sourceText: string;
  normalizedText: string;
  evidenceType: EvidenceType;
  section: string | null;
  pageNumber: number | null;
  sourceUrl: string | null;
  extractionMethod: string;
  evidenceAvailability: EvidenceAvailability;
  confidence: number;
  details: Record<string, unknown> | null;
  position: number;
  createdAt: string;
}

export interface PublicationEvidence {
  publication: {
    id: string;
    title: string;
    year: number | null;
    doi: string | null;
    doiUrl: string | null;
    journal: string | null;
    fullTextStatus: FullTextStatus | null;
    evidenceExtractedAt: string | null;
  };
  verificationScope: VerificationScope;
  total: number;
  evidence: Evidence[];
}

export interface ExtractEvidenceResponse {
  verificationScope: VerificationScope;
  fullText: {
    status: FullTextStatus;
    reason: string | null;
    sourceUrl: string | null;
  };
  stats: Record<string, unknown>;
  created: number;
  warnings: string[];
}

export type EvidenceSourceType = "FULL_TEXT" | "ABSTRACT" | "MIXED" | "NONE";

export interface ResultEvidence {
  evidenceId: string | null;
  publicationId: string;
  role: "SUPPORTING" | "CONTRADICTING" | "CONTEXT";
  stance: string;
  sourceText: string;
  evidenceType: EvidenceType | null;
  evidenceAvailability: EvidenceAvailability | null;
  section: string | null;
  pageNumber: number | null;
  sourceUrl: string | null;
  relevanceScore: number;
  flags: string[];
  rationale: string[];
}

export interface ResultPublication {
  id: string;
  title: string;
  year: number | null;
  doi: string | null;
  journal: string | null;
  sourceUrl: string | null;
  fullTextStatus: FullTextStatus | null;
  citationIds: string[];
  citationTexts: string[];
  evidenceCount: number;
  evidenceSource: EvidenceSourceType;
  onTopic: boolean;
  contribution:
    | "SUPPORTING"
    | "CONTRADICTING"
    | "MIXED"
    | "NEUTRAL"
    | "NO_EVIDENCE";
}

export interface VerificationResult {
  id: string;
  jobId: string;
  claimId: string;
  claim: {
    originalText: string;
    pageNumber: number | null;
    section: string | null;
  };
  verdict: Verdict;
  /** 0–100: confidence in the automated assessment, not in the claim. */
  confidence: number;
  explanation: string;
  reasonCode: string | null;
  evidenceSummary: string | null;
  evidenceSource: EvidenceSourceType;
  verificationScope: VerificationScope;
  supportingEvidence: ResultEvidence[];
  contradictingEvidence: ResultEvidence[];
  contextEvidence: ResultEvidence[];
  publications: ResultPublication[];
  unresolvedCitations: Array<{
    citationId: string;
    citationText: string;
    reason: string;
  }>;
  limitations: string[];
  humanReview: { recommended: boolean; reasons: string[] };
  method: string;
  strategy: string | null;
  rulesApplied: string[];
  assessmentType: "AUTOMATED";
  disclaimer: string;
  createdAt: string;
}

export interface VerificationJob {
  id: string;
  status: JobStatus;
  stage: JobStage | null;
  method: string;
  totalClaims: number;
  processedClaims: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  stale?: boolean;
}

export interface VerificationSummary {
  claims: number;
  byVerdict: Record<Verdict, number>;
  humanReviewRecommended: number;
  averageConfidence: number | null;
}

export interface DocumentVerification {
  job: VerificationJob | null;
  summary: VerificationSummary;
  total?: number;
  results: VerificationResult[];
  reason: string | null;
  assessmentType: "AUTOMATED";
  disclaimer: string;
}

export interface VerificationStatus {
  documentId: string;
  verified: boolean;
  latestJob: VerificationJob | null;
  latestCompletedJobId: string | null;
  lastVerifiedAt: string | null;
}

export interface ClaimVerification {
  claimId: string;
  verified: boolean;
  result: VerificationResult | null;
  history: Array<{
    resultId: string;
    jobId: string;
    jobStatus: JobStatus;
    verdict: Verdict;
    confidence: number;
    humanReviewRequired: boolean;
    createdAt: string;
  }>;
}
