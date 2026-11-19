import { describe, expect, test } from "bun:test";
import {
  CrossrefProvider,
  PublicationRetriever,
  scoreCandidate,
} from "../src/index.ts";
import {
  crossrefList,
  crossrefSleep,
  crossrefWork,
  decodedPath,
  isCrossref,
  isOpenAlex,
  json,
  mockFetch,
  noSleep,
  openAlexList,
  openAlexSleep,
  ref,
  retrieverWith,
  SLEEP_DOI,
  SLEEP_TITLE,
  silentLogger,
} from "./helpers.ts";

const sleepRef = ref({
  rawText: `Doe J, Chen W. ${SLEEP_TITLE}. J Synth Sleep Res. 2020;12:1-9.`,
  title: SLEEP_TITLE,
  authors: ["Doe J", "Chen W"],
  year: 2020,
});

const crossrefDoiRoute = {
  match: (u: URL) => isCrossref(u) && decodedPath(u) === `/works/${SLEEP_DOI}`,
  respond: () => crossrefWork(crossrefSleep),
};
const openAlexDoiRoute = {
  match: (u: URL) =>
    isOpenAlex(u) && decodedPath(u) === `/works/doi:${SLEEP_DOI}`,
  respond: () => json(openAlexSleep),
};

describe("DOI lookup", () => {
  test("exact DOI → MATCHED via Crossref, enriched by an OpenAlex DOI lookup", async () => {
    const { fetch, calls } = mockFetch([crossrefDoiRoute, openAlexDoiRoute]);
    const r = await retrieverWith(fetch).retrieve({
      ...sleepRef,
      doi: SLEEP_DOI,
    });
    expect(r.status).toBe("MATCHED");
    expect(r.method).toBe("DOI");
    expect(r.confidence).toBe(0.99);
    expect(r.publication?.doi).toBe(SLEEP_DOI);
    expect(r.publication?.provider).toBe("CROSSREF");
    expect(r.publication?.openAccessStatus).toBe("gold"); // from OpenAlex
    expect(r.publication?.abstract).toBe("We studied sleep & memory."); // Crossref's kept
    // No searches once a DOI match exists.
    expect(
      calls.some(
        (u) =>
          u.searchParams.has("query.bibliographic") ||
          u.searchParams.has("filter"),
      ),
    ).toBe(false);
    expect(calls).toHaveLength(2);
  });

  test("normalises DOI variants before lookup (URL form, case, trailing punctuation)", async () => {
    const { fetch } = mockFetch([crossrefDoiRoute, openAlexDoiRoute]);
    const r = await retrieverWith(fetch).retrieve({
      ...sleepRef,
      doi: `https://doi.org/${SLEEP_DOI.toUpperCase()}.`,
    });
    expect(r.status).toBe("MATCHED");
  });

  test("uses a DOI written in the raw reference text", async () => {
    const { fetch } = mockFetch([crossrefDoiRoute, openAlexDoiRoute]);
    const r = await retrieverWith(fetch).retrieve({
      ...sleepRef,
      rawText: `${sleepRef.rawText} doi:${SLEEP_DOI}`,
    });
    expect(r.method).toBe("DOI");
    expect(r.status).toBe("MATCHED");
  });

  test("falls back to OpenAlex when Crossref does not know the DOI", async () => {
    const { fetch } = mockFetch([openAlexDoiRoute]);
    const r = await retrieverWith(fetch).retrieve({
      ...sleepRef,
      doi: SLEEP_DOI,
    });
    expect(r.status).toBe("MATCHED");
    expect(r.publication?.provider).toBe("OPENALEX");
  });

  test("a DOI resolving to an unrelated work is NEEDS_REVIEW, not MATCHED", async () => {
    const other = {
      ...crossrefSleep,
      title: ["Soil microbiome diversity in alpine meadows"],
      author: [{ family: "Novak", given: "P" }],
      issued: { "date-parts": [[2011]] },
    };
    const { fetch } = mockFetch([
      { match: crossrefDoiRoute.match, respond: () => crossrefWork(other) },
    ]);
    const r = await retrieverWith(fetch, { enrich: false }).retrieve({
      ...sleepRef,
      doi: SLEEP_DOI,
    });
    expect(r.status).toBe("NEEDS_REVIEW");
    expect(r.publication).toBeNull();
    expect(r.candidates).toHaveLength(1);
  });

  test("an invalid DOI is reported and title search is used", async () => {
    const { fetch } = mockFetch([
      {
        match: (u) => isCrossref(u) && u.pathname === "/works",
        respond: () => crossrefList([crossrefSleep]),
      },
    ]);
    const r = await retrieverWith(fetch, { enrich: false }).retrieve({
      ...sleepRef,
      doi: "not-a-doi",
    });
    expect(r.method).toBe("TITLE");
    expect(r.status).toBe("MATCHED");
    expect(r.reason).toContain("not a valid DOI");
  });
});

describe("title search", () => {
  const unrelated = {
    ...crossrefSleep,
    DOI: "10.5555/other",
    title: ["Caffeine intake and cardiovascular outcomes"],
    author: [{ family: "Smith", given: "A" }],
  };

  test("high-confidence title + author + year → MATCHED; OpenAlex search not used", async () => {
    const { fetch, calls } = mockFetch([
      {
        match: (u) => isCrossref(u) && u.pathname === "/works",
        respond: () => crossrefList([unrelated, crossrefSleep]),
      },
      openAlexDoiRoute,
    ]);
    const r = await retrieverWith(fetch).retrieve(sleepRef);
    expect(r.status).toBe("MATCHED");
    expect(r.method).toBe("TITLE");
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    expect(r.publication?.doi).toBe(SLEEP_DOI);
    const query =
      calls.find(isCrossref)?.searchParams.get("query.bibliographic") ?? "";
    expect(query).toContain(SLEEP_TITLE);
    expect(query).toContain("2020");
    expect(
      calls.filter((u) => isOpenAlex(u) && u.pathname === "/works"),
    ).toHaveLength(0);
  });

  test("OpenAlex search is the fallback when Crossref has no good candidate", async () => {
    const { fetch, calls } = mockFetch([
      {
        match: (u) => isCrossref(u) && u.pathname === "/works",
        respond: () => crossrefList([unrelated]),
      },
      {
        match: (u) => isOpenAlex(u) && u.pathname === "/works",
        respond: () => openAlexList([openAlexSleep]),
      },
    ]);
    const r = await retrieverWith(fetch).retrieve(sleepRef);
    expect(r.status).toBe("MATCHED");
    expect(r.publication?.provider).toBe("OPENALEX");
    expect(
      calls
        .find((u) => isOpenAlex(u) && u.pathname === "/works")
        ?.searchParams.get("filter"),
    ).toContain("title.search:");
  });

  test("the same work from both providers is merged into one candidate", async () => {
    const weakCrossref = {
      ...crossrefSleep,
      issued: { "date-parts": [[2017]] },
    }; // year contradicts → not MATCHED on Crossref alone
    const { fetch } = mockFetch([
      {
        match: (u) => isCrossref(u) && u.pathname === "/works",
        respond: () => crossrefList([weakCrossref]),
      },
      {
        match: (u) => isOpenAlex(u) && u.pathname === "/works",
        respond: () => openAlexList([openAlexSleep]),
      },
    ]);
    const r = await retrieverWith(fetch, { enrich: false }).retrieve(sleepRef);
    expect(
      r.candidates.filter((c) => c.publication.doi === SLEEP_DOI),
    ).toHaveLength(1);
  });

  test("two equally good candidates → AMBIGUOUS, nothing selected", async () => {
    const twin = { ...crossrefSleep, DOI: "10.5555/sleep.2020.002" }; // e.g. a preprint and the article
    const { fetch } = mockFetch([
      {
        match: (u) => isCrossref(u) && u.pathname === "/works",
        respond: () => crossrefList([crossrefSleep, twin]),
      },
      {
        match: (u) => isOpenAlex(u) && u.pathname === "/works",
        respond: () => openAlexList([]),
      },
    ]);
    const r = await retrieverWith(fetch).retrieve(sleepRef);
    expect(r.status).toBe("AMBIGUOUS");
    expect(r.publication).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.candidates.length).toBeGreaterThanOrEqual(2);
  });

  test("a similar but uncertain candidate → NEEDS_REVIEW", async () => {
    const near = {
      ...crossrefSleep,
      author: [{ family: "Novak", given: "P" }],
    }; // same title, other first author
    const { fetch } = mockFetch([
      {
        match: (u) => isCrossref(u) && u.pathname === "/works",
        respond: () => crossrefList([near]),
      },
      {
        match: (u) => isOpenAlex(u) && u.pathname === "/works",
        respond: () => openAlexList([]),
      },
    ]);
    const r = await retrieverWith(fetch).retrieve(sleepRef);
    expect(r.status).toBe("NEEDS_REVIEW");
    expect(r.publication).toBeNull();
  });

  test("no similar candidate → NOT_FOUND (providers answered)", async () => {
    const { fetch } = mockFetch([
      {
        match: (u) => isCrossref(u) && u.pathname === "/works",
        respond: () => crossrefList([unrelated]),
      },
      {
        match: (u) => isOpenAlex(u) && u.pathname === "/works",
        respond: () => openAlexList([]),
      },
    ]);
    const r = await retrieverWith(fetch).retrieve(sleepRef);
    expect(r.status).toBe("NOT_FOUND");
    expect(r.errors).toEqual([]);
  });

  test("a reference without a parsed title matches only if the candidate title appears in the raw text", async () => {
    const { fetch } = mockFetch([
      {
        match: (u) => isCrossref(u) && u.pathname === "/works",
        respond: () => crossrefList([crossrefSleep]),
      },
      openAlexDoiRoute,
    ]);
    const raw = ref({
      rawText: `Doe J, Chen W (2020) ${SLEEP_TITLE}. J Synth Sleep Res 12:1-9`,
      authors: ["Doe J"],
      year: 2020,
    });
    const r = await retrieverWith(fetch).retrieve(raw);
    expect(r.status).toBe("MATCHED");
  });

  test("too little information → NOT_FOUND without any request", async () => {
    const { fetch, calls } = mockFetch([]);
    const r = await retrieverWith(fetch).retrieve(ref({ rawText: "Ibid." }));
    expect(r.status).toBe("NOT_FOUND");
    expect(calls).toHaveLength(0);
  });
});

describe("provider failures", () => {
  test("all providers down → FAILED (never NOT_FOUND), with provider errors", async () => {
    const { fetch } = mockFetch([
      { match: () => true, respond: () => json({}, 503) },
    ]);
    const r = await retrieverWith(fetch, { maxRetries: 1 }).retrieve(sleepRef);
    expect(r.status).toBe("FAILED");
    expect(r.errors.map((e) => e.provider).sort()).toEqual([
      "CROSSREF",
      "OPENALEX",
    ]);
  });

  test("Crossref down, OpenAlex up → still matched", async () => {
    const { fetch } = mockFetch([
      { match: isCrossref, respond: () => json({}, 500) },
      {
        match: (u) => isOpenAlex(u) && u.pathname === "/works",
        respond: () => openAlexList([openAlexSleep]),
      },
    ]);
    const r = await retrieverWith(fetch, { maxRetries: 0 }).retrieve(sleepRef);
    expect(r.status).toBe("MATCHED");
    expect(r.errors[0]?.provider).toBe("CROSSREF");
  });

  test("nothing found while the fallback was down → FAILED (search incomplete), not NOT_FOUND", async () => {
    const unrelated = {
      ...crossrefSleep,
      DOI: "10.5555/other",
      title: ["Caffeine intake and cardiovascular outcomes"],
      author: [{ family: "Smith", given: "A" }],
    };
    const { fetch } = mockFetch([
      {
        match: (u) => isCrossref(u) && u.pathname === "/works",
        respond: () => crossrefList([unrelated]),
      },
      {
        match: isOpenAlex,
        respond: () => json({}, 429, { "retry-after": "3600" }),
      },
    ]);
    const r = await retrieverWith(fetch).retrieve(sleepRef);
    expect(r.status).toBe("FAILED");
    expect(r.errors[0]).toMatchObject({
      provider: "OPENALEX",
      kind: "RATE_LIMITED",
    });
  });

  test("timeouts are reported as FAILED", async () => {
    const fetch = (_: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        ),
      );
    const r = await retrieverWith(fetch, {
      timeoutMs: 15,
      maxRetries: 0,
    }).retrieve({ ...sleepRef, doi: SLEEP_DOI });
    expect(r.status).toBe("FAILED");
    expect(r.errors.every((e) => e.kind === "TIMEOUT")).toBe(true);
  });

  test("malformed provider JSON is an error, not data", async () => {
    const { fetch } = mockFetch([
      {
        match: () => true,
        respond: () => json({ status: "ok", message: { items: "nope" } }),
      },
    ]);
    const r = await retrieverWith(fetch).retrieve(sleepRef);
    expect(r.status).toBe("FAILED");
    expect(r.errors[0]?.kind).toBe("INVALID_RESPONSE");
  });

  test("no providers configured → FAILED", async () => {
    const r = await new PublicationRetriever({ primary: null }).retrieve(
      sleepRef,
    );
    expect(r.status).toBe("FAILED");
  });
});

describe("batching and politeness", () => {
  test("retrieveMany shares a cache so duplicate references cost one request", async () => {
    const { fetch, calls } = mockFetch([crossrefDoiRoute, openAlexDoiRoute]);
    const results = await retrieverWith(fetch).retrieveMany([
      { ...sleepRef, id: "a", doi: SLEEP_DOI },
      { ...sleepRef, id: "b", doi: SLEEP_DOI },
      { ...sleepRef, id: "c", doi: SLEEP_DOI },
    ]);
    expect(results.map((r) => [r.referenceId, r.status])).toEqual([
      ["a", "MATCHED"],
      ["b", "MATCHED"],
      ["c", "MATCHED"],
    ]);
    expect(calls).toHaveLength(2);
  });

  test("sends the contact email as mailto and in the User-Agent when configured", async () => {
    let headers: Headers | undefined;
    const provider = new CrossrefProvider({
      mailto: "ops@example.org",
      logger: silentLogger,
      sleep: noSleep,
      fetch: async (url, init) => {
        headers = new Headers(init?.headers);
        expect(new URL(url).searchParams.get("mailto")).toBe("ops@example.org");
        return crossrefWork(crossrefSleep);
      },
    });
    await provider.lookupDoi(SLEEP_DOI);
    expect(headers?.get("user-agent")).toContain("mailto:ops@example.org");
  });
});

describe("scoring", () => {
  const base = {
    provider: "CROSSREF" as const,
    sources: ["CROSSREF" as const],
    providerId: "x",
    doi: "10.1/x",
    journal: null,
    publisher: null,
    abstract: null,
    url: null,
    openAccess: null,
    openAccessStatus: null,
    openAccessUrl: null,
    openAlexId: null,
    type: null,
  };

  test("a different title with a different author is not even a review candidate", () => {
    const pub = {
      ...base,
      title: "Sleep quality and memory consolidation in older adults",
      authors: ["Novak, P"],
      year: 2020,
    };
    expect(scoreCandidate(sleepRef, pub).score).toBeLessThan(0.5);
  });

  test("a loosely similar title with matching author and year stays reviewable", () => {
    const pub = {
      ...base,
      title: "Sleep duration, working memory and attention in adults",
      authors: ["Doe, Jane"],
      year: 2020,
    };
    const { score } = scoreCandidate(sleepRef, pub);
    expect(score).toBeGreaterThanOrEqual(0.5);
    expect(score).toBeLessThan(0.9);
  });

  test("a correction notice with the same title is penalised", () => {
    const pub = {
      provider: "CROSSREF" as const,
      sources: ["CROSSREF" as const],
      providerId: "x",
      doi: "10.1/x",
      title: `Correction: ${SLEEP_TITLE}`,
      authors: ["Doe, Jane"],
      year: 2020,
      journal: null,
      publisher: null,
      abstract: null,
      url: null,
      openAccess: null,
      openAccessStatus: null,
      openAccessUrl: null,
      openAlexId: null,
      type: null,
    };
    expect(scoreCandidate(sleepRef, pub).score).toBeLessThan(0.6);
  });
});
