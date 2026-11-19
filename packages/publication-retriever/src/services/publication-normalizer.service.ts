/**
 * Converts provider responses into NormalizedPublication. Missing fields stay
 * null — nothing is inferred. Crossref's metadata does not say whether a work
 * is open access, so `openAccess` is null for Crossref records.
 */
import { PublicationProvider } from "@citeverify/shared";
import type { z } from "zod";
import { doiFromUrl, normalizeDoi } from "../resolvers/doi-resolver.ts";
import type { CrossrefWork } from "../schemas/crossref.schema.ts";
import type { OpenAlexWork } from "../schemas/openalex.schema.ts";
import type { storedCandidateSchema } from "../schemas/publication.schema.ts";
import type {
  NormalizedPublication,
  PublicationCandidate,
} from "../types/publication.types.ts";

export type StoredCandidate = z.infer<typeof storedCandidateSchema>;

import { invertedIndexToText, stripMarkup } from "../utils/text.ts";

const clean = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const text = stripMarkup(value);
  return text || null;
};

const yearOf = (date?: { "date-parts"?: (number | null)[][] }) => {
  const y = date?.["date-parts"]?.[0]?.[0];
  return typeof y === "number" && y > 1000 && y < 3000 ? y : null;
};

export function normalizeCrossrefWork(
  work: CrossrefWork,
): NormalizedPublication | null {
  const main = clean(work.title?.[0]);
  if (!main) return null; // a record without a title can't be shown or matched
  const subtitle = clean(work.subtitle?.[0]);
  const doi = normalizeDoi(work.DOI);
  return {
    provider: PublicationProvider.CROSSREF,
    sources: [PublicationProvider.CROSSREF],
    providerId: doi ?? work.DOI,
    doi,
    title:
      subtitle && !main.toLowerCase().includes(subtitle.toLowerCase())
        ? `${main}: ${subtitle}`
        : main,
    authors: (work.author ?? []).flatMap((a) => {
      if (a.family) return [a.given ? `${a.family}, ${a.given}` : a.family];
      return a.name ? [a.name] : [];
    }),
    year:
      yearOf(work.issued) ??
      yearOf(work.published) ??
      yearOf(work["published-print"]) ??
      yearOf(work["published-online"]),
    journal: clean(work["container-title"]?.[0]),
    publisher: clean(work.publisher),
    abstract: clean(work.abstract),
    url: work.resource?.primary?.URL ?? work.URL ?? null,
    openAccess: null,
    openAccessStatus: null,
    openAccessUrl: null,
    openAlexId: null,
    type: work.type ?? null,
  };
}

export function normalizeOpenAlexWork(
  work: OpenAlexWork,
): NormalizedPublication | null {
  const title = clean(work.title ?? work.display_name);
  if (!title) return null;
  const openAlexId = work.id.replace(/^https?:\/\/openalex\.org\//i, "");
  const oa = work.open_access;
  return {
    provider: PublicationProvider.OPENALEX,
    sources: [PublicationProvider.OPENALEX],
    providerId: openAlexId,
    doi: doiFromUrl(work.doi),
    title,
    authors: (work.authorships ?? []).flatMap((a) => {
      const name = a.author?.display_name ?? a.raw_author_name;
      return name ? [name] : [];
    }),
    year: work.publication_year ?? null,
    journal: clean(work.primary_location?.source?.display_name),
    publisher: clean(work.primary_location?.source?.host_organization_name),
    abstract: invertedIndexToText(work.abstract_inverted_index),
    url: work.primary_location?.landing_page_url ?? null,
    openAccess: typeof oa?.is_oa === "boolean" ? oa.is_oa : null,
    openAccessStatus: oa?.oa_status ?? null,
    openAccessUrl: oa?.oa_url ?? null,
    openAlexId,
    type: work.type ?? null,
  };
}

/**
 * Combines two records of the SAME work: `primary` wins every field it has;
 * `secondary` only fills fields the primary lacks. Never replaces data.
 */
export function mergePublications(
  primary: NormalizedPublication,
  secondary: NormalizedPublication,
): NormalizedPublication {
  const merged = { ...primary };
  for (const key of Object.keys(primary) as (keyof NormalizedPublication)[]) {
    const current = merged[key];
    const empty =
      current === null || (Array.isArray(current) && current.length === 0);
    if (empty) Object.assign(merged, { [key]: secondary[key] });
  }
  merged.sources = [...new Set([...primary.sources, ...secondary.sources])];
  return merged;
}

/** True when two records describe the same work (shared DOI or OpenAlex id). */
export function isSameWork(
  a: NormalizedPublication,
  b: NormalizedPublication,
): boolean {
  if (a.doi && b.doi) return a.doi === b.doi;
  if (a.openAlexId && b.openAlexId) return a.openAlexId === b.openAlexId;
  return a.provider === b.provider && a.providerId === b.providerId;
}

/** Compact, storable form of a candidate (see storedCandidateSchema). */
export function summarizeCandidate(c: PublicationCandidate): StoredCandidate {
  const p = c.publication;
  return {
    provider: p.provider,
    providerId: p.providerId,
    doi: p.doi,
    title: p.title,
    authors: p.authors.slice(0, 10),
    year: p.year,
    journal: p.journal,
    url: p.url,
    score: c.score,
    reasons: c.reasons,
  };
}
