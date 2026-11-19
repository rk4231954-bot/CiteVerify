/**
 * Polite JSON-over-HTTP for public scholarly APIs.
 *
 * - Every request has a timeout (AbortSignal.timeout).
 * - Requests per provider are serialised and spaced by a minimum interval;
 *   Crossref's X-Rate-Limit-Limit / -Interval headers adjust that interval.
 * - Only transient failures are retried (timeouts, network errors, 429, 500,
 *   502, 503, 504), with exponential backoff and Retry-After support.
 *   Other 4xx responses are never retried; 404 resolves to null.
 * - Responses are validated with zod; a malformed body is an error, not data.
 */
import type { PublicationProvider } from "@citeverify/shared";
import type { z } from "zod";
import type { Logger } from "../types/publication.types.ts";
import { ProviderError } from "./errors.ts";

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type HttpClientOptions = {
  provider: PublicationProvider;
  fetch?: FetchLike;
  timeoutMs?: number;
  /** Retries after the first attempt, for transient failures only. */
  maxRetries?: number;
  retryBaseDelayMs?: number;
  /** Longest Retry-After we are willing to wait inside one request. */
  maxRetryAfterMs?: number;
  minIntervalMs?: number;
  userAgent?: string;
  headers?: Record<string, string>;
  logger?: Logger;
  sleep?: (ms: number) => Promise<void>;
};

const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);

export const consoleLogger = (provider: string): Logger => ({
  warn: (message, meta) =>
    console.warn(
      `[publication-retriever:${provider.toLowerCase()}] ${message}`,
      meta ?? "",
    ),
});

const defaultSleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

export class HttpClient {
  readonly provider: PublicationProvider;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly maxRetryAfterMs: number;
  private minIntervalMs: number;
  private readonly headers: Record<string, string>;
  private readonly logger: Logger;
  private readonly sleep: (ms: number) => Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;
  /** Request counters, for reporting. */
  readonly stats = { requests: 0, retries: 0, failures: 0 };

  constructor(options: HttpClientOptions) {
    this.provider = options.provider;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
    this.maxRetryAfterMs = options.maxRetryAfterMs ?? 10_000;
    this.minIntervalMs = options.minIntervalMs ?? 100;
    this.headers = {
      Accept: "application/json",
      ...(options.userAgent ? { "User-Agent": options.userAgent } : {}),
      ...options.headers,
    };
    this.logger = options.logger ?? consoleLogger(options.provider);
    this.sleep = options.sleep ?? defaultSleep;
  }

  /** GET + validate. Resolves to null on 404. Throws ProviderError otherwise. */
  getJson<T extends z.ZodType>(
    url: string,
    schema: T,
  ): Promise<z.output<T> | null> {
    const run = this.queue.then(() => this.execute(url, schema));
    this.queue = run.catch(() => undefined); // keep the chain alive after failures
    return run;
  }

  private async throttle() {
    const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
    if (wait > 0) await this.sleep(wait);
    this.lastRequestAt = Date.now();
  }

  private adaptToRateLimitHeaders(res: Response) {
    const limit = Number(res.headers.get("x-rate-limit-limit"));
    const interval = res.headers
      .get("x-rate-limit-interval")
      ?.match(/^(\d+)s$/)?.[1];
    if (limit > 0 && interval)
      this.minIntervalMs = Math.max(
        this.minIntervalMs,
        (Number(interval) * 1000) / limit,
      );
  }

  private async execute<T extends z.ZodType>(
    url: string,
    schema: T,
  ): Promise<z.output<T> | null> {
    let lastError: ProviderError | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) this.stats.retries++;
      await this.throttle();
      this.stats.requests++;
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          headers: this.headers,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        const timedOut =
          error instanceof Error &&
          (error.name === "TimeoutError" || error.name === "AbortError");
        lastError = new ProviderError(
          this.provider,
          timedOut ? "TIMEOUT" : "NETWORK",
          timedOut
            ? `request timed out after ${this.timeoutMs} ms`
            : `network error: ${error instanceof Error ? error.message : String(error)}`,
        );
        if (attempt < this.maxRetries) {
          await this.sleep(this.backoff(attempt));
          continue;
        }
        break;
      }

      this.adaptToRateLimitHeaders(res);
      if (res.status === 404) return null;
      if (res.ok) {
        let body: unknown;
        try {
          body = await res.json();
        } catch {
          lastError = new ProviderError(
            this.provider,
            "INVALID_RESPONSE",
            "response is not valid JSON",
            res.status,
          );
          break;
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          lastError = new ProviderError(
            this.provider,
            "INVALID_RESPONSE",
            `unexpected response shape: ${parsed.error.issues[0]?.message ?? "invalid"}`,
            res.status,
          );
          break;
        }
        return parsed.data;
      }

      const transient = TRANSIENT_STATUS.has(res.status);
      lastError = new ProviderError(
        this.provider,
        res.status === 429 ? "RATE_LIMITED" : "HTTP",
        `HTTP ${res.status}`,
        res.status,
      );
      if (!transient || attempt >= this.maxRetries) break;
      const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
      if (retryAfter !== null && retryAfter > this.maxRetryAfterMs) break; // don't block the caller for minutes
      await this.sleep(retryAfter ?? this.backoff(attempt));
    }
    this.stats.failures++;
    const failure =
      lastError ??
      new ProviderError(this.provider, "NETWORK", "request failed");
    this.logger.warn(`${failure.kind}: ${failure.message}`, {
      url: redact(url),
      status: failure.status,
    });
    throw failure;
  }

  private backoff(attempt: number) {
    return (
      this.retryBaseDelayMs * 2 ** attempt + Math.floor(Math.random() * 100)
    );
  }
}

/** Never log credentials that may be passed as query parameters. */
export function redact(url: string): string {
  return url.replace(/([?&](?:api_key|mailto)=)[^&]+/g, "$1***");
}
