# @citeverify/api

Hono + Bun REST API. All routes are under `/api`. Every response uses one envelope:

```jsonc
{ "success": true,  "data": { ... } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```

## Endpoints

| Method | Path                          | Auth | Description                                                                             |
| ------ | ----------------------------- | ---- | --------------------------------------------------------------------------------------- |
| GET    | `/api/health`                 | –    | App status + database connectivity (`503` if the DB is down)                            |
| POST   | `/api/auth/register`          | –    | `{ name, email, password }` → `{ user, token }`                                         |
| POST   | `/api/auth/login`             | –    | `{ email, password }` → `{ user, token }`                                               |
| GET    | `/api/auth/me`                | ✓    | Current user                                                                            |
| POST   | `/api/documents`              | ✓    | Create a metadata-only record `{ title, originalFilename, fileType, fileSize }`         |
| POST   | `/api/documents/upload`       | ✓    | `multipart/form-data`: `file` (PDF/DOCX), optional `title` → `{ id, status, document }` |
| GET    | `/api/documents?page=&limit=` | ✓    | The caller's documents, newest first                                                    |
| GET    | `/api/documents/:id`          | ✓    | Details + claim/citation/reference counts + latest job                                  |
| DELETE | `/api/documents/:id`          | ✓    | Delete the record (cascades) and its stored file                                        |

Auth: `Authorization: Bearer <token>`. If a document belongs to another user, the API returns `404`, so it never confirms that the document exists.

## Error codes

| Status | Code                                                   |
| ------ | ------------------------------------------------------ |
| 400    | `VALIDATION_ERROR`, `BAD_REQUEST`                      |
| 401    | `UNAUTHORIZED`, `INVALID_CREDENTIALS`                  |
| 404    | `NOT_FOUND`                                            |
| 409    | `CONFLICT`                                             |
| 413    | `FILE_TOO_LARGE`                                       |
| 415    | `UNSUPPORTED_FILE_TYPE`                                |
| 500    | `INTERNAL_ERROR` (the message is hidden in production) |
| 503    | `DATABASE_UNAVAILABLE`                                 |

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
