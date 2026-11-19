import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");
const ROOT_ENV_FILE = path.resolve(PACKAGE_ROOT, "../../.env");

// Prisma 7's CLI no longer loads .env files, and Bun only loads .env from the
// cwd. Load the monorepo root .env here so the CLI, seed script, and apps all
// see the same DATABASE_URL. Already-set variables are never overridden, and a
// missing file (e.g. in a container) is simply skipped.
if (!process.env.DATABASE_URL && existsSync(ROOT_ENV_FILE)) {
  process.loadEnvFile(ROOT_ENV_FILE);
}

const DEFAULT_DATABASE_URL = "file:./dev.db";

export type DatabaseProvider = "sqlite" | "postgresql";

/**
 * Returns DATABASE_URL with relative SQLite paths resolved against
 * packages/database as an absolute `file:///` URL, so every app/cwd uses the
 * same database file (Prisma Studio also requires this absolute form).
 */
export function resolveDatabaseUrl(
  url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
): string {
  if (!url.startsWith("file:./") && !url.startsWith("file:../")) return url;
  return pathToFileURL(path.resolve(PACKAGE_ROOT, url.slice("file:".length)))
    .href;
}

const isPostgresUrl = (url: string) => /^postgres(ql)?:\/\//i.test(url);

/**
 * Which database the Prisma CLI and client target.
 *
 * `DATABASE_PROVIDER` wins when set (a container build generates the client
 * before any DATABASE_URL exists). Otherwise it is inferred from DATABASE_URL:
 * `postgres://` / `postgresql://` → PostgreSQL, anything else → SQLite (the
 * local development default).
 */
export function resolveDatabaseProvider(
  explicit = process.env.DATABASE_PROVIDER,
  url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
): DatabaseProvider {
  const value = explicit?.trim().toLowerCase();
  if (value === "postgresql" || value === "postgres") return "postgresql";
  if (value === "sqlite") return "sqlite";
  if (value)
    throw new Error(
      `DATABASE_PROVIDER must be "sqlite" or "postgresql" (got "${explicit}")`,
    );
  return isPostgresUrl(url) ? "postgresql" : "sqlite";
}

/** Schema + migration history for each provider (paths relative to packages/database). */
export const PRISMA_PATHS: Record<
  DatabaseProvider,
  { schema: string; migrations: string }
> = {
  sqlite: {
    schema: "prisma/schema.prisma",
    migrations: "prisma/migrations",
  },
  postgresql: {
    schema: "prisma/postgres/schema.prisma",
    migrations: "prisma/postgres/migrations",
  },
};

/** Database URL with any password replaced, safe to print in logs. */
export function redactDatabaseUrl(url: string): string {
  return url.replace(/(\/\/[^:/@\s]+:)[^@\s]*@/g, "$1***@");
}
