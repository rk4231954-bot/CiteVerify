import { z } from "zod";
import {
  CitationMatchStatus,
  CitationType,
  ClaimCategory,
  ClaimCharacteristic,
  ClaimCitationStatus,
  ClaimExtractionMethod,
  DocumentStatus,
  EvidenceType,
  ExtractionStatus,
  JobStage,
  JobStatus,
  PublicationMatchStatus,
  PublicationProvider,
  RetrievalStatus,
  Verdict,
} from "./constants.ts";

const values = <T extends Record<string, string>>(o: T) =>
  Object.values(o) as [T[keyof T], ...T[keyof T][]];

export const documentStatusSchema = z.enum(values(DocumentStatus));
export const verdictSchema = z.enum(values(Verdict));
export const jobStatusSchema = z.enum(values(JobStatus));
export const jobStageSchema = z.enum(values(JobStage));
export const retrievalStatusSchema = z.enum(values(RetrievalStatus));
export const citationTypeSchema = z.enum(values(CitationType));
export const evidenceTypeSchema = z.enum(values(EvidenceType));
export const extractionStatusSchema = z.enum(values(ExtractionStatus));
export const claimCategorySchema = z.enum(values(ClaimCategory));
export const claimCharacteristicSchema = z.enum(values(ClaimCharacteristic));
export const claimExtractionMethodSchema = z.enum(
  values(ClaimExtractionMethod),
);

/** 0..1 confidence score used by claims and verification results. */
export const confidenceSchema = z.number().min(0).max(1);

export const citationMatchStatusSchema = z.enum(values(CitationMatchStatus));
export const claimCitationStatusSchema = z.enum(values(ClaimCitationStatus));
export const publicationMatchStatusSchema = z.enum(
  values(PublicationMatchStatus),
);
export const publicationProviderSchema = z.enum(values(PublicationProvider));
