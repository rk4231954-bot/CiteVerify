import { defineConfig } from "prisma/config";
import { resolveDatabaseUrl } from "./src/config.ts";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "bun prisma/seed.ts",
  },
  datasource: { url: resolveDatabaseUrl() },
});
