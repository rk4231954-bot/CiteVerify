# @citeverify/citation-engine

Finds in-text citations, parses the bibliography, matches each citation to its reference, normalises DOIs, and maps citations onto extracted claims. It is fully offline: no publication metadata is fetched, and a citation is **never** treated as evidence that a source supports a claim.

```ts
import { analyzeCitations } from "@citeverify/citation-engine";

const {
  citations,
  references,
  matches,
  links,
  claimMappings,
  stats,
  warnings,
} = analyzeCitations({ documentId, extraction, claims }); // extraction = stored ExtractionResult
```

## Layout

```
src/
  detector/numeric-detector.ts       [1] · [1, 2] · [1–3] · [1, 3, 5]
  detector/author-year-detector.ts   (Smith, 2023) · (Smith et al., 2023) · Smith & Johnson (2022) …
  parser/reference-parser.ts         bibliography section → entries → fields
  matcher/citation-matcher.ts        confidence scoring → MATCHED / AMBIGUOUS / NEEDS_REVIEW / UNMATCHED
  resolver/doi-resolver.ts           DOI detection + normalisation (no network)
  mapper/claim-citation-mapper.ts    sentence-level claim ↔ citation links
  schemas/ types/ utils/names.ts     zod schemas, types, surname handling
```

## In-text citations

Each cited item becomes one citation: `[1–3]` yields three, all sharing `citationText: "[1–3]"`. Every citation keeps its exact marker text, paragraph id, page, section and character offsets in the paragraph's `cleanedText`. Bibliography paragraphs are never scanned.

| Format                      | Examples                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Numeric                     | `[1]`, `[1, 2]`, `[1–3]`, `[1, 3, 5]`, `[2,4-6]`                                                                                           |
| Author-year (parenthetical) | `(Smith, 2023)`, `(Smith et al., 2023)`, `(Smith & Johnson, 2022)`, `(Smith, 2020a, b)`, `(see Lee, 2021, p. 4; Kim, 2019)`, `(Doe, n.d.)` |
| Author-year (narrative)     | `Smith et al. (2023)`, `Smith and Johnson (2022)`, `van der Berg (2019)`, `Kim (2020, 2021)`                                               |

**Not treated as citations:**

- `[2020]`, `[0.5, 1]` and `[0]`.
- Intervals such as `x ∈ [1, 10]` or "range [1, 5]".
- Indexing such as `a[2]` or `a[3][1]`.
- Parentheses holding only a year (`(2019)`), a statistic (`(n = 2020)`, `(M = 2.4)`) or a table/figure/month (`(Table 2, 2020)`, `(January 2020)`).
- Acronym authors such as `WHO (2020)`.

## Reference lists

- **Finding the section.** The section heading must be References, Bibliography, Works Cited, Literature Cited, Reference List or "References and Notes", optionally numbered. A heading line the parser missed, at the top of a paragraph, also counts.
- **Splitting entries.**
  - Numbered lists split on `[n]`, `n.` or `n)` labels, and only when n continues the sequence, so a wrapped line starting "12." stays in its entry. Several entries merged on one line are split too.
  - Author-year lists split at a new "Surname, X." line once the current entry has a year and looks complete.
  - Identifiers broken across lines (`https://doi.org/` ⏎ `10.…`) are rejoined.
- **Fields.** Authors, title, year (+ suffix), venue, DOI and URL are parsed for APA/Harvard, IEEE and Vancouver styles. Anything that can't be identified stays `null` or `[]`; `rawText` (including the label) is always kept. Exact duplicate entries are dropped.

## Matching

| Citation    | Rule                                                                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Numeric     | The entry labelled _n_ → `MATCHED` (0.97). Two entries with that label → `AMBIGUOUS`. Unnumbered list → the _n_-th entry is only proposed (`NEEDS_REVIEW`). |
| Author-year | score = first-author similarity × year/suffix agreement × author-count consistency                                                                          |

- **First author:** exact 1; ignoring particles ("van der") 0.95; one-letter slip in a name of 5+ letters 0.75. Diacritics are ignored.
- **Year:** exact 1; suffix missing on one side 0.8; `2020a` vs `2020b` excluded; off by one 0.4; reference undated 0.5.
- **Author count:** "et al." vs 1–2 listed authors, a missing co-author, or a single cited name against several listed authors all reduce the score.

Status: `MATCHED` means one candidate ≥ 0.85 that leads the next by ≥ 0.2. Otherwise it is `AMBIGUOUS` (several candidates ≥ 0.6), `NEEDS_REVIEW` (only weak candidates) or `UNMATCHED` (none). **Only `MATCHED` sets `referenceId`.** Every candidate and its reasons are kept.

## DOIs

`normalizeDoi` accepts a bare DOI, `doi:`, `DOI `, `urn:doi:`, and `doi.org` / `dx.doi.org` URLs, including URL-encoded ones. It strips trailing punctuation and unbalanced brackets, checks the `10.NNNN/suffix` shape, and lowercases. `extractDois` returns only DOIs present in the text, and `doiToUrl` builds the resolver URL without making a request.

## Claim ↔ citation mapping

Each claim is located in its paragraph (by `paragraphId`, or a unique verbatim match).

| Link                                                         | Status         | Confidence |
| ------------------------------------------------------------ | -------------- | ---------- |
| Marker inside the claim sentence                             | `LINKED`       | 0.9        |
| Bracket/parenthesis marker directly after it (`… rate. [3]`) | `LINKED`       | 0.8        |
| Claim cites nothing; the next sentence does                  | `NEEDS_REVIEW` | 0.35       |

Citations are never spread over every claim in a paragraph. The per-claim summary is `MAPPED` only when every link is `LINKED` and every citation is `MATCHED`; otherwise `NEEDS_REVIEW` or `NO_CITATION`.

## Limitations

- Superscript or `(1)`-style numeric markers, footnote citations, and corporate or acronym authors ("WHO") are not detected.
- Bibliography parsing is heuristic. Unusual styles, entries split across pages without labels, or titles containing ". " may be parsed partly, but never invented.
- Mapping uses sentence proximity only. It doesn't understand which clause a citation supports.

## Tests

`bun test` runs 88 offline tests on synthetic text and PDFs/DOCX built in memory.
