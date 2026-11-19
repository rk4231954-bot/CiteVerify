import path from "node:path";
import { z } from "zod";
import { type OriginRule, parseOriginList } from "../utils/cors-origins.ts";
import { findRepoRoot } from "../utils/paths.ts";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  /** Injected by Railway and most hosts; takes precedence over API_PORT. */
  PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  /** Interface to listen on. 0.0.0.0 accepts connections from the host's proxy. */
  HOST: z.string().min(1).default("0.0.0.0"),
  /** Allowed CORS origin(s): comma-separated; see utils/cors-origins.ts. Required in production. */
  FRONTEND_URL: z.string().optional(),
  /** Read by @citeverify/database; validated here so production fails fast without it. */
  DATABASE_URL: z.string().optional(),
  /** Mount path of an attached Railway volume (set by Railway). */
  RAILWAY_VOLUME_MOUNT_PATH: z.string().optional(),
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
  /**
   * Where uploaded documents are stored. Development default: storage/uploads
   * (repo root). Production: an absolute path on persistent storage; defaults to
   * <RAILWAY_VOLUME_MOUNT_PATH>/uploads when a Railway volume is attached.
   */
  UPLOAD_DIR: z.string().min(1).optional(),
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
  // Evidence extraction: legally accessible (open-access) full-text PDFs only.
  EVIDENCE_FULLTEXT_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  EVIDENCE_FULLTEXT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(120_000)
    .default(20_000),
  EVIDENCE_FULLTEXT_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 1024 * 1024),
});

type ParsedEnv = z.infer<typeof envSchema>;

export type Env = Omit<
  ParsedEnv,
  "PORT" | "API_PORT" | "FRONTEND_URL" | "UPLOAD_DIR" | "DATABASE_URL"
> & {
  /** The port the server listens on (PORT, else API_PORT). */
  API_PORT: number;
  /** Allowed CORS origins as configured (for logs). */
  FRONTEND_URL: string;
  CORS_ORIGINS: OriginRule[];
  /** Absolute upload directory. */
  UPLOAD_DIR: string;
};

const DEV_FRONTEND_URL = "http://localhost:5173";
const DEV_UPLOAD_DIR = "storage/uploads";

/**
 * Validates the environment. Pure (no process exit, no I/O) so it can be tested.
 * Production refuses settings that only make sense locally: a localhost or
 * plain-http CORS origin, an ephemeral upload directory, or no DATABASE_URL.
 */
export function parseEnv(
  source: Record<string, string | undefined>,
  repoRoot = findRepoRoot(),
): { env: Env; issues?: never } | { env?: never; issues: string[] } {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success)
    return {
      issues: parsed.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      ),
    };
  const { PORT, API_PORT, FRONTEND_URL, UPLOAD_DIR, DATABASE_URL, ...rest } =
    parsed.data;
  const production = rest.NODE_ENV === "production";
  const issues: string[] = [];

  // CORS origins
  const frontend = FRONTEND_URL?.trim() || (production ? "" : DEV_FRONTEND_URL);
  const origins = parseOriginList(frontend);
  if (!frontend)
    issues.push(
      "FRONTEND_URL: required in production (the deployed web app origin, e.g. https://<project>.vercel.app)",
    );
  else for (const e of origins.errors) issues.push(`FRONTEND_URL: ${e}`);
  if (production)
    for (const r of origins.rules)
      if (
        !r.source.startsWith("https://") ||
        /localhost|127\.0\.0\.1/.test(r.source)
      )
        issues.push(
          `FRONTEND_URL: "${r.source}" must be a public https origin in production`,
        );

  // Upload storage
  let uploadDir = UPLOAD_DIR;
  if (!uploadDir && production && rest.RAILWAY_VOLUME_MOUNT_PATH)
    uploadDir = path.join(rest.RAILWAY_VOLUME_MOUNT_PATH, "uploads");
  if (!uploadDir) {
    if (production)
      issues.push(
        "UPLOAD_DIR: required in production — attach a persistent volume and set an absolute path on it (e.g. /data/uploads). The container filesystem is wiped on every deploy.",
      );
    uploadDir = DEV_UPLOAD_DIR;
  } else if (production && !path.isAbsolute(uploadDir))
    issues.push(
      `UPLOAD_DIR: "${uploadDir}" must be an absolute path on a persistent volume in production`,
    );

  // Database
  if (production && !DATABASE_URL?.trim())
    issues.push(
      "DATABASE_URL: required in production (reference the PostgreSQL service's DATABASE_URL)",
    );

  if (issues.length) return { issues };
  return {
    env: {
      ...rest,
      API_PORT: PORT ?? API_PORT,
      FRONTEND_URL: origins.rules.map((r) => r.source).join(","),
      CORS_ORIGINS: origins.rules,
      // A relative UPLOAD_DIR is resolved against the monorepo root, independent of cwd.
      UPLOAD_DIR: path.resolve(repoRoot, uploadDir),
    },
  };
}

function loadEnv(): Env {
  const result = parseEnv(process.env);
  if (result.issues) {
    console.error(
      `[api] Invalid environment configuration:\n${result.issues.map((i) => `  - ${i}`).join("\n")}`,
    );
    process.exit(1);
  }
  return result.env;
}

export const env = loadEnv();
