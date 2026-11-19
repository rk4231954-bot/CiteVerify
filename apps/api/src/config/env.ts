import path from "node:path";
import { z } from "zod";
import { findRepoRoot } from "../utils/paths.ts";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  FRONTEND_URL: z.url().default("http://localhost:5173"),
  JWT_SECRET: z
    .string({
      error: "JWT_SECRET is required (generate one with: openssl rand -hex 32)",
    })
    .min(
      32,
      "JWT_SECRET must be at least 32 characters (openssl rand -hex 32)",
    ),
  JWT_EXPIRES_IN: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 7), // seconds
  UPLOAD_DIR: z.string().min(1).default("storage/uploads"),
  MAX_FILE_SIZE: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024), // bytes
  // Publication retrieval (Crossref / OpenAlex). No credentials are required.
  /** Contact email for the providers' "polite pool" (sent as mailto + User-Agent). */
  PUBLICATION_CONTACT_EMAIL: z
    .union([z.literal(""), z.email()])
    .optional()
    .transform((v) => v || undefined),
  /** Optional OpenAlex API key (premium / higher limits). */
  OPENALEX_API_KEY: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  PUBLICATION_RETRIEVAL_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(60_000)
    .default(10_000),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `  - ${i.path.join(".")}: ${i.message}`,
    );
    console.error(
      `[api] Invalid environment configuration:\n${issues.join("\n")}`,
    );
    process.exit(1);
  }
  const env = parsed.data;
  return {
    ...env,
    // Relative UPLOAD_DIR is resolved against the monorepo root, independent of cwd.
    UPLOAD_DIR: path.resolve(findRepoRoot(), env.UPLOAD_DIR),
  };
}

export const env = loadEnv();
export type Env = typeof env;
