import type { Prisma } from "./generated/prisma/client.ts";

// Domain value types for the TEXT status columns (single source: @citeverify/shared).
export type {
  CitationType,
  DocumentStatus,
  EvidenceAvailability,
  EvidenceType,
  JobStage,
  JobStatus,
  RetrievalStatus,
  Verdict,
} from "@citeverify/shared";

/** A document with its extracted claims and each claim's verification results. */
export type DocumentWithClaims = Prisma.DocumentGetPayload<{
  include: { claims: { include: { results: true } } };
}>;

/** A verification job with its per-claim results and report. */
export type VerificationJobWithResults = Prisma.VerificationJobGetPayload<{
  include: { results: true; report: true };
}>;

/** `authors` columns hold a JSON-encoded string array. */
export function serializeAuthors(authors: readonly string[]): string {
  return JSON.stringify(authors);
}

export function parseAuthors(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((a): a is string => typeof a === "string")
      : [];
  } catch {
    return [];
  }
}
