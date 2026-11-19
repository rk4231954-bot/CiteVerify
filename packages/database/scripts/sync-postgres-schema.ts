/**
 * Derives prisma/postgres/schema.prisma from prisma/schema.prisma (the single
 * source of truth for the models). Only the datasource provider, the client
 * output path and the header differ, so both databases always share one model.
 *
 *   bun scripts/sync-postgres-schema.ts          write the PostgreSQL schema
 *   bun scripts/sync-postgres-schema.ts --check  exit 1 if it is out of date
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(root, "prisma/schema.prisma");
const TARGET = path.join(root, "prisma/postgres/schema.prisma");

const HEADER = `// GENERATED from prisma/schema.prisma by scripts/sync-postgres-schema.ts.
// Do not edit: change prisma/schema.prisma, then run \`bun run db:pg:sync\`
// and create a PostgreSQL migration (see packages/database/README.md).
//
`;

function replaceOnce(text: string, search: string, replacement: string) {
  if (!text.includes(search))
    throw new Error(`sync-postgres-schema: expected to find ${search}`);
  return text.replace(search, replacement);
}

export function derivePostgresSchema(sqliteSchema: string): string {
  let out = sqliteSchema;
  out = replaceOnce(
    out,
    '  provider = "sqlite"\n',
    '  provider = "postgresql"\n',
  );
  // The output path is relative to the schema file, which is one level deeper.
  out = replaceOnce(
    out,
    'output   = "../src/generated/prisma"',
    'output   = "../../src/generated/prisma"',
  );
  out = replaceOnce(
    out,
    "// CiteVerify database schema (SQLite).",
    "// CiteVerify database schema (PostgreSQL).",
  );
  return HEADER + out;
}

if (import.meta.main) {
  const expected = derivePostgresSchema(readFileSync(SOURCE, "utf8"));
  let current = "";
  try {
    current = readFileSync(TARGET, "utf8");
  } catch {}
  if (process.argv.includes("--check")) {
    if (current !== expected) {
      console.error(
        "prisma/postgres/schema.prisma is out of date. Run `bun run db:pg:sync` and add a PostgreSQL migration.",
      );
      process.exit(1);
    }
    console.log("PostgreSQL schema is in sync.");
  } else {
    writeFileSync(TARGET, expected);
    console.log(`Wrote ${path.relative(root, TARGET)}`);
  }
}
