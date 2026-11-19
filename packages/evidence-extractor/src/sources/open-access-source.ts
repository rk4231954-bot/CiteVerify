/**
 * Obtains LEGALLY ACCESSIBLE full text for a publication — never anything else.
 *
 * - Fetched only when the publication is reported as open access AND has an
 *   open-access URL (from OpenAlex). Closed or unknown works are never fetched.
 * - Only PDFs are accepted (checked by magic bytes). Landing pages and other
 *   HTML are not scraped; logins, paywalls and CAPTCHAs are never bypassed.
 * - 401/402/403/407/451 responses and encrypted PDFs are access restrictions
 *   and are reported as ACCESS_DENIED.
 * - Redirects are followed manually (max 5) and every hop must be a public
 *   http(s) host. Size and time are bounded.
 */
import {
  DocumentParseError,
  type ExtractionResult,
  parseDocument,
} from "@citeverify/document-parser";
import type { FetchLike } from "@citeverify/publication-retriever";
import {
  FullTextStatus,
  type FullTextStatus as FullTextStatusValue,
} from "@citeverify/shared";

export type FullTextRequest = {
  openAccess: boolean | null;
  openAccessUrl: string | null;
};

export type FullTextResult = {
  status: FullTextStatusValue;
  /** The URL the PDF was actually read from (after redirects). */
  sourceUrl: string | null;
  extraction: ExtractionResult | null;
  reason: string;
};

export type FullTextOptions = {
  fetch?: FetchLike;
  timeoutMs?: number;
  maxBytes?: number;
  userAgent?: string;
  maxRedirects?: number;
};

const DENIED = new Set([401, 402, 403, 407, 451]);

/** Rejects non-http(s) URLs and hosts that are obviously local/private. */
export function isFetchableUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  )
    return false;
  if (
    host === "::1" ||
    host === "::" ||
    /^f[cd][0-9a-f]{2}:/.test(host) ||
    /^fe80:/.test(host)
  )
    return false;
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    )
      return false;
  }
  return true;
}

const result = (
  status: FullTextStatusValue,
  reason: string,
  sourceUrl: string | null = null,
  extraction: ExtractionResult | null = null,
): FullTextResult => ({
  status,
  sourceUrl,
  extraction,
  reason,
});

async function readCapped(
  res: Response,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length"));
  if (declared > maxBytes) return null;
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

export async function fetchOpenAccessFullText(
  request: FullTextRequest,
  options: FullTextOptions = {},
): Promise<FullTextResult> {
  if (request.openAccess !== true)
    return result(
      FullTextStatus.NOT_OPEN_ACCESS,
      "the publication is not reported as open access; full text is not fetched",
    );
  if (!request.openAccessUrl)
    return result(
      FullTextStatus.NO_URL,
      "no open-access URL is known for this publication",
    );

  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxBytes = options.maxBytes ?? 15 * 1024 * 1024;
  const signal = AbortSignal.timeout(timeoutMs);
  let url = request.openAccessUrl;

  try {
    let res: Response | null = null;
    for (let hop = 0; hop <= (options.maxRedirects ?? 5); hop++) {
      if (!isFetchableUrl(url))
        return result(
          FullTextStatus.FAILED,
          `refusing to fetch a non-public or unsupported URL (${new URL(url, "http://x").protocol})`,
        );
      res = await fetchImpl(url, {
        redirect: "manual",
        signal,
        headers: {
          Accept: "application/pdf",
          ...(options.userAgent ? { "User-Agent": options.userAgent } : {}),
        },
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        url = new URL(location, url).href;
        res = null;
        continue;
      }
      break;
    }
    if (!res) return result(FullTextStatus.FAILED, "too many redirects");
    if (DENIED.has(res.status))
      return result(
        FullTextStatus.ACCESS_DENIED,
        `the host refused access (HTTP ${res.status}); access restrictions are respected`,
      );
    if (!res.ok) return result(FullTextStatus.FAILED, `HTTP ${res.status}`);

    const bytes = await readCapped(res, maxBytes);
    if (!bytes)
      return result(
        FullTextStatus.TOO_LARGE,
        `the file exceeds ${maxBytes} bytes`,
      );
    const isPdf =
      bytes.length > 4 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46;
    if (!isPdf)
      return result(
        FullTextStatus.NOT_PDF,
        `the open-access URL returned ${res.headers.get("content-type") ?? "non-PDF content"} (landing pages are not scraped)`,
      );

    let extraction: ExtractionResult;
    try {
      extraction = await parseDocument(bytes, { expectedFormat: "pdf" });
    } catch (error) {
      if (
        error instanceof DocumentParseError &&
        error.code === "ENCRYPTED_FILE"
      )
        return result(
          FullTextStatus.ACCESS_DENIED,
          "the PDF is encrypted; it is not decrypted",
        );
      return result(
        FullTextStatus.FAILED,
        `the PDF could not be parsed: ${(error as Error).message}`,
      );
    }
    if (extraction.status === "EMPTY" || !extraction.paragraphs.length)
      return result(
        FullTextStatus.NO_TEXT,
        "the PDF has no extractable text (e.g. scanned images; OCR is not supported)",
        url,
      );
    return result(
      FullTextStatus.AVAILABLE,
      `open-access PDF (${extraction.paragraphs.length} paragraphs)`,
      url,
      extraction,
    );
  } catch (error) {
    const name = (error as Error).name;
    if (name === "TimeoutError" || name === "AbortError")
      return result(FullTextStatus.FAILED, `timed out after ${timeoutMs} ms`);
    return result(
      FullTextStatus.FAILED,
      `network error: ${(error as Error).message}`,
    );
  }
}
