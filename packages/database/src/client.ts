import { PrismaLibSql } from "@prisma/adapter-libsql";
import { resolveDatabaseUrl } from "./config.ts";
import { PrismaClient } from "./generated/prisma/client.ts";

function createClient() {
  return new PrismaClient({
    adapter: new PrismaLibSql({ url: resolveDatabaseUrl() }),
  });
}

// Reuse one client per process, including across `bun --hot` reloads.
const globalForPrisma = globalThis as unknown as {
  __citeverifyPrisma?: PrismaClient;
};

export const prisma = globalForPrisma.__citeverifyPrisma ?? createClient();
globalForPrisma.__citeverifyPrisma = prisma;
