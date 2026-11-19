import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveDatabaseProvider, resolveDatabaseUrl } from "./config.ts";
import { PrismaClient } from "./generated/prisma/client.ts";

/** Optional cap on pooled PostgreSQL connections (pg's default is 10). */
function poolMax(): number | undefined {
  const value = Number(process.env.DATABASE_POOL_MAX);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function createClient() {
  const url = resolveDatabaseUrl();
  const adapter =
    resolveDatabaseProvider() === "postgresql"
      ? new PrismaPg({ connectionString: url, max: poolMax() })
      : new PrismaLibSql({ url });
  try {
    return new PrismaClient({ adapter });
  } catch (error) {
    if (
      error instanceof Error &&
      /is not compatible with the provider/.test(error.message)
    )
      throw new Error(
        `The generated Prisma client does not match the "${resolveDatabaseProvider()}" database selected by DATABASE_PROVIDER / DATABASE_URL. Regenerate it: bun run db:generate (SQLite) or bun run --cwd packages/database db:generate:pg (PostgreSQL).`,
        { cause: error },
      );
    throw error;
  }
}

// Reuse one client per process, including across `bun --hot` reloads.
const globalForPrisma = globalThis as unknown as {
  __citeverifyPrisma?: PrismaClient;
};

export const prisma = globalForPrisma.__citeverifyPrisma ?? createClient();
globalForPrisma.__citeverifyPrisma = prisma;
