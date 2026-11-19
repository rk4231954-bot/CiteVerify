/**
 * Test isolation: every `bun test` run gets a throwaway SQLite database and
 * upload directory in a temp folder. Dev data (packages/database/dev.db and
 * storage/uploads) is never touched.
 *
 * Runs before any test file imports the app, so the env is set before the
 * Prisma client and config are initialised.
 */
import { Database } from "bun:sqlite";
import { afterAll } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const tmp = mkdtempSync(path.join(tmpdir(), "citeverify-api-test-"));
const dbFile = path.join(tmp, "test.db");

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: pathToFileURL(dbFile).href,
  JWT_SECRET: crypto.getRandomValues(new Uint8Array(32)).toHex(),
  UPLOAD_DIR: path.join(tmp, "uploads"),
  MAX_FILE_SIZE: String(64 * 1024),
  FRONTEND_URL: "http://localhost:5173",
});

// Apply the real Prisma migrations, in order, to the fresh database.
const migrationsDir = path.resolve(
  import.meta.dirname,
  "../../../packages/database/prisma/migrations",
);
const db = new Database(dbFile, { create: true });
for (const dir of readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()) {
  db.exec(readFileSync(path.join(migrationsDir, dir, "migration.sql"), "utf8"));
}
db.close();

afterAll(async () => {
  const { prisma } = await import("@citeverify/database");
  await prisma.$disconnect();
  rmSync(tmp, { recursive: true, force: true });
});

// No test may reach a real service (Crossref, OpenAlex, …): providers are mocked.
globalThis.fetch = Object.assign(
  async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    throw new TypeError(`network access is disabled in tests (${url})`);
  },
  { preconnect: () => {} },
) as typeof fetch;
