/**
 * @citeverify/evidence-extractor — finds evidence passages (findings,
 * results, statistics, methods, limitations, conclusions) in a publication's
 * available content, and ranks them by RELEVANCE to a claim.
 *
 * It never decides whether a claim is supported or contradicted, never
 * rewrites passages, and never fetches content that is not openly accessible.
 */

export {
  classifyEvidenceSentence,
  detectSignals,
  type EvidenceClassification,
  isNonEvidence,
  type SentenceSignals,
} from "./classifiers/evidence-classifier.ts";
export {
  classifyHeading,
  normalizeHeading,
  SectionTracker,
} from "./classifiers/section-classifier.ts";
export {
  type AbstractSegment,
  abstractPassages,
  segmentAbstract,
} from "./extractors/abstract-extractor.ts";
export { extractEvidenceWithAi } from "./extractors/ai-extractor.ts";
export { fullTextPassages } from "./extractors/fulltext-extractor.ts";
export {
  buildEvidence,
  extractEvidenceRuleBased,
  passageSentences,
} from "./extractors/rule-based-extractor.ts";
export {
  DEFAULT_MIN_RELEVANCE,
  DEFAULT_TOP_K,
  rankEvidenceForClaim,
  subjectOutcome,
} from "./matchers/relevance-matcher.ts";
export {
  contentPassages,
  DEFAULT_MAX_EVIDENCE,
  DEFAULT_MIN_CONFIDENCE,
  type ExtractEvidenceOptions,
  extractEvidence,
} from "./processors/evidence-processor.ts";
export * from "./schemas/evidence.schema.ts";
export {
  type FullTextOptions,
  type FullTextRequest,
  type FullTextResult,
  fetchOpenAccessFullText,
  isFetchableUrl,
} from "./sources/open-access-source.ts";
export * from "./types/evidence.types.ts";
export {
  extractDetails,
  extractSampleSizes,
  extractStatistics,
} from "./utils/details.ts";
export {
  EvidenceExtractionError,
  type EvidenceExtractionErrorCode,
} from "./utils/errors.ts";
export { contentTokens, numericExpressions, stem } from "./utils/text.ts";
