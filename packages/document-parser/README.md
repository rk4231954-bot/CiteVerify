# @citeverify/document-parser

Structured text extraction from academic **PDF** (pdfjs-dist) and **DOCX** (Mammoth) files. It's a pure library with no database or HTTP code.

```ts
import { parseDocument, parseDocumentFile } from "@citeverify/document-parser";

const result = await parseDocument(bytes, { expectedFormat: "pdf" });
// or: await parseDocumentFile("/path/to/file.docx")
```

## Layout

```
src/
  pdf/pdf-parser.ts              pdfjs-dist: text runs → lines → paragraphs/headings, per page
  docx/docx-parser.ts            Mammoth HTML (walked with Bun's HTMLRewriter) + docProps/core.xml
  text/text-cleaner.ts           reusable cleaning utilities
  metadata/metadata-extractor.ts shared assembly: cleaning, ids/order/sections, title, abstract, status
  types/document.types.ts        zod schemas + inferred types for the output
  utils/validation.ts            format detection (magic bytes), stored-result validation
tests/
  fixtures.ts                    in-memory SYNTHETIC PDF/DOCX builders (exported as ./testing)
```

## Output (`ExtractionResult`)

| Field                                          | Notes                                                                                                                                                |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`, `status`                             | `pdf`/`docx`; `COMPLETED` / `PARTIAL` (some pages without text) / `EMPTY` (no text)                                                                  |
| `title`, `titleSource`                         | Embedded metadata first (placeholders like "Microsoft Word - x.docx" are ignored). Otherwise a title found in the content. `null` if neither exists. |
| `authors`                                      | From file metadata only; never guessed from body text                                                                                                |
| `abstract`                                     | Text under an "Abstract" heading, or a paragraph starting "Abstract:"                                                                                |
| `totalPages`, `pages[]`                        | PDF only; `null` / `[]` for DOCX                                                                                                                     |
| `paragraphs[]`                                 | `{ id, order, originalText, cleanedText, pageNumber, section }`                                                                                      |
| `headings[]`                                   | `{ id, order, text, level, pageNumber }`. `level` comes from the Word style or the PDF numbering ("2.1" → 2), and is `null` when unknown.            |
| `tables[]`                                     | `{ id, order, rows, pageNumber, section }` (DOCX)                                                                                                    |
| `metadata`                                     | Raw embedded properties (title, authors, subject, keywords, dates…)                                                                                  |
| `warnings[]`, `stats`, `extractedAt`, `parser` |                                                                                                                                                      |

`order` is the reading-order position across paragraphs, headings and tables. `originalText` keeps the PDF's original line breaks. Missing values are `null`, never invented.

Failures throw `DocumentParseError` with a `code`: `UNSUPPORTED_FORMAT`, `CORRUPTED_FILE`, `ENCRYPTED_FILE` or `PARSE_ERROR`.

## Text cleaning

`cleanText` uses NFC normalisation, not NFKC, so `x²`, `½` and `µ` survive. It also:

- expands ligatures (ﬁ → fi)
- normalises odd spaces and removes zero-width and control characters
- collapses whitespace and repeated line breaks
- drops empty paragraphs and bare page-number lines

Words broken at a line end are rejoined only when that's safe: a soft hyphen always rejoins, and "mod-|est" becomes "modest". Real compounds keep their hyphen ("self-reported"), and DOIs, URLs and identifiers are never changed. Numbers, ± × ≤ α, citation markers and DOIs are preserved.

## Limitations

- **Layout:** PDF layout is reconstructed heuristically. Multi-column pages, footnotes, figures and complex tables may give imperfect paragraph boundaries or ordering. PDF tables are not detected.
- **No OCR:** scanned or image-only PDFs come back as `EMPTY`.
- **PDF headings:** these are detected from numbering, standard section names and larger fonts, so unusual styles may be missed.
- **DOCX pages:** DOCX files store no page layout, so page numbers are always `null`.

## Tests

`bun run test` uses only synthetic documents generated in memory, with no network access.
