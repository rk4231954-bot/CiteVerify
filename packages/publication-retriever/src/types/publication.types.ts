import type {
  PublicationMatchStatus,
  PublicationProvider,
} from "@citeverify/shared";

/**
 * Provider-independent publication metadata. Every field is exactly what a
 * provider returned (or null when it returned nothing) — never filled in.
 * Having metadata or an abstract does not mean the full text is available.
 */
export type NormalizedPublication = {
  provider: PublicationProvider;
  /** Every provider whose data is in this record (primary first, then merged-in ones). */
  sources: PublicationProvider[];
  /** Provider-specific id: the DOI for Crossref, "W…" for OpenAlex. */
  providerId: string;
  doi: string | null;
  title: string;
  /** As the provider writes them: Crossref "Family, Given"; OpenAlex display names. */
  authors: string[];
  year: number | null;
  journal: string | null;
  publisher: string | null;
  abstract: string | null;
  /** Landing page / publication URL. */
  url: string | null;
  /** null = the provider does not say. */
  openAccess: boolean | null;
  openAccessStatus: string | null;
  openAccessUrl: string | null;
  openAlexId: string | null;
  type: string | null;
};

/** What we know about a bibliography entry (from citation-engine records). */
export type ReferenceQuery = {
  id: string;
  rawText: string;
  doi: string | null;
  title: string | null;
  authors: string[];
  year: number | null;
};

export type PublicationCandidate = {
  publication: NormalizedPublication;
  score: number;
  reasons: string[];
};

export type ProviderErrorKind =
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "HTTP"
  | "NETWORK"
  | "INVALID_RESPONSE";

export type ProviderFailure = {
  provider: PublicationProvider;
  kind: ProviderErrorKind;
  message: string;
  status?: number;
};

export type MatchMethod = "DOI" | "TITLE";

export type RetrievalResult = {
  referenceId: string;
  status: PublicationMatchStatus;
  /** Confidence of the chosen publication (0 unless MATCHED). */
  confidence: number;
  method: MatchMethod | null;
  /** Set only when status is MATCHED. */
  publication: NormalizedPublication | null;
  /** Everything considered, best first — uncertain outcomes stay visible. */
  candidates: PublicationCandidate[];
  reason: string;
  errors: ProviderFailure[];
};

export type Logger = {
  warn: (message: string, meta?: Record<string, unknown>) => void;
};

/** A replaceable metadata source. */
export interface PublicationSource {
  readonly name: PublicationProvider;
  /** Exact DOI lookup. Resolves to null when the provider does not know the DOI. */
  lookupDoi(doi: string): Promise<NormalizedPublication | null>;
  /** Bibliographic search (title, optionally author/year hints). */
  search(
    query: { text: string; title: string | null; year: number | null },
    limit: number,
  ): Promise<NormalizedPublication[]>;
}
