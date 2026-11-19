/**
 * OpenAlex API provider (https://api.openalex.org). Used as a complement to
 * Crossref (open-access information, abstracts) and as a search fallback.
 * Optional `mailto` (polite pool) and `apiKey` come from configuration.
 */
import { PublicationProvider } from "@citeverify/shared";
import { encodeDoiPath } from "../resolvers/doi-resolver.ts";
import {
  openAlexSearchResponseSchema,
  openAlexWorkSchema,
} from "../schemas/openalex.schema.ts";
import { normalizeOpenAlexWork } from "../services/publication-normalizer.service.ts";
import type {
  NormalizedPublication,
  PublicationSource,
} from "../types/publication.types.ts";
import { HttpClient, type HttpClientOptions } from "../utils/http.ts";

export type OpenAlexProviderOptions = Omit<HttpClientOptions, "provider"> & {
  baseUrl?: string;
  mailto?: string;
  apiKey?: string;
};

const SELECT = [
  "id",
  "doi",
  "title",
  "display_name",
  "publication_year",
  "type",
  "authorships",
  "primary_location",
  "open_access",
  "abstract_inverted_index",
].join(",");

export class OpenAlexProvider implements PublicationSource {
  readonly name = PublicationProvider.OPENALEX;
  readonly http: HttpClient;
  private readonly baseUrl: string;
  private readonly auth: Record<string, string>;

  constructor(options: OpenAlexProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://api.openalex.org").replace(
      /\/$/,
      "",
    );
    this.auth = {
      ...(options.mailto ? { mailto: options.mailto } : {}),
      ...(options.apiKey ? { api_key: options.apiKey } : {}),
    };
    this.http = new HttpClient({
      ...options,
      provider: this.name,
      minIntervalMs: options.minIntervalMs ?? 110, // stays under ~10 requests/second
      userAgent:
        options.userAgent ??
        `CiteVerify/0.1${options.mailto ? ` (mailto:${options.mailto})` : ""}`,
    });
  }

  private url(path: string, params: Record<string, string> = {}) {
    return `${this.baseUrl}${path}?${new URLSearchParams({ ...params, ...this.auth }).toString()}`;
  }

  async lookupDoi(doi: string): Promise<NormalizedPublication | null> {
    const work = await this.http.getJson(
      this.url(`/works/doi:${encodeDoiPath(doi)}`, { select: SELECT }),
      openAlexWorkSchema,
    );
    return work ? normalizeOpenAlexWork(work) : null;
  }

  async search(
    query: { text: string; title: string | null },
    limit: number,
  ): Promise<NormalizedPublication[]> {
    // With a known title, search titles only; otherwise search the whole reference text.
    const params: Record<string, string> = query.title
      ? {
          filter: `title.search:${query.title.replace(/[,:|]/g, " ").slice(0, 300)}`,
        }
      : { search: query.text.slice(0, 300) };
    const body = await this.http.getJson(
      this.url("/works", {
        ...params,
        "per-page": String(limit),
        select: SELECT,
      }),
      openAlexSearchResponseSchema,
    );
    return (body?.results ?? []).flatMap((w) => normalizeOpenAlexWork(w) ?? []);
  }
}
