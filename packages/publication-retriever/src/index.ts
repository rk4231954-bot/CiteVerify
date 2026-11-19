/**
 * @citeverify/publication-retriever — retrieves publication METADATA for
 * bibliography references from Crossref and OpenAlex. Metadata (even an
 * abstract or an open-access URL) does not mean the full text is available,
 * and a retrieved publication is not evidence for or against any claim.
 */
import {
  CrossrefProvider,
  type CrossrefProviderOptions,
} from "./providers/crossref.provider.ts";
import {
  OpenAlexProvider,
  type OpenAlexProviderOptions,
} from "./providers/openalex.provider.ts";
import {
  PublicationRetriever,
  type RetrieverOptions,
} from "./services/publication-search.service.ts";

export type DefaultRetrieverConfig = {
  /** Contact email for the providers' polite pools (optional). */
  mailto?: string;
  openAlexApiKey?: string;
  timeoutMs?: number;
  fetch?: CrossrefProviderOptions["fetch"];
  logger?: CrossrefProviderOptions["logger"];
  sleep?: CrossrefProviderOptions["sleep"];
  maxRetries?: number;
  retryBaseDelayMs?: number;
  minIntervalMs?: number;
} & Pick<RetrieverOptions, "searchLimit" | "enrich">;

/** Crossref first, OpenAlex as complement and fallback. */
export function createDefaultRetriever(
  config: DefaultRetrieverConfig = {},
): PublicationRetriever {
  const shared: Partial<CrossrefProviderOptions & OpenAlexProviderOptions> = {
    mailto: config.mailto,
    timeoutMs: config.timeoutMs,
    fetch: config.fetch,
    logger: config.logger,
    sleep: config.sleep,
    maxRetries: config.maxRetries,
    retryBaseDelayMs: config.retryBaseDelayMs,
    minIntervalMs: config.minIntervalMs,
  };
  return new PublicationRetriever({
    primary: new CrossrefProvider(shared),
    fallback: new OpenAlexProvider({
      ...shared,
      apiKey: config.openAlexApiKey,
    }),
    searchLimit: config.searchLimit,
    enrich: config.enrich,
  });
}

export {
  CrossrefProvider,
  type CrossrefProviderOptions,
} from "./providers/crossref.provider.ts";
export {
  OpenAlexProvider,
  type OpenAlexProviderOptions,
} from "./providers/openalex.provider.ts";
export {
  doiFromUrl,
  doiToUrl,
  encodeDoiPath,
  extractDois,
  normalizeDoi,
  resolveReferenceDoi,
} from "./resolvers/doi-resolver.ts";
export * from "./schemas/crossref.schema.ts";
export * from "./schemas/openalex.schema.ts";
export * from "./schemas/publication.schema.ts";
export {
  isSameWork,
  mergePublications,
  normalizeCrossrefWork,
  normalizeOpenAlexWork,
  type StoredCandidate,
  summarizeCandidate,
} from "./services/publication-normalizer.service.ts";
export {
  MATCH_THRESHOLD,
  PublicationRetriever,
  type RetrieverOptions,
  scoreCandidate,
} from "./services/publication-search.service.ts";
export * from "./types/publication.types.ts";
export { ProviderError } from "./utils/errors.ts";
export {
  consoleLogger,
  type FetchLike,
  HttpClient,
  type HttpClientOptions,
  redact,
} from "./utils/http.ts";
export {
  decodeEntities,
  diceSimilarity,
  invertedIndexToText,
  normalizeTitle,
  stripMarkup,
  titleSimilarity,
} from "./utils/text.ts";
