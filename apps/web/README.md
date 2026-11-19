# @citeverify/web

React 19 + Vite + Tailwind 4 frontend for CiteVerify. It talks only to the CiteVerify API: it has no database access and runs no processing engines. Everything it shows comes from API responses. The web app has no demo or placeholder data.

## Run

```bash
bun run dev          # from the repo root: web + api (+ worker)
# or just the web app (the API must be running on :3001)
bunx turbo run dev --filter=@citeverify/web
```

- Dev server: http://localhost:5173. Vite proxies `/api/*` to `http://localhost:3001`.
- `VITE_API_BASE_URL`: the API origin, e.g. `https://api.example.com` (a trailing `/api` is accepted). Leave it unset in development, where the Vite proxy is used. **Production builds require it.** Without it the app still loads and shows "No API configured", but sign-in and all data features are disabled; it never falls back to sample data. The older name `VITE_API_URL` still works. The value ends up in the browser bundle, so never put secrets in `VITE_*` variables.
- The top bar, the sign-in pages and Settings show the API connection status, read from `GET /api/health` every 30 s.

## Deploy (Vercel)

`vercel.json` at the **repo root** configures the deployment. Use the repo root as the Vercel project root so that the Bun workspace (`packages/ui`, `packages/shared`, `packages/config`) is installed:

| Setting          | Value                                  |
| ---------------- | -------------------------------------- |
| Install          | `bun install --frozen-lockfile`        |
| Build            | `bun run --cwd apps/web build`         |
| Output           | `apps/web/dist`                        |
| SPA fallback     | every non-asset path → `/index.html`   |
| Caching          | `/assets/*` immutable for 1 year (hashed file names) |

Set `VITE_API_BASE_URL` for the Preview and Production environments in the Vercel project. The API must also allow the deployment's origin through CORS (`FRONTEND_URL` on the API). `.vercelignore` keeps `.env`, databases and uploads out of the upload.

```bash
bunx --bun vercel deploy                 # preview (Node is not required)
bunx --bun vercel deploy --prod          # production, only when approved
```

## Pages

| Route                               | Page                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`, `/register`               | Authentication                                                                                                                        |
| `/`                                 | Overview: bento dashboard with stats, verdict donut, activity, evidence availability, confidence distribution and the review queue |
| `/documents`                        | My Documents data grid (search, filter, sort, pagination, delete)                                                                      |
| `/upload`                           | Drag-and-drop upload (PDF/DOCX, limits from `/api/config`), then the 7-stage processing journey                                       |
| `/documents/:id`                    | Document analysis: tabs for overview, extracted text, claims, citations, publications, relationship graph and verification           |
| `/documents/:id/workspace?claim=`   | Split-view evidence workspace. Left: claim, citations and context. Right: publications, evidence and the verdict                      |
| `/claims?tab=claims\|citations\|publications` | Cross-document data grids with detail drawers                                                                        |
| `/verification?verdict=&review=1`   | Verification results: all 7 verdicts, filters and a detail drawer                                                                     |
| `/discovery`                        | Masonry view of the retrieved publications                                                                                            |
| `/publications/:id`                 | Publication metadata, abstract and stored evidence (extract or re-extract)                                                           |
| `/reports`, `/reports/:id`          | Reports assembled client-side: download as Markdown or JSON, or print to PDF                                                         |
| `/settings`                         | Account details and the server's capabilities                                                                                         |

## Structure

```
src/
  lib/          api client (fetch + XHR upload), query cache, auth, domain metadata,
                pipeline derivation, cross-document aggregation, report builder
  components/   layout (shell, sidebar, breadcrumbs, command palette), charts,
                data grid, processing journey, verification views, relationship graph
  pages/        one file per route (lazy-loaded)
```

The shared primitives (Button, Card, Badge, Dialog/Drawer, Tabs, Toast and others) live in `packages/ui`.

## Limitations (backend features that do not exist)

- **No aggregate endpoints.** The dashboard and the cross-document grids are computed in the browser from per-document requests, capped at 500 documents.
- **No report generation or PDF export** (`features.reportExport: false`). Reports are assembled in the browser from stored results, and you save a PDF through the browser's print dialog.
- **No related-publication discovery.** The discovery page shows only publications retrieved for your documents' references.
- **No notifications** endpoint, so the topbar has no notification bell.
- **AI methods are not configured.** `features.ai*` are `false`, so the AI method selectors stay hidden.
- **Processing is synchronous.** Each stage runs as a request and the journey reflects stored state. There is no push or progress stream.

## Test

```bash
bun test             # unit tests for pipeline derivation, aggregation, formatting and the report builder
bunx tsc --noEmit
```
