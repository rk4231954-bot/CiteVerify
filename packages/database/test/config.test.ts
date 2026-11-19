import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { derivePostgresSchema } from "../scripts/sync-postgres-schema.ts";
import { redactDatabaseUrl, resolveDatabaseProvider } from "../src/config.ts";

const root = path.resolve(import.meta.dirname, "..");

describe("resolveDatabaseProvider", () => {
  test("defaults to SQLite for file URLs", () => {
    expect(resolveDatabaseProvider(undefined, "file:./dev.db")).toBe("sqlite");
  });
  test("detects PostgreSQL URLs", () => {
    expect(resolveDatabaseProvider(undefined, "postgresql://h/db")).toBe(
      "postgresql",
    );
    expect(resolveDatabaseProvider(undefined, "postgres://h/db")).toBe(
      "postgresql",
    );
  });
  test("DATABASE_PROVIDER overrides the URL", () => {
    expect(resolveDatabaseProvider("postgresql", "file:./dev.db")).toBe(
      "postgresql",
    );
    expect(resolveDatabaseProvider("sqlite", "postgres://h/db")).toBe("sqlite");
  });
  test("rejects unknown providers", () => {
    expect(() => resolveDatabaseProvider("mysql", "file:./dev.db")).toThrow();
  });
});

test("redactDatabaseUrl hides the password", () => {
  expect(redactDatabaseUrl("postgresql://user:s3cr%40t@host:5432/db")).toBe(
    "postgresql://user:***@host:5432/db",
  );
  expect(redactDatabaseUrl("file:./dev.db")).toBe("file:./dev.db");
});

test("the PostgreSQL schema is in sync with prisma/schema.prisma", () => {
  const sqlite = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
  const pg = readFileSync(
    path.join(root, "prisma/postgres/schema.prisma"),
    "utf8",
  );
  expect(pg).toBe(derivePostgresSchema(sqlite));
});

test("the PostgreSQL migration lock targets postgresql", () => {
  const lock = readFileSync(
    path.join(root, "prisma/postgres/migrations/migration_lock.toml"),
    "utf8",
  );
  expect(lock).toContain('provider = "postgresql"');
});
