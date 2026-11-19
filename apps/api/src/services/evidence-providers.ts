/**
 * Content sources for evidence extraction. Replaceable (tests inject mocks).
 *
 * Full text: only open-access PDFs reported by OpenAlex are fetched — closed
 * works, landing pages, logins and encrypted files are never worked around.
 */
import {
  type EvidenceAiProvider,
  type FullTextRequest,
  type FullTextResult,
  fetchOpenAccessFullText,
} from "@citeverify/evidence-extractor";
import { FullTextStatus } from "@citeverify/shared";
import { env } from "../config/env.ts";

export type FullTextSource = (
  request: FullTextRequest,
) => Promise<FullTextResult>;

const defaultSource: FullTextSource = (request) => {
  if (!env.EVIDENCE_FULLTEXT_ENABLED)
    return Promise.resolve({
      status: FullTextStatus.NOT_ATTEMPTED,
      sourceUrl: null,
      extraction: null,
      reason: "full-text retrieval is disabled on this server",
    });
  return fetchOpenAccessFullText(request, {
    timeoutMs: env.EVIDENCE_FULLTEXT_TIMEOUT_MS,
    maxBytes: env.EVIDENCE_FULLTEXT_MAX_BYTES,
    userAgent: `CiteVerify/0.1${env.PUBLICATION_CONTACT_EMAIL ? ` (mailto:${env.PUBLICATION_CONTACT_EMAIL})` : ""}`,
  });
};

let override: FullTextSource | null = null;

export const getFullTextSource = (): FullTextSource =>
  override ?? defaultSource;

/** For tests: null restores the default. */
export function setFullTextSource(source: FullTextSource | null) {
  override = source;
}

/**
 * AI provider for `method: "AI"` evidence extraction. None is configured: the
 * rule-based extractor needs no paid API. Implement `EvidenceAiProvider` (any
 * vendor or a local model) and return it here; every proposal is still checked
 * to be a verbatim quote of the source.
 */
let aiOverride: EvidenceAiProvider | null = null;
export const getEvidenceAiProvider = (): EvidenceAiProvider | null =>
  aiOverride;
export function setEvidenceAiProvider(provider: EvidenceAiProvider | null) {
  aiOverride = provider;
}
