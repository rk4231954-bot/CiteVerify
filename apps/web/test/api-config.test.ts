import { afterEach, describe, expect, test } from "bun:test";
import { parseApiBaseUrl, resolveApiOrigin } from "../src/lib/api.ts";

test("resolveApiOrigin normalises the configured API URL", () => {
  expect(resolveApiOrigin({})).toBe("");
  expect(
    resolveApiOrigin({ VITE_API_BASE_URL: "https://api.example.com/" }),
  ).toBe("https://api.example.com");
  expect(
    resolveApiOrigin({ VITE_API_BASE_URL: "https://api.example.com/api" }),
  ).toBe("https://api.example.com");
  expect(resolveApiOrigin({ VITE_API_BASE_URL: " https://x.dev/api/ " })).toBe(
    "https://x.dev",
  );
  // Legacy name still works; the new name wins.
  expect(resolveApiOrigin({ VITE_API_URL: "https://old.dev" })).toBe(
    "https://old.dev",
  );
  expect(
    resolveApiOrigin({
      VITE_API_BASE_URL: "https://new.dev",
      VITE_API_URL: "https://old.dev",
    }),
  ).toBe("https://new.dev");
});

test("a bare host gets https:// instead of becoming a relative path", () => {
  // The exact value configured in Vercel production on 2026-11-19.
  expect(
    resolveApiOrigin({
      VITE_API_BASE_URL: "citeverify-production.up.railway.app",
    }),
  ).toBe("https://citeverify-production.up.railway.app");
  expect(
    resolveApiOrigin({
      VITE_API_BASE_URL: "citeverify-production.up.railway.app/api/",
    }),
  ).toBe("https://citeverify-production.up.railway.app");
  expect(resolveApiOrigin({ VITE_API_BASE_URL: "localhost:3001" })).toBe(
    "http://localhost:3001",
  );
  expect(
    resolveApiOrigin({ VITE_API_BASE_URL: "HTTPS://API.Example.com/api" }),
  ).toBe("https://api.example.com");
});

test("unusable API URLs are reported instead of used", () => {
  for (const value of [
    "ftp://api.example.com",
    "https://",
    "https://api.example.com/?x=1",
    "https://user:pw@api.example.com",
  ]) {
    const parsed = parseApiBaseUrl({ VITE_API_BASE_URL: value });
    expect(parsed.origin).toBe("");
    expect(parsed.error).toContain("VITE_API_BASE_URL");
  }
  expect(parseApiBaseUrl({}).error).toBeUndefined();
});

describe("health check", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.VITE_API_BASE_URL;
  });

  test("requests <origin>/api/health on the configured API and reads the envelope", async () => {
    process.env.VITE_API_BASE_URL = "citeverify-production.up.railway.app";
    const calls: string[] = [];
    globalThis.fetch = Object.assign(
      async (input: string | URL | Request) => {
        calls.push(String(input instanceof Request ? input.url : input));
        return new Response(
          JSON.stringify({
            success: true,
            data: { status: "ok", database: "connected" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
      { preconnect: () => {} },
    ) as typeof fetch;
    // Fresh module instance so it reads the env set above.
    const mod = await import(`../src/lib/api.ts?health=${Date.now()}`);
    expect(mod.API_BASE).toBe(
      "https://citeverify-production.up.railway.app/api",
    );
    await expect(mod.api.health()).resolves.toEqual({
      status: "ok",
      database: "connected",
    });
    expect(calls).toEqual([
      "https://citeverify-production.up.railway.app/api/health",
    ]);
  });

  test("an HTML page instead of the API is reported as BAD_RESPONSE", async () => {
    process.env.VITE_API_BASE_URL = "https://api.example.com";
    globalThis.fetch = Object.assign(
      async () =>
        new Response("<!doctype html><title>CiteVerify</title>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      { preconnect: () => {} },
    ) as typeof fetch;
    const mod = await import(`../src/lib/api.ts?html=${Date.now()}`);
    await expect(mod.api.health()).rejects.toMatchObject({
      code: "BAD_RESPONSE",
    });
  });
});
