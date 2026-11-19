import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");
const ROOT_ENV_FILE = path.resolve(PACKAGE_ROOT, "../../.env");

// Prisma 7's CLI no longer loads .env files, and Bun only loads .env from the
// cwd. Load the monorepo root .env here so the CLI, seed script, and apps all
// see the same DATABASE_URL. Already-set variables are never overridden.
if (!process.env.DATABASE_URL && existsSync(ROOT_ENV_FILE)) {
  process.loadEnvFile(ROOT_ENV_FILE);
}

const DEFAULT_DATABASE_URL = "file:./dev.db";

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
