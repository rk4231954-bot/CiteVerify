# @citeverify/evidence-extractor

Finds **evidence passages** in a publication's available content and ranks them by **relevance** to a claim.

It never decides whether a claim is supported or contradicted, never rewrites passages, and never fetches content that is not openly accessible.

```ts
import {
  extractEvidence,
  fetchOpenAccessFullText,
  rankEvidenceForClaim,
} from "@citeverify/evidence-extractor";

// Full text only for open-access works with an OA PDF URL (else a status + reason).
const fullText = await fetchOpenAccessFullText({ openAccess, openAccessUrl });

const output = await extractEvidence({
  publicationId,
  abstract,
  abstractSourceUrl,
  fullText: fullText.extraction
    ? {
        paragraphs: fullText.extraction.paragraphs,
        sourceUrl: fullText.sourceUrl,
      }
    : null,
});
// output.verificationScope: FULL | LIMITED (abstract only) | NONE

const ranked = rankEvidenceForClaim(
  { id: claimId, text: claimText },
  output.evidence.map((e) => ({
    id: e.id,
    text: e.normalizedText,
    evidenceType: e.evidenceType,
  })),
);
// [{ evidenceId, rank, relevanceScore, relevanceLevel, matchedTerms, matchedNumbers, breakdown }]
```

## Categories

| Type                  | Typical source                                                    |
| --------------------- | ----------------------------------------------------------------- |
| `ABSTRACT_FINDING`    | A result/finding sentence in an abstract (limited scope)          |
| `EXPERIMENTAL_RESULT` | Results-section outcome without statistics                        |
| `STATISTICAL_RESULT`  | p-values, CIs, effect sizes, mean ± SD, test statistics, percents |
| `METHODOLOGY`         | Design, sample, procedures, conditions                            |
| `DISCUSSION`          | Interpretation of this study's results                            |
| `LIMITATION`          | Stated limitations / caveats                                      |
| `CONCLUSION`          | Authors' conclusions                                              |

Each item keeps `sourceText` verbatim with `section`, `pageNumber` (full text only), `sourceUrl`, `evidenceAvailability`, `confidence` (of the classification, not of truth) and `details`: verbatim sample sizes, statistics, design terms, study conditions and source offsets.

## Layout

```
src/
  extractors/   abstract-extractor (structured labels), fulltext-extractor (sections/pages),
                rule-based-extractor, ai-extractor (proposals must quote the source verbatim)
  classifiers/  section-classifier (headings → section kinds), evidence-classifier
  processors/   evidence-processor (passages → evidence, dedup, scope, warnings)
  matchers/     relevance-matcher (claim ↔ passage relevance ranking)
  sources/      open-access-source (OA PDF fetch: no paywall bypass, no private hosts)
  schemas/      zod schemas (stored details, AI proposals, relevance)
  types/        evidence.types.ts
  utils/        patterns, details, text
tests/          synthetic fixtures only; no network
```

## Limitations

- Rule-based: cue words and section headings, not semantic understanding. Unusual headings fall back to sentence cues (with a warning).
- Relevance is lexical (terms, numbers, phrases, character similarity) — synonyms and paraphrases score low; a high score is not support.
- Abstract-only publications give limited scope: methods, full results and limitations are usually missing.
- Full text: PDF only; scanned PDFs without a text layer yield nothing; tables and figures are not interpreted.
