import { describe, expect, test } from "bun:test";
import { buildPdf, flowPage } from "@citeverify/document-parser/testing";
import {
  type EvidenceAiProvider,
  EvidenceExtractionError,
  extractEvidence,
  fetchOpenAccessFullText,
  isFetchableUrl,
} from "../src/index.ts";
import { content, STRUCTURED_ABSTRACT } from "./fixtures.ts";

describe("AI extraction (provider-independent)", () => {
  const provider = (proposals: unknown[]): EvidenceAiProvider => ({
    name: "fake-ai",
    extractEvidence: async () => proposals,
  });

  test("accepts only verbatim quotes of real passages", async () => {
    const out = await extractEvidence(
      content({ abstract: STRUCTURED_ABSTRACT }),
      {
        method: "AI",
        aiProvider: provider([
          {
            passageId: "abstract",
            sentence:
              "Working memory accuracy improved in the extension group.",
            evidenceType: "EXPERIMENTAL_RESULT",
            confidence: 0.8,
          },
          {
            passageId: "abstract",
            sentence:
              "Working memory accuracy improved by 50% in the extension group.",
            evidenceType: "STATISTICAL_RESULT",
          }, // fabricated number
          {
            passageId: "nope",
            sentence: "Sleep extension increased total sleep time",
            evidenceType: "EXPERIMENTAL_RESULT",
          },
          {
            passageId: "abstract",
            sentence: "x",
            evidenceType: "VERDICT_SUPPORTED",
          },
        ]),
      },
    );
    expect(out.evidence).toHaveLength(1);
    // An abstract sentence is relabelled: never passed off as a full-text result.
    expect(out.evidence[0]).toMatchObject({
      evidenceType: "ABSTRACT_FINDING",
      extractionMethod: "AI",
      evidenceAvailability: "ABSTRACT",
      confidence: 0.8,
    });
    expect(
      out.warnings.filter((w) => w.startsWith("AI proposal")),
    ).toHaveLength(3);
    expect(out.warnings.join(" ")).toContain("not a verbatim quote");
  });

  test("AI without a provider is reported, not faked", async () => {
    expect(
      extractEvidence(content({ abstract: STRUCTURED_ABSTRACT }), {
        method: "AI",
      }),
    ).rejects.toBeInstanceOf(EvidenceExtractionError);
  });

  test("a failing provider surfaces as AI_PROVIDER_ERROR", async () => {
    const failing: EvidenceAiProvider = {
      name: "down",
      extractEvidence: async () => Promise.reject(new Error("503")),
    };
    try {
      await extractEvidence(content({ abstract: STRUCTURED_ABSTRACT }), {
        method: "AI",
        aiProvider: failing,
      });
      throw new Error("expected failure");
    } catch (e) {
      expect((e as EvidenceExtractionError).code).toBe("AI_PROVIDER_ERROR");
    }
  });
});

describe("open-access full text (access restrictions respected)", () => {
  const pdf = () =>
    buildPdf([
      flowPage([
        { lines: ["Results"], size: 13 },
        {
          lines: [
            "Sleep extension increased total sleep time by 46 minutes compared with usual sleep (p < 0.001).",
          ],
        },
      ]),
    ]);
  const respond =
    (
      body: ConstructorParameters<typeof Response>[0],
      status = 200,
      headers: Record<string, string> = {},
    ) =>
    async () =>
      new Response(body, { status, headers });

  test("closed or unknown works are never fetched", async () => {
    let called = false;
    const fetch = async () => {
      called = true;
      return new Response(null);
    };
    expect(
      (
        await fetchOpenAccessFullText(
          { openAccess: false, openAccessUrl: "https://x.example/a.pdf" },
          { fetch },
        )
      ).status,
    ).toBe("NOT_OPEN_ACCESS");
    expect(
      (
        await fetchOpenAccessFullText(
          { openAccess: null, openAccessUrl: "https://x.example/a.pdf" },
          { fetch },
        )
      ).status,
    ).toBe("NOT_OPEN_ACCESS");
    expect(
      (
        await fetchOpenAccessFullText(
          { openAccess: true, openAccessUrl: null },
          { fetch },
        )
      ).status,
    ).toBe("NO_URL");
    expect(called).toBe(false);
  });

  test("an open-access PDF is parsed into paragraphs with sections and pages", async () => {
    const r = await fetchOpenAccessFullText(
      { openAccess: true, openAccessUrl: "https://oa.example.org/a.pdf" },
      { fetch: respond(pdf(), 200, { "content-type": "application/pdf" }) },
    );
    expect(r.status).toBe("AVAILABLE");
    expect(r.sourceUrl).toBe("https://oa.example.org/a.pdf");
    const out = await extractEvidence(
      content({
        fullText: {
          paragraphs: r.extraction?.paragraphs ?? [],
          sourceUrl: r.sourceUrl,
        },
      }),
    );
    expect(out.evidence[0]).toMatchObject({
      evidenceType: "STATISTICAL_RESULT",
      section: "Results",
      pageNumber: 1,
      evidenceAvailability: "FULL_TEXT",
    });
  });

  test.each([
    [401, "ACCESS_DENIED"],
    [402, "ACCESS_DENIED"],
    [403, "ACCESS_DENIED"],
    [451, "ACCESS_DENIED"],
    [404, "FAILED"],
    [500, "FAILED"],
  ])("HTTP %i → %s", async (status, expected) => {
    const r = await fetchOpenAccessFullText(
      { openAccess: true, openAccessUrl: "https://oa.example.org/a.pdf" },
      { fetch: respond("denied", status) },
    );
    expect(r.status).toBe(expected as never);
  });

  test("landing pages are not scraped", async () => {
    const r = await fetchOpenAccessFullText(
      { openAccess: true, openAccessUrl: "https://oa.example.org/article" },
      {
        fetch: respond("<html><body>Sign in to read</body></html>", 200, {
          "content-type": "text/html",
        }),
      },
    );
    expect(r).toMatchObject({ status: "NOT_PDF", extraction: null });
  });

  test("size limits apply", async () => {
    const r = await fetchOpenAccessFullText(
      { openAccess: true, openAccessUrl: "https://oa.example.org/a.pdf" },
      { fetch: respond(pdf()), maxBytes: 100 },
    );
    expect(r.status).toBe("TOO_LARGE");
  });

  test("redirects are followed, but never to private hosts", async () => {
    const hops: string[] = [];
    const fetch = async (url: string) => {
      hops.push(url);
      if (url.endsWith("/start"))
        return new Response(null, {
          status: 302,
          headers: { location: "https://cdn.example.org/a.pdf" },
        });
      return new Response(pdf(), { status: 200 });
    };
    expect(
      (
        await fetchOpenAccessFullText(
          { openAccess: true, openAccessUrl: "https://oa.example.org/start" },
          { fetch },
        )
      ).sourceUrl,
    ).toBe("https://cdn.example.org/a.pdf");
    expect(hops).toEqual([
      "https://oa.example.org/start",
      "https://cdn.example.org/a.pdf",
    ]);

    const toPrivate = async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest" },
      });
    expect(
      (
        await fetchOpenAccessFullText(
          { openAccess: true, openAccessUrl: "https://oa.example.org/start" },
          { fetch: toPrivate },
        )
      ).status,
    ).toBe("FAILED");
  });

  test("timeouts and network errors are reported, not thrown", async () => {
    const slow = (_: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        ),
      );
    const r = await fetchOpenAccessFullText(
      { openAccess: true, openAccessUrl: "https://oa.example.org/a.pdf" },
      { fetch: slow, timeoutMs: 20 },
    );
    expect(r).toMatchObject({ status: "FAILED" });
    expect(r.reason).toContain("timed out");
    const down = async () =>
      Promise.reject(new TypeError("connection refused"));
    expect(
      (
        await fetchOpenAccessFullText(
          { openAccess: true, openAccessUrl: "https://oa.example.org/a.pdf" },
          { fetch: down },
        )
      ).reason,
    ).toContain("network error");
  });

  test("URL safety", () => {
    for (const ok of ["https://europepmc.org/a.pdf", "http://arxiv.org/pdf/1"])
      expect(isFetchableUrl(ok)).toBe(true);
    for (const bad of [
      "file:///etc/passwd",
      "ftp://x.org/a",
      "http://localhost/a",
      "http://127.0.0.1/a",
      "http://10.0.0.5/a",
      "http://192.168.1.1/a",
      "http://[::1]/a",
      "https://user:pw@x.org/a",
      "nonsense",
    ])
      expect(isFetchableUrl(bad)).toBe(false);
  });
});
