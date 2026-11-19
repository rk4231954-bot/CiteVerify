import { z } from "zod";
import {
  CitationType,
  DocumentStatus,
  EvidenceType,
  ExtractionStatus,
  JobStage,
  JobStatus,
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

/** 0..1 confidence score used by claims and verification results. */
export const confidenceSchema = z.number().min(0).max(1);
