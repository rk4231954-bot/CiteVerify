import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { HttpClient, ProviderError, redact } from "../src/index.ts";
import { json, noSleep, silentLogger } from "./helpers.ts";

const schema = z.object({ ok: z.literal(true) });

function client(
  responses: (() => Response | Promise<Response>)[],
  extra: Partial<ConstructorParameters<typeof HttpClient>[0]> = {},
) {
  let i = 0;
  const sleeps: number[] = [];
  const http = new HttpClient({
    provider: "CROSSREF",
    fetch: async () => {
      const next = responses[Math.min(i++, responses.length - 1)];
      if (!next) throw new Error("no response");
      return next();
    },
    logger: silentLogger,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    minIntervalMs: 0,
    retryBaseDelayMs: 1,
    ...extra,
  });
  return { http, sleeps, count: () => i };
}

async function failure(p: Promise<unknown>): Promise<ProviderError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ProviderError) return e;
    throw e;
  }
  throw new Error("expected a ProviderError");
}

describe("HttpClient", () => {
  test("validates successful responses", async () => {
    const { http } = client([() => json({ ok: true })]);
    expect(await http.getJson("https://x.test/a", schema)).toEqual({
      ok: true,
    });
  });

  test("404 resolves to null without retrying", async () => {
    const c = client([() => json({}, 404)]);
    expect(await c.http.getJson("https://x.test/a", schema)).toBeNull();
    expect(c.count()).toBe(1);
  });

  test("retries 5xx and then succeeds", async () => {
    const c = client([() => json({}, 503), () => json({ ok: true })]);
    expect(await c.http.getJson("https://x.test/a", schema)).toEqual({
      ok: true,
    });
    expect(c.count()).toBe(2);
    expect(c.http.stats.retries).toBe(1);
  });

  test("honours Retry-After on 429", async () => {
    const c = client([
      () => json({}, 429, { "retry-after": "2" }),
      () => json({ ok: true }),
    ]);
    await c.http.getJson("https://x.test/a", schema);
    expect(c.sleeps).toContain(2000);
  });

  test("gives up instead of waiting for a very long Retry-After", async () => {
    const c = client([() => json({}, 429, { "retry-after": "600" })]);
    const err = await failure(c.http.getJson("https://x.test/a", schema));
    expect(err.kind).toBe("RATE_LIMITED");
    expect(c.count()).toBe(1);
  });

  test("does not retry other client errors", async () => {
    const c = client([() => json({}, 400)]);
    const err = await failure(c.http.getJson("https://x.test/a", schema));
    expect(err.kind).toBe("HTTP");
    expect(err.status).toBe(400);
    expect(c.count()).toBe(1);
  });

  test("stops after maxRetries transient failures", async () => {
    const c = client([() => json({}, 500)], { maxRetries: 2 });
    await failure(c.http.getJson("https://x.test/a", schema));
    expect(c.count()).toBe(3);
  });

  test("times out slow requests", async () => {
    const http = new HttpClient({
      provider: "OPENALEX",
      timeoutMs: 20,
      maxRetries: 1,
      logger: silentLogger,
      sleep: noSleep,
      minIntervalMs: 0,
      fetch: (_url, init) =>
        new Promise((_, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          ),
        ),
    });
    const err = await failure(http.getJson("https://x.test/slow", schema));
    expect(err.kind).toBe("TIMEOUT");
    expect(http.stats.requests).toBe(2);
  });

  test("rejects malformed bodies", async () => {
    const c = client([() => json({ ok: "yes" })]);
    expect(
      (await failure(c.http.getJson("https://x.test/a", schema))).kind,
    ).toBe("INVALID_RESPONSE");
    const d = client([() => new Response("<html>", { status: 200 })]);
    expect(
      (await failure(d.http.getJson("https://x.test/a", schema))).kind,
    ).toBe("INVALID_RESPONSE");
  });

  test("network errors are retried and reported", async () => {
    const c = client(
      [() => Promise.reject(new TypeError("connection refused"))],
      { maxRetries: 1 },
    );
    const err = await failure(c.http.getJson("https://x.test/a", schema));
    expect(err.kind).toBe("NETWORK");
    expect(c.count()).toBe(2);
  });

  test("adapts the request interval to Crossref rate-limit headers", async () => {
    const c = client([
      () =>
        json({ ok: true }, 200, {
          "x-rate-limit-limit": "5",
          "x-rate-limit-interval": "1s",
        }),
      () => json({ ok: true }),
    ]);
    await c.http.getJson("https://x.test/a", schema);
    await c.http.getJson("https://x.test/b", schema);
    expect(c.sleeps.some((ms) => ms > 100)).toBe(true);
  });

  test("redacts credentials in logged URLs", () => {
    expect(
      redact(
        "https://api.openalex.org/works?search=x&api_key=SECRET&mailto=a@b.c",
      ),
    ).toBe("https://api.openalex.org/works?search=x&api_key=***&mailto=***");
  });
});
