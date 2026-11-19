import { describe, expect, test } from "bun:test";
import { parseEnv } from "../src/config/env.ts";
import { matchOrigin, parseOriginList } from "../src/utils/cors-origins.ts";
import { redact } from "../src/utils/log.ts";

const SECRET = "x".repeat(32);
const PROD = {
  NODE_ENV: "production",
  JWT_SECRET: SECRET,
  FRONTEND_URL: "https://citeverify.vercel.app",
  DATABASE_URL: "postgresql://u:p@db.internal:5432/railway",
  UPLOAD_DIR: "/data/uploads",
};

describe("parseEnv", () => {
  test("development defaults are unchanged", () => {
    const { env } = parseEnv({ JWT_SECRET: SECRET }, "/repo");
    expect(env?.API_PORT).toBe(3001);
    expect(env?.HOST).toBe("0.0.0.0");
    expect(env?.FRONTEND_URL).toBe("http://localhost:5173");
    expect(env?.UPLOAD_DIR).toBe("/repo/storage/uploads");
  });

  test("PORT (from the platform) takes precedence over API_PORT", () => {
    expect(
      parseEnv({ ...PROD, PORT: "8080", API_PORT: "3001" }).env?.API_PORT,
    ).toBe(8080);
    expect(parseEnv({ ...PROD, API_PORT: "4000" }).env?.API_PORT).toBe(4000);
  });

  test("a complete production config is accepted", () => {
    const { env, issues } = parseEnv(PROD);
    expect(issues).toBeUndefined();
    expect(env?.UPLOAD_DIR).toBe("/data/uploads");
  });

  test("production uploads default onto an attached Railway volume", () => {
    const { UPLOAD_DIR: _, ...rest } = PROD;
    const { env } = parseEnv({ ...rest, RAILWAY_VOLUME_MOUNT_PATH: "/data" });
    expect(env?.UPLOAD_DIR).toBe("/data/uploads");
  });

  test("production refuses ephemeral or local-only settings", () => {
    const { issues } = parseEnv({
      NODE_ENV: "production",
      JWT_SECRET: SECRET,
    });
    expect(issues?.some((i) => i.startsWith("FRONTEND_URL"))).toBe(true);
    expect(issues?.some((i) => i.startsWith("UPLOAD_DIR"))).toBe(true);
    expect(issues?.some((i) => i.startsWith("DATABASE_URL"))).toBe(true);

    expect(
      parseEnv({ ...PROD, UPLOAD_DIR: "storage/uploads" }).issues,
    ).toHaveLength(1);
    expect(
      parseEnv({ ...PROD, FRONTEND_URL: "http://localhost:5173" }).issues,
    ).toHaveLength(1);
  });

  test("JWT_SECRET is still required", () => {
    const { JWT_SECRET: _, ...rest } = PROD;
    expect(parseEnv(rest).issues?.[0]).toStartWith("JWT_SECRET");
  });
});

describe("CORS origins", () => {
  const { rules, errors } = parseOriginList(
    "https://citeverify.vercel.app, https://citeverify-*-kiranmayi2.vercel.app",
  );

  test("parses a comma-separated list", () => {
    expect(errors).toEqual([]);
    expect(rules).toHaveLength(2);
  });

  test("matches exact origins and preview patterns only", () => {
    expect(matchOrigin(rules, "https://citeverify.vercel.app")).toBe(
      "https://citeverify.vercel.app",
    );
    expect(
      matchOrigin(rules, "https://citeverify-oc6l2b85f-kiranmayi2.vercel.app"),
    ).not.toBeNull();
    expect(matchOrigin(rules, "https://evil.vercel.app")).toBeNull();
    expect(
      matchOrigin(rules, "https://citeverify-x.evil-kiranmayi2.vercel.app"),
    ).toBeNull();
    expect(
      matchOrigin(rules, "https://citeverify-a-kiranmayi2.vercel.app.evil.com"),
    ).toBeNull();
    expect(matchOrigin(rules, "http://citeverify.vercel.app")).toBeNull();
    expect(matchOrigin(rules, undefined)).toBeNull();
  });

  test("rejects over-broad or malformed entries", () => {
    expect(parseOriginList("https://*.vercel.app").errors).toHaveLength(1);
    expect(parseOriginList("*").errors).toHaveLength(1);
    expect(parseOriginList("https://app.example.com/path").errors).toHaveLength(
      1,
    );
  });
});

test("redact masks credentials in log text", () => {
  const text = redact(
    "connect postgresql://postgres:hunter2@db:5432/x failed; Authorization: Bearer abc.def; token=eyJa.eyJb.sig",
  );
  expect(text).not.toContain("hunter2");
  expect(text).not.toContain("abc.def");
  expect(text).toContain("postgresql://postgres:***@db:5432/x");
});
