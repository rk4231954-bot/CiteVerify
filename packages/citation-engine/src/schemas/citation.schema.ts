import {
  citationMatchStatusSchema,
  claimCitationStatusSchema,
} from "@citeverify/shared";
import { z } from "zod";

export const citationFormatSchema = z.enum(["NUMERIC", "AUTHOR_YEAR"]);

/** The minimal paragraph shape needed (a subset of document-parser's Paragraph). */
export const sourceParagraphSchema = z.object({
  id: z.string(),
  order: z.number().int().nonnegative(),
  originalText: z.string(),
  cleanedText: z.string(),
  pageNumber: z.number().int().positive().nullable(),
  section: z.string().nullable(),
});

export const numericTargetSchema = z.object({
  kind: z.literal("NUMERIC"),
  number: z.number().int().positive(),
});

export const authorYearTargetSchema = z.object({
  kind: z.literal("AUTHOR_YEAR"),
  /** Surnames exactly as written in the citation. */
  authors: z.array(z.string()).min(1),
  etAl: z.boolean(),
  /** null for "n.d." / "in press". */
  year: z.number().int().nullable(),
  yearSuffix: z.string().nullable(),
  /** "Smith et al. (2020)" rather than "(Smith et al., 2020)". */
  narrative: z.boolean(),
});

export const citationTargetSchema = z.discriminatedUnion("kind", [
  numericTargetSchema,
  authorYearTargetSchema,
]);

/** One cited item. A marker such as "[1–3]" yields three of these. */
export const detectedCitationSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  format: citationFormatSchema,
  /** The whole marker exactly as written, e.g. "[1–3]" or "(Doe, 2020; Roe, 2021)". */
  citationText: z.string(),
  /** The cited item, e.g. "2" or "Smith et al., 2020a". */
  citationKey: z.string(),
  target: citationTargetSchema,
  paragraphId: z.string(),
  pageNumber: z.number().int().positive().nullable(),
  section: z.string().nullable(),
  /** Marker offsets in the paragraph's cleanedText. */
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

export const parsedReferenceSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  /** The full entry text, including its label. Always kept, even when parsing fails. */
  rawText: z.string().min(1),
  label: z.string().nullable(),
  /** Authors as written; empty when they could not be identified. */
  authors: z.array(z.string()),
  /** True when the entry abbreviates its author list ("et al."). */
  authorsTruncated: z.boolean(),
  title: z.string().nullable(),
  year: z.number().int().nullable(),
  yearSuffix: z.string().nullable(),
  venue: z.string().nullable(),
  doi: z.string().nullable(),
  url: z.string().nullable(),
  paragraphId: z.string(),
  pageNumber: z.number().int().positive().nullable(),
  position: z.number().int().nonnegative(),
  fingerprint: z.string(),
});

export const matchCandidateSchema = z.object({
  referenceId: z.string(),
  score: z.number().min(0).max(1),
  reasons: z.array(z.string()),
});

export const citationMatchSchema = z.object({
  citationId: z.string(),
  status: citationMatchStatusSchema,
  /** Set only when status is MATCHED. */
  referenceId: z.string().nullable(),
  /** Confidence of the chosen match (0 when nothing was chosen). */
  confidence: z.number().min(0).max(1),
  /** All plausible candidates, best first — kept so uncertain matches stay visible. */
  candidates: z.array(matchCandidateSchema),
  reason: z.string(),
});

export const claimInputSchema = z.object({
  id: z.string(),
  paragraphId: z.string().nullable(),
  originalText: z.string(),
});

export const claimCitationLinkSchema = z.object({
  claimId: z.string(),
  citationId: z.string(),
  status: claimCitationStatusSchema,
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});
