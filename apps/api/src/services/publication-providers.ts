/**
 * Publication metadata providers. Crossref first, OpenAlex as complement and
 * fallback. Replaceable: tests (or another deployment) can swap the retriever.
 */
import {
  createDefaultRetriever,
  type PublicationRetriever,
} from "@citeverify/publication-retriever";
import { env } from "../config/env.ts";

let instance: PublicationRetriever | null = null;
let override: PublicationRetriever | null = null;

export function getPublicationRetriever(): PublicationRetriever {
  if (override) return override;
  instance ??= createDefaultRetriever({
    mailto: env.PUBLICATION_CONTACT_EMAIL,
    openAlexApiKey: env.OPENALEX_API_KEY,
    timeoutMs: env.PUBLICATION_RETRIEVAL_TIMEOUT_MS,
  });
  return instance;
}

/** For tests: use a retriever with mocked providers (null restores the default). */
export function setPublicationRetriever(
  retriever: PublicationRetriever | null,
) {
  override = retriever;
}
