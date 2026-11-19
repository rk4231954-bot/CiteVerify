# Deploying the CiteVerify API on Railway

| Part     | Where                                            |
| -------- | ------------------------------------------------ |
| Web app  | Vercel (`apps/web`, see `vercel.json`)           |
| API      | Railway service built from `apps/api/Dockerfile` |
| Database | Railway PostgreSQL                               |
| Uploads  | Railway volume mounted into the API service      |

Local development is unchanged: SQLite (`packages/database/dev.db`), uploads in `storage/uploads`, `bun run dev`.

## 1. Railway services

Create these in one Railway project:

1. **PostgreSQL**: add the Postgres database template. Railway creates `DATABASE_URL` on it. Do not copy the value anywhere; reference it (step 3).
2. **API**: a service from this GitHub repo (or `railway up` from the repo root).
   - Root directory: the repo root (leave empty). The Bun workspace must be installed as a whole.
   - Config file: `railway.json` at the repo root is picked up automatically. It sets the Dockerfile builder, the pre-deploy migration, the health check and the restart policy.
3. **Volume**: attach one to the API service, mount path `/data`. Railway then sets `RAILWAY_VOLUME_MOUNT_PATH=/data`, and uploads are stored in `/data/uploads`.

`apps/worker` is a placeholder (it only logs a line) and is **not** deployed.

## 2. Build, start, migrate, health

These are already in `railway.json` / `apps/api/Dockerfile`; nothing needs to be typed in the dashboard.

| Step       | Command / value                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Build      | Dockerfile: `bun install --frozen-lockfile` → `db:generate` (PostgreSQL client) → `bun run --cwd apps/api build` |
| Pre-deploy | `bun run db:migrate:deploy`: applies pending PostgreSQL migrations only                                          |
| Start      | `bun apps/api/dist/index.js` (listens on `0.0.0.0:$PORT`)                                                        |
| Health     | `GET /api/health`: `200` when the database is connected, `503` otherwise                                         |

`prisma migrate deploy` never resets or drops anything. It only applies migrations in `packages/database/prisma/postgres/migrations` that are not recorded in the `_prisma_migrations` table, and running it again is a no-op. A deploy whose migration fails is not started, so the previous deployment keeps serving.

## 3. API environment variables (Railway → API service → Variables)

| Variable                    | Value                                                                                                                     | Notes                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | `${{Postgres.DATABASE_URL}}`                                                                                              | A reference to the Postgres service (private network). Use your Postgres service's name if it differs.                                                                                              |
| `JWT_SECRET`                | Generate: `openssl rand -hex 32`                                                                                          | **Secret.** At least 32 characters. Set only in Railway, never in Vercel, git or the web app. Changing it signs every user out.                                                                     |
| `FRONTEND_URL`              | `https://citeverify-seven.vercel.app,https://citeverify-kiranmayi2.vercel.app,https://citeverify-*-kiranmayi2.vercel.app` | Allowed CORS origins, comma-separated: the two production aliases of the Vercel project (verified with `vercel inspect`), plus a pattern for preview URLs. Add a custom domain here if you add one. |
| `NODE_ENV`                  | `production`                                                                                                              | Already set in the image; listed for clarity.                                                                                                                                                       |
| `UPLOAD_DIR`                | _(leave unset)_                                                                                                           | Defaults to `$RAILWAY_VOLUME_MOUNT_PATH/uploads`. If you set it, use an absolute path on the volume.                                                                                                |
| `MAX_FILE_SIZE`             | `10485760`                                                                                                                | Optional. Upload limit in bytes (10 MB). The web app reads it from `/api/config`.                                                                                                                   |
| `JWT_EXPIRES_IN`            | `604800`                                                                                                                  | Optional. Token lifetime in seconds.                                                                                                                                                                |
| `PUBLICATION_CONTACT_EMAIL` | Your contact email                                                                                                        | Optional but recommended (Crossref/OpenAlex polite pool).                                                                                                                                           |
| `OPENALEX_API_KEY`          | _(optional)_                                                                                                              | **Secret** if used.                                                                                                                                                                                 |
| `DATABASE_POOL_MAX`         | _(optional, e.g. `5`)_                                                                                                    | Caps PostgreSQL connections per instance (default 10).                                                                                                                                              |

Do **not** set `PORT`, `API_PORT` or `HOST`. Railway injects `PORT`, and the server binds to `0.0.0.0`.

On startup in production the API **refuses to run** (and prints which variable is wrong, never its value) when:

- `FRONTEND_URL` is missing, is not https, or points to localhost;
- `UPLOAD_DIR` is not on persistent storage (no volume attached and no absolute `UPLOAD_DIR`);
- `DATABASE_URL` or `JWT_SECRET` is missing or invalid;
- the upload directory is not writable.

Then generate a public domain: API service → Settings → Networking → Generate Domain. The API is then at `https://<service>.up.railway.app/api`.

## 4. Vercel environment variables to update

| Variable            | Environment | Value                                      |
| ------------------- | ----------- | ------------------------------------------ |
| `VITE_API_BASE_URL` | Preview     | `https://<service>.up.railway.app`         |
| `VITE_API_BASE_URL` | Production  | Same, **only when production is approved** |

This is the only Vercel variable. It is public (compiled into the browser bundle), so it must never hold a secret. Vite reads it at build time, so **redeploy** the Vercel preview after setting it.

## 5. Verify after deploying

```bash
curl https://<service>.up.railway.app/api/health        # {"success":true,"data":{"status":"ok","database":"connected",...}}
curl -i -X OPTIONS https://<service>.up.railway.app/api/auth/login \
  -H "Origin: https://citeverify-seven.vercel.app" -H "Access-Control-Request-Method: POST"
# expect: Access-Control-Allow-Origin: https://citeverify-seven.vercel.app
```

Then open the Vercel preview, register a new account, and upload a document. The top bar's API status pill disappears once the API is reachable.

## 6. Database: SQLite (development) and PostgreSQL (production)

- `prisma/schema.prisma` (SQLite) is the single source of truth for the models. `prisma/postgres/schema.prisma` is generated from it and differs only in the provider. Each database has its **own** migration history: `prisma/migrations` (SQLite) and `prisma/postgres/migrations` (PostgreSQL).
- `DATABASE_PROVIDER` (`sqlite` | `postgresql`) selects the schema, migrations and client. When it is unset, the provider is inferred from `DATABASE_URL` (`postgres://…` means PostgreSQL), so local commands keep using SQLite.
- Compatibility: the models only use `String`, `Int`, `Float`, `Boolean` and `DateTime`, with no enums, no `Json` and no raw SQL beyond the health `SELECT 1`, so both databases share one model. Two behaviours differ, and neither affects a fresh production database:
  - PostgreSQL sorts `NULL`s **last** in ascending order (SQLite: first). Only legacy rows without `position` are affected.
  - Text comparison is case-sensitive in PostgreSQL. The API does no case-insensitive filtering; emails and DOIs are normalised before they are stored.

**Changing the schema later:**

```bash
# 1. edit packages/database/prisma/schema.prisma, then the SQLite migration as usual
bun run db:migrate --name <change>
# 2. regenerate the PostgreSQL schema and write its migration (no database needed)
bun run db:pg:sync
cd packages/database
git show HEAD:packages/database/prisma/postgres/schema.prisma > /tmp/previous.prisma
dir=prisma/postgres/migrations/$(date -u +%Y%m%d%H%M%S)_<change> && mkdir -p "$dir"
DATABASE_PROVIDER=postgresql bunx --bun prisma migrate diff \
  --from-schema /tmp/previous.prisma --to-schema prisma/postgres/schema.prisma \
  --script > "$dir/migration.sql"
# 3. review the SQL (watch for DROP / data loss), commit, deploy
bun run db:pg:check   # CI-style check that the PostgreSQL schema is in sync (also a unit test)
```

**Development data is not migrated.** `packages/database/dev.db` stays untouched. Production starts empty, and users register on the deployed app. The dev database holds test accounts and synthetic seed data (the seed refuses to run against PostgreSQL or in production). If real data ever needs to be moved, export it with a reviewed one-off script. Never point `db:reset` or `db:push` at the production URL.

## 7. Storage

- Uploaded PDF/DOCX files are the only server-side files. Reports are built in the browser, so the server writes no report files (`VerificationReport.reportPath` is unused).
- The database stores a path **relative** to `UPLOAD_DIR` (a UUID file name), so the volume can be remounted at another path without changing rows.
- A Railway volume survives restarts and redeploys. It is attached to **one** service instance, so keep the API at 1 replica while uploads live on the volume. To scale out, move `storage.service.ts` to object storage (S3-compatible, e.g. a Railway bucket); the service's `save`, `read` and `remove` interface is the only code that would change.
- Back up both Postgres (Railway → Postgres → Backups) and the volume. A document row whose file is missing reports a clear error when it is processed again; existing results stay readable.

## 8. Security notes

- Secrets (`JWT_SECRET`, `DATABASE_URL`, `OPENALEX_API_KEY`) exist only as Railway variables. `.dockerignore` and `.gitignore` keep `.env*`, databases and uploads out of the image and the repo.
- Auth uses a bearer token in the `Authorization` header (no cookies), so CORS is the only browser boundary. Unknown origins get no CORS headers.
- Error responses hide internal messages in production. Logs record the method, path, error name and code with credentials masked (connection-string passwords, bearer tokens, JWTs); request bodies and headers are never logged.
- Upload limit: `MAX_FILE_SIZE`, enforced while streaming the multipart body, plus a server-wide body ceiling of `MAX_FILE_SIZE` + 1 MB.
