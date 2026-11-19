import { defineConfig } from "prisma/config";
import {
  PRISMA_PATHS,
  resolveDatabaseProvider,
  resolveDatabaseUrl,
} from "./src/config.ts";

// SQLite (local development) and PostgreSQL (production) each have their own
// schema file and migration history; DATABASE_PROVIDER / DATABASE_URL selects one.
const paths = PRISMA_PATHS[resolveDatabaseProvider()];

export default defineConfig({
  schema: paths.schema,
  migrations: {
    path: paths.migrations,
    seed: "bun prisma/seed.ts",
  },
  datasource: { url: resolveDatabaseUrl() },
});
