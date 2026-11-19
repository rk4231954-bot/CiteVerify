# @citeverify/api

Hono + Bun REST API. All routes are under `/api`. Every response uses one envelope:

```jsonc
{ "success": true,  "data": { ... } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```

## Endpoints

| Method | Path                                                           | Auth | Description                                                                                                                                                                  |
| ------ | -------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/health`                                                  | –    | App status + database connectivity (`503` if the DB is down)                                                                                                                 |
| GET    | `/api/config`                                                  | –    | Public client configuration: upload limits (`maxBytes`, extensions, MIME types) and feature flags (`aiClaimExtraction`, `aiEvidenceExtraction`, `aiVerification`, `openAccessFullText`, `reportExport`) |
| POST   | `/api/auth/register`                                           | –    | `{ name, email, password }` → `{ user, token }`                                                                                                                              |
| POST   | `/api/auth/login`                                              | –    | `{ email, password }` → `{ user, token }`                                                                                                                                    |
| GET    | `/api/auth/me`                                                 | ✓    | Current user                                                                                                                                                                 |
| POST   | `/api/documents`                                               | ✓    | Create a metadata-only record `{ title, originalFilename, fileType, fileSize }`                                                                                              |
| POST   | `/api/documents/upload`                                        | ✓    | `multipart/form-data`: `file` (PDF/DOCX), optional `title` → `{ id, status, document }`                                                                                      |
| GET    | `/api/documents?page=&limit=`                                  | ✓    | The caller's documents, newest first                                                                                                                                         |
| GET    | `/api/documents/:id`                                           | ✓    | Details + claim/citation/reference counts + latest job                                                                                                                       |
| DELETE | `/api/documents/:id`                                           | ✓    | Delete the record (cascades) and its stored file                                                                                                                             |
| POST   | `/api/documents/:id/extract-claims`                            | ✓    | Optional body `{ method?: "RULE_BASED" \| "AI", replace?, minConfidence? }` → `201 { created, skippedDuplicates, removed, stats, warnings, claims }`                         |
| GET    | `/api/documents/:id/claims?category=&page=&limit=`             | ✓    | The document's claims in reading order                                                                                                                                       |
| GET    | `/api/claims/:id`                                              | ✓    | One claim                                                                                                                                                                    |
| DELETE | `/api/claims/:id`                                              | ✓    | Delete one claim                                                                                                                                                             |
| POST   | `/api/documents/:id/detect-citations`                          | ✓    | Detect in-text citations, parse the bibliography, match, map to claims → `{ stats, replaced, warnings, claimMappings }`                                                      |
| GET    | `/api/documents/:id/citations?status=&page=&limit=`            | ✓    | Citations in reading order, with matched reference and claim links                                                                                                           |
| GET    | `/api/documents/:id/references`                                | ✓    | Parsed bibliography entries with `citationCount`                                                                                                                             |
| GET    | `/api/citations/:id`                                           | ✓    | One citation                                                                                                                                                                 |
| GET    | `/api/citations/:id/matches`                                   | ✓    | Match status plus every candidate reference with score and reasons                                                                                                           |
| POST   | `/api/documents/:id/retrieve-publications`                     | ✓    | Optional body `{ referenceIds?, force? }` → `{ stats, providers, results[{ status, confidence, method, publicationId, reason, candidates, errors }] }`                       |
| GET    | `/api/documents/:id/publications?status=`                      | ✓    | Every reference with its retrieval status/confidence, linked publication and stored candidates                                                                               |
| GET    | `/api/publications/:id`                                        | ✓    | Publication metadata + the caller's references to it (visible only if one of the caller's references links to it)                                                            |
| GET    | `/api/references/:id/publication`                              | ✓    | Retrieval result for one reference: status, confidence, method, errors, publication (or null) and candidates                                                                 |
| POST   | `/api/publications/:id/extract-evidence`                       | ✓    | Optional body `{ fullText?, method?, replace?, minConfidence? }` → `{ verificationScope, fullText{status,reason}, stats, created, duplicatesSkipped, evidence[], warnings }` |
| GET    | `/api/publications/:id/evidence?type=&availability=`           | ✓    | Stored evidence in reading order, plus the publication's `verificationScope` and `fullTextStatus`                                                                            |
| POST   | `/api/claims/:id/find-evidence`                                | ✓    | Optional body `{ scope?: CITED\|DOCUMENT, extractMissing?, topK?, minRelevance? }` → ranked candidates (relevance only, never a verdict)                                     |
| GET    | `/api/claims/:id/evidence`                                     | ✓    | The claim's stored candidate evidence, ordered by rank                                                                                                                       |
| POST   | `/api/documents/:id/verify`                                    | ✓    | Optional body `{ method?: RULE_BASED\|AI, claimIds?, extractMissingEvidence? }` → `201 { job, summary, results[], warnings, disclaimer }`                                    |
| GET    | `/api/documents/:id/verification?jobId=&verdict=&humanReview=` | ✓    | Results of the latest completed run (or `jobId`) with a verdict summary; empty with a `reason` before the first run                                                          |
| GET    | `/api/documents/:id/verification/status`                       | ✓    | Latest run: status, stage, method, progress (`processedClaims`/`totalClaims`), errors; `verified` and `lastVerifiedAt`                                                       |
| GET    | `/api/claims/:id/verification`                                 | ✓    | The claim's latest completed result in full, plus its history across runs                                                                                                    |

Auth: `Authorization: Bearer <token>`. If a document, claim or citation belongs to another user, the API returns `404`, so it never confirms that the document exists.

## Error codes

| Status | Code                                                   |
| ------ | ------------------------------------------------------ |
| 400    | `VALIDATION_ERROR`, `BAD_REQUEST`                      |
| 401    | `UNAUTHORIZED`, `INVALID_CREDENTIALS`                  |
| 404    | `NOT_FOUND`                                            |
| 409    | `CONFLICT`                                             |
| 413    | `FILE_TOO_LARGE`                                       |
| 415    | `UNSUPPORTED_FILE_TYPE`                                |
| 422    | `EXTRACTION_FAILED`                                    |
| 501    | `AI_PROVIDER_NOT_CONFIGURED`                           |
| 502    | `AI_PROVIDER_ERROR`                                    |
| 500    | `INTERNAL_ERROR` (the message is hidden in production) |
| 503    | `DATABASE_UNAVAILABLE`                                 |

## Extraction flow

`POST /extract` runs synchronously:

1. Check ownership, that the document has a file, and that the format is supported.
2. Claim the document by setting `PROCESSING` atomically. A second request gets 409. A `PROCESSING` state older than 10 minutes counts as abandoned.
3. Read the file read-only and parse it.
4. Upsert the single `DocumentExtraction` row and set the document status in one transaction.

The document status becomes `EXTRACTED` on `COMPLETED` or `PARTIAL`, and `FAILED` on `EMPTY` or on a parse error. Parse errors are also stored, so `GET /extraction` shows them. Re-running replaces the previous result.

## Claim extraction flow

`POST /extract-claims` runs synchronously on the **stored** extraction, never the raw file:

1. Check ownership. Return 409 unless the extraction is `COMPLETED` or `PARTIAL`.
2. Run `@citeverify/claim-extractor` (rule-based by default). `AI` returns 501 unless a provider is set up in `src/services/ai-provider.ts`.
3. Skip claims whose fingerprint (case- and punctuation-insensitive, numbers kept) already exists for the document. A unique `(documentId, fingerprint)` index backs this up.
4. In one transaction, delete this method's earlier claims (only with `replace: true`) and insert the new ones.

Claim extraction does not change the document status.

## Citation detection flow

`POST /detect-citations` also runs synchronously on the stored extraction:

1. Check ownership. Return 409 unless the extraction is `COMPLETED` or `PARTIAL`.
2. Run `@citeverify/citation-engine` with the document's existing claims.
3. In one transaction, replace the earlier _detected_ citations and references (rows with `Citation.paragraphId` / `Reference.position` set) and their claim links. Manual and seed rows are never touched, so re-running never creates duplicates.

`Citation.referenceId` is set **only** for `MATCHED`. `AMBIGUOUS`, `NEEDS_REVIEW` and `UNMATCHED` citations keep their candidates in `matchCandidates`, which `/citations/:id/matches` shows. Claim links live in `ClaimCitation` with `status` (`LINKED` / `NEEDS_REVIEW`) and `confidence`. Run it after `extract-claims`; re-run it if claims change.

## Publication retrieval flow

`POST /retrieve-publications` runs synchronously, with up to 100 references per request and 2 at a time. It uses the references that citation detection stored, and requests go out to Crossref first and then OpenAlex:

1. Check ownership. Return 409 if the document has no references yet.
2. Choose the references to process. By default these are references that have no publication and either no result yet or a `FAILED` one. Pass `force: true` to re-query references that already have a result, and `referenceIds` to restrict the run.
3. Run `@citeverify/publication-retriever`: exact DOI lookup, then title search, then OpenAlex as the fallback.
4. Save the results.
   - `MATCHED` upserts a `Publication`, deduplicated by DOI, otherwise by OpenAlex id. Existing values are kept and only empty fields are filled. The reference is linked to it.
   - `AMBIGUOUS`, `NEEDS_REVIEW` and `NOT_FOUND` leave the reference unlinked. The candidates go in `publicationCandidates`.
   - `FAILED` means a provider was unavailable. It records `retrievalError`, keeps any existing link, and is retried on the next run.

Retrieval results survive a re-run of `detect-citations` for entries whose text is unchanged. Metadata is all that is retrieved. An abstract or open-access URL does not mean the full text was fetched, and a retrieved publication says nothing about whether it supports any claim.

Configuration (all optional; no credentials are needed):

| Variable                           | Purpose                                                    |
| ---------------------------------- | ---------------------------------------------------------- |
| `PUBLICATION_CONTACT_EMAIL`        | Sent as `mailto` and in the User-Agent (polite pools)      |
| `OPENALEX_API_KEY`                 | OpenAlex key; anonymous OpenAlex requests may get HTTP 429 |
| `PUBLICATION_RETRIEVAL_TIMEOUT_MS` | Per-request timeout (default 10000)                        |

Tests never touch the network: `test/setup.ts` replaces `fetch`, and the providers are mocked through `setPublicationRetriever()`.

## Evidence extraction flow

`POST /publications/:id/extract-evidence` runs synchronously for one publication the caller can see (through one of their references):

1. Content: the stored abstract (always), plus full text **only** when OpenAlex reported the work as open access with an `openAccessUrl`. That URL is fetched with redirects checked (http(s), no private hosts), a size cap and a timeout; only a real, unencrypted PDF is used. 401/402/403/451, HTML landing pages and encrypted files are recorded as `fullTextStatus` and the abstract is used instead — nothing is worked around.
2. `@citeverify/evidence-extractor` splits the content into passages (sections and page numbers from the PDF; abstracts have no page number) and classifies sentences as `ABSTRACT_FINDING`, `EXPERIMENTAL_RESULT`, `STATISTICAL_RESULT`, `METHODOLOGY`, `DISCUSSION`, `LIMITATION` or `CONCLUSION`. Text is stored verbatim.
3. Duplicates: within a run the full-text copy wins; against stored rows the stored row is kept (unique `publicationId + fingerprint`). `replace: true` deletes previously extracted (RULE_BASED/AI) rows first — manual and legacy rows are kept — and their claim links cascade.
4. `verificationScope`: `FULL` with full text, `LIMITED` with only the abstract, `NONE` with neither (still a 200, with a warning).

`POST /claims/:id/find-evidence` finds the publications of the references the claim's citations are confidently matched to (`scope: DOCUMENT` uses every matched publication of the document), extracts evidence for up to 10 publications that have none yet, ranks every passage by relevance (IDF-weighted terms, subject/outcome terms, phrases, numbers, character similarity) and replaces the claim's `ClaimEvidence` links. **Relevance is not support**: no endpoint here says whether a claim is supported or contradicted.

| Variable                       | Purpose                                                   |
| ------------------------------ | --------------------------------------------------------- |
| `EVIDENCE_FULLTEXT_ENABLED`    | `false` = abstracts only, never fetch PDFs (default true) |
| `EVIDENCE_FULLTEXT_TIMEOUT_MS` | Full-text download timeout (default 20000)                |
| `EVIDENCE_FULLTEXT_MAX_BYTES`  | Largest PDF accepted (default 15 MiB)                     |

`method: "AI"` returns 501 until an `EvidenceAiProvider` is returned from `services/evidence-providers.ts`. Tests mock the full-text host via `setFullTextSource()`.

## Verification flow

`POST /documents/:id/verify` runs synchronously and records a `VerificationJob` (status, stage, progress). A second run while one is `RUNNING` gets 409; a run older than 10 minutes counts as abandoned.

1. Load the document's claims with claim → citation → matched reference → matched publication. Only confident matches count; anything else is listed as an unresolved citation.
2. `RETRIEVING_SOURCES`: extract evidence (abstract + open-access full text) for up to 20 cited publications that have none yet.
3. `VERIFYING`: `@citeverify/verification-engine` ranks each publication's evidence by relevance, reads each candidate's stance from explicit wording, and applies conservative verdict rules (see the package README). Each `VerificationResult` stores the verdict, confidence (0..1 in the DB, 0–100 in the API), explanation, limitations, the rules applied, and `VerificationEvidence` rows — verbatim snapshots of every passage used with its role, section, page and URL.
4. Results are **automated assessments**: every response carries `assessmentType: "AUTOMATED"` and a disclaimer, and `humanReview.recommended` is set whenever evidence is thin, abstract-only, conflicting, uncertain or the verdict is serious (contradicted, outdated, misleading).

`method: "AI"` returns 501 (before a job is recorded) until a `VerificationAiProvider` is returned from `services/ai-provider.ts`. AI stances are cross-checked by the rules; tests inject one with `setVerificationAiProvider()`.

## Layout

```
src/
  config/        env parsing (zod); fails fast on invalid config
  middleware/    auth (JWT), validate (zod), error-handler
  routes/        URL → controller wiring
  controllers/   HTTP in/out (validation + response envelope)
  services/      business logic (auth, token, documents, storage)
  repositories/  Prisma queries (via @citeverify/database)
  validators/    zod request schemas
  utils/         errors, response helpers, file-type detection, paths
  types/         Hono env + public DTO types
  app.ts         createApp(): middleware, routes, error handling
  index.ts       server entry point
test/            bun test suites (isolated temp DB + upload dir)
```

## Commands

```bash
bun run dev        # watch mode (reads the root .env)
bun run build      # → dist/
bun run start      # run the build
bun run test       # tests use a throwaway SQLite DB, never dev.db
```
