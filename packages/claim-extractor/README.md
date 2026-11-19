# @citeverify/claim-extractor

Finds **scientific claims** in the paragraphs produced by `@citeverify/document-parser`. It runs fully offline, with no AI provider and no paid API.

```ts
import { extractClaims } from "@citeverify/claim-extractor";

const { claims, stats, warnings } = await extractClaims(
  { documentId, extraction }, // extraction = stored ExtractionResult
  { method: "RULE_BASED", minConfidence: 0.5 },
);
```

## Layout

```
src/
  classifiers/claim-classifier.ts   signal detectors → category, characteristics, confidence, rationale
  extractors/rule-based-extractor.ts default engine (section skipping, sentence split, dedup)
  extractors/ai-extractor.ts        provider-independent AI path, with verbatim validation
  normalizers/claim-normalizer.ts   normalizedText + duplicate fingerprint
  utils/                            sentence splitter, confidence maths, errors
  schemas/ types/                   zod schemas and TS types (Claim, ClaimAiProvider, …)
```

## Categories (one primary per claim)

Ties are broken by priority: RESEARCH_CONCLUSION > STATISTICAL_CLAIM > CAUSAL_CLAIM > COMPARATIVE_CLAIM > EXPERIMENTAL_FINDING > NUMERICAL_CLAIM > SCIENTIFIC_FACT.

| Category               | Typical cues                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `RESEARCH_CONCLUSION`  | "the results indicate…", "we conclude…", "taken together…"                          |
| `STATISTICAL_CLAIM`    | p-values, CIs, test statistics, OR/HR/β, "statistically significant"                |
| `CAUSAL_CLAIM`         | causes, leads to, induces, inhibits, "may reduce", "improves"                       |
| `COMPARATIVE_CLAIM`    | "higher … than", "compared with", outperformed, n-fold vs                           |
| `EXPERIMENTAL_FINDING` | observed/found/detected, "was observed", increased/decreased                        |
| `NUMERICAL_CLAIM`      | asserted values, percentages, measurements (years are ignored)                      |
| `SCIENTIFIC_FACT`      | general present-tense statements ("regulates", "is known to", "is associated with") |

Characteristics are secondary and can stack: `PERCENTAGE`, `NUMERIC_VALUE`, `MEASUREMENT_UNIT`, `P_VALUE`, `CONFIDENCE_INTERVAL`, `TEST_STATISTIC`, `STATISTICAL_SIGNIFICANCE`, `SAMPLE_SIZE`, `COMPARISON`, `CAUSAL_LANGUAGE`, `CHANGE_DIRECTION`, `ASSOCIATION`, `HEDGED`, `NEGATED`, `CITES_SOURCE`.

Each claim has a `rationale` listing the signals that matched, e.g. `p-value: "p < 0.001"`.

## What is excluded

- Sections such as acknowledgements, references, funding, author contributions, competing interests, data availability, ethics and supplementary material.
- Text about the paper itself ("In this paper we…", "The aim of this study…"), administrative statements, questions, captions, reference entries, and fragments that are too short or too long.
- Any sentence without an _assertive_ cue. Method procedures ("Samples were collected…") are penalised below the threshold.

## Confidence

`confidence` is **extraction confidence**: how likely it is that the sentence is a claim. It says nothing about whether the claim is true. Signal weights are combined as `1 − Π(1 − wᵢ)`, then scaled by penalties (methods section, procedure, caption). The result is clamped to [0.01, 0.99], and the default threshold is 0.5.

## Text fidelity

- `originalText` is an exact substring of the paragraph's `cleanedText`.
- `normalizedText` only collapses whitespace and quote styles, strips citation markers (`[1–3]`, `(Doe et al., 2021)`) and drops a leading connective ("However, …"). If any number would change, the original is kept.

## AI extraction (optional)

Implement `ClaimAiProvider` (`name`, `extractClaims({ documentId, paragraphs })`) for any vendor or local model, then pass it as `aiProvider` with `method: "AI"`. Every candidate is schema-validated and must be a **verbatim** sentence of the paragraph it names. Anything else is dropped and reported in `warnings`. AI claims are tagged `extractionMethod: "AI"`. Without a provider, the AI method throws `AI_PROVIDER_NOT_CONFIGURED`.

## Limitations

- English only, and driven by patterns: unusual phrasing can be missed, and topic sentences can occasionally be over-selected.
- Sentence splitting is heuristic. Claims spanning sentences, and text in tables or figures, are not extracted.
- Duplicate detection is exact after normalisation, so paraphrases are not merged.

## Tests

`bun test` runs 62 offline tests on synthetic text, including end-to-end runs on PDFs generated with the document-parser fixtures.
