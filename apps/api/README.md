# @citeverify/api

Hono + Bun REST API. All routes are under `/api`. Every response uses one envelope:

```jsonc
{ "success": true,  "data": { ... } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```

## Endpoints

| Method | Path                                                | Auth | Description                                                                                                                                            |
| ------ | --------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/health`                                       | –    | App status + database connectivity (`503` if the DB is down)                                                                                           |
| POST   | `/api/auth/register`                                | –    | `{ name, email, password }` → `{ user, token }`                                                                                                        |
| POST   | `/api/auth/login`                                   | –    | `{ email, password }` → `{ user, token }`                                                                                                              |
| GET    | `/api/auth/me`                                      | ✓    | Current user                                                                                                                                           |
| POST   | `/api/documents`                                    | ✓    | Create a metadata-only record `{ title, originalFilename, fileType, fileSize }`                                                                        |
| POST   | `/api/documents/upload`                             | ✓    | `multipart/form-data`: `file` (PDF/DOCX), optional `title` → `{ id, status, document }`                                                                |
| GET    | `/api/documents?page=&limit=`                       | ✓    | The caller's documents, newest first                                                                                                                   |
| GET    | `/api/documents/:id`                                | ✓    | Details + claim/citation/reference counts + latest job                                                                                                 |
| DELETE | `/api/documents/:id`                                | ✓    | Delete the record (cascades) and its stored file                                                                                                       |
| POST   | `/api/documents/:id/extract-claims`                 | ✓    | Optional body `{ method?: "RULE_BASED" \| "AI", replace?, minConfidence? }` → `201 { created, skippedDuplicates, removed, stats, warnings, claims }`   |
| GET    | `/api/documents/:id/claims?category=&page=&limit=`  | ✓    | The document's claims in reading order                                                                                                                 |
| GET    | `/api/claims/:id`                                   | ✓    | One claim                                                                                                                                              |
| DELETE | `/api/claims/:id`                                   | ✓    | Delete one claim                                                                                                                                       |
| POST   | `/api/documents/:id/detect-citations`               | ✓    | Detect in-text citations, parse the bibliography, match, map to claims → `{ stats, replaced, warnings, claimMappings }`                                |
| GET    | `/api/documents/:id/citations?status=&page=&limit=` | ✓    | Citations in reading order, with matched reference and claim links                                                                                     |
| GET    | `/api/documents/:id/references`                     | ✓    | Parsed bibliography entries with `citationCount`                                                                                                       |
| GET    | `/api/citations/:id`                                | ✓    | One citation                                                                                                                                           |
| GET    | `/api/citations/:id/matches`                        | ✓    | Match status plus every candidate reference with score and reasons                                                                                     |
| POST   | `/api/documents/:id/retrieve-publications`          | ✓    | Optional body `{ referenceIds?, force? }` → `{ stats, providers, results[{ status, confidence, method, publicationId, reason, candidates, errors }] }` |
| GET    | `/api/documents/:id/publications?status=`           | ✓    | Every reference with its retrieval status/confidence, linked publication and stored candidates                                                         |
| GET    | `/api/publications/:id`                             | ✓    | Publication metadata + the caller's references to it (visible only if one of the caller's references links to it)                                      |
| GET    | `/api/references/:id/publication`                   | ✓    | Retrieval result for one reference: status, confidence, method, errors, publication (or null) and candidates                                           |

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
