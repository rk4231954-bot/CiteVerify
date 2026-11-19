/**
 * Crossref REST API provider (https://api.crossref.org, no key required).
 * Polite pool: pass a contact email — it is sent as `mailto` and in the User-Agent.
 */
import { PublicationProvider } from "@citeverify/shared";
import { encodeDoiPath } from "../resolvers/doi-resolver.ts";
import {
  crossrefSearchResponseSchema,
  crossrefWorkResponseSchema,
} from "../schemas/crossref.schema.ts";
import { normalizeCrossrefWork } from "../services/publication-normalizer.service.ts";
import type {
  NormalizedPublication,
  PublicationSource,
} from "../types/publication.types.ts";
import { HttpClient, type HttpClientOptions } from "../utils/http.ts";

export type CrossrefProviderOptions = Omit<HttpClientOptions, "provider"> & {
  baseUrl?: string;
  /** Contact address for Crossref's polite pool (optional; never hardcoded). */
  mailto?: string;
};

const SELECT = [
  "DOI",
  "title",
  "subtitle",
  "author",
  "issued",
  "published-print",
  "published-online",
  "container-title",
  "publisher",
  "abstract",
  "URL",
  "type",
].join(",");

export class CrossrefProvider implements PublicationSource {
  readonly name = PublicationProvider.CROSSREF;
  readonly http: HttpClient;
  private readonly baseUrl: string;
  private readonly mailto: string | undefined;

  constructor(options: CrossrefProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://api.crossref.org").replace(
      /\/$/,
      "",
    );
    this.mailto = options.mailto || undefined;
    this.http = new HttpClient({
      ...options,
      provider: this.name,
      minIntervalMs: options.minIntervalMs ?? 100,
      userAgent:
        options.userAgent ??
        `CiteVerify/0.1${this.mailto ? ` (mailto:${this.mailto})` : ""}`,
    });
  }

  private url(path: string, params: Record<string, string> = {}) {
    const search = new URLSearchParams({
      ...params,
      ...(this.mailto ? { mailto: this.mailto } : {}),
    });
    const qs = search.toString();
    return `${this.baseUrl}${path}${qs ? `?${qs}` : ""}`;
  }

  async lookupDoi(doi: string): Promise<NormalizedPublication | null> {
    const body = await this.http.getJson(
      this.url(`/works/${encodeDoiPath(doi)}`),
      crossrefWorkResponseSchema,
    );
    return body ? normalizeCrossrefWork(body.message) : null;
  }

  async search(
    query: { text: string },
    limit: number,
  ): Promise<NormalizedPublication[]> {
    const body = await this.http.getJson(
      this.url("/works", {
        "query.bibliographic": query.text.slice(0, 500),
        rows: String(limit),
        select: SELECT,
      }),
      crossrefSearchResponseSchema,
    );
    return (body?.message.items ?? []).flatMap(
      (w) => normalizeCrossrefWork(w) ?? [],
    );
  }
}
