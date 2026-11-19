# @citeverify/database

Prisma 7 data layer for CiteVerify: SQLite in development, PostgreSQL in production. This is the only place a Prisma client is created. Apps import it:

```ts
import { prisma, type DocumentWithClaims } from "@citeverify/database";
import { DocumentStatus } from "@citeverify/shared";

await prisma.document.findMany({ where: { status: DocumentStatus.COMPLETED } });
```

## Layout

```
prisma/
  schema.prisma      models (source of truth, SQLite)
  migrations/        SQLite migrations (committed)
  postgres/
    schema.prisma    GENERATED from schema.prisma (bun run db:pg:sync)
    migrations/      PostgreSQL migrations (committed)
  seed.ts            synthetic demo data
prisma.config.ts     Prisma CLI config (picks the schema + migrations per provider)
scripts/             sync-postgres-schema.ts
src/
  config.ts          env loading + DATABASE_URL resolution
  client.ts          the single PrismaClient (libsql or pg driver adapter)
  types.ts           payload types + authors JSON helpers
  index.ts           public exports
  generated/         generated Prisma client (git-ignored)
```

## Environment

`DATABASE_URL` comes from the monorepo root `.env`. If it isn't set, the default is `file:./dev.db`. A relative path always resolves to `packages/database/`, so the CLI, the seed, the API, and the worker all use the same file.

## PostgreSQL

`DATABASE_PROVIDER` (`sqlite` | `postgresql`) selects the schema, the migrations and the driver adapter. When it is unset, the provider is inferred from `DATABASE_URL`, so every local command keeps using SQLite. The generated client is provider-specific: run `db:generate:pg` to build a PostgreSQL client, and `db:generate` to switch back. Production setup, the schema-change workflow and the compatibility notes are in [`docs/deploy-railway.md`](../../docs/deploy-railway.md#6-database-sqlite-development-and-postgresql-production).

## Status columns

SQLite has no native enums, so status-like columns are `TEXT`. The allowed values are defined once in `@citeverify/shared`, as constants plus zod schemas. Validate input with those schemas before writing.

| Column                                    | Values (`@citeverify/shared`) |
| ----------------------------------------- | ----------------------------- |
| `Document.status`                         | `DocumentStatus`              |
| `VerificationJob.status` / `currentStage` | `JobStatus` / `JobStage`      |
| `VerificationResult.verdict`              | `Verdict`                     |
| `Publication.retrievalStatus`             | `RetrievalStatus`             |
| `Citation.citationType`                   | `CitationType`                |
| `Evidence.evidenceType`                   | `EvidenceType`                |

`authors` columns store a JSON string array. Use `serializeAuthors()` and `parseAuthors()` to read and write them.

## Commands (from the repo root)

| Command                     | Description                                                       |
| --------------------------- | ----------------------------------------------------------------- |
| `bun run db:generate`       | Generate the Prisma client                                        |
| `bun run db:migrate`        | Create and apply a migration (`--name <name>`)                    |
| `bun run db:migrate:deploy` | Apply pending migrations without prompting                        |
| `bun run db:seed`           | Load the synthetic demo data (safe to re-run)                     |
| `bun run db:reset`          | Drop the database and re-apply migrations (then run `db:seed`)    |
| `bun run db:studio`         | Open Prisma Studio                                                |
| `bun run db:pg:sync`        | Regenerate `prisma/postgres/schema.prisma` from the SQLite schema |
| `bun run db:pg:check`       | Fail if the PostgreSQL schema is out of date                      |

Prisma 7 does not generate the client automatically after a migration. Run `db:generate` after changing the schema.

## Seed data

All seed data is **synthetic demonstration data**. It is invented, labelled `SYNTHETIC`, and uses `10.5555` example DOIs, which never resolve. It is not real research. Demo login: `demo@citeverify.local` / `demo-password`.
