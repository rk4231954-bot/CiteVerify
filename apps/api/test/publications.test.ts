import { afterEach, describe, expect, test } from "bun:test";
import { prisma } from "@citeverify/database";
import { buildPdf, flowPage } from "@citeverify/document-parser/testing";
import {
  createDefaultRetriever,
  type FetchLike,
} from "@citeverify/publication-retriever";
import { setPublicationRetriever } from "../src/services/publication-providers.ts";
import { call, fileForm, PDF_MIME, registerUser } from "./helpers.ts";

async function api(...args: Parameters<typeof call>) {
  const res = await call(...args);
  // biome-ignore lint/suspicious/noExplicitAny: response shape is asserted by the tests
  return { status: res.status, body: res.body as any };
}

// A SYNTHETIC paper; every work and DOI below is fictional.
const paperPdf = (doi: string) =>
  buildPdf([
    flowPage([
      { lines: ["1. Introduction"], size: 13 },
      {
        lines: [
          "Insulin regulates glucose uptake in skeletal muscle (Smith et al., 2020). Smoking",
          "causes lung cancer (Kim, 2021a). Exercise improves mood (Kim, 2021b).",
          "Lee and Park (2019) described the cohort.",
        ],
      },
    ]),
    flowPage([
      { lines: ["References"], size: 13 },
      {
        lines: [
          "Kim, H. (2021a). First synthetic smoking study. Imaginary Oncology, 1, 1-2.",
          "Kim, H. (2021b). Second synthetic exercise study. Imaginary Oncology, 2, 3-4.",
          "Lee, K., & Park, J. (2019). A fictional cohort of adults. Example Press.",
          "Smith, J., Doe, A., & Roe, B. (2020). Insulin in fictional muscle. Journal of Made-up",
          `Physiology, 8, 100-110. https://doi.org/${doi}`,
        ],
      },
    ]),
  ]);

// ─── Mocked providers ────────────────────────────────────────────────────

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const crossrefWork = (
  doi: string,
  title: string,
  family: string,
  year: number,
) => ({
  DOI: doi,
  title: [title],
  author: [{ given: "J", family }],
  issued: { "date-parts": [[year]] },
  "container-title": ["Journal of Made-up Physiology"],
  publisher: "Example Press",
  URL: `https://doi.org/${doi}`,
});

function providers(smithDoi: string) {
  const calls: URL[] = [];
  const fetch: FetchLike = async (input) => {
    const url = new URL(input);
    calls.push(url);
    const path = decodeURIComponent(url.pathname);
    const q =
      url.searchParams.get("query.bibliographic") ??
      url.searchParams.get("filter") ??
      "";
    if (url.hostname === "api.crossref.org") {
      if (path === `/works/${smithDoi}`)
        return json({
          status: "ok",
          message: crossrefWork(
            smithDoi,
            "Insulin in fictional muscle",
            "Smith",
            2020,
          ),
        });
      if (path === "/works" && q.includes("Second synthetic exercise study"))
        // Two equally plausible records (e.g. preprint + article) → AMBIGUOUS.
        return json({
          status: "ok",
          message: {
            items: [
              crossrefWork(
                "10.5555/kim.b.1",
                "Second synthetic exercise study",
                "Kim",
                2021,
              ),
              crossrefWork(
                "10.5555/kim.b.2",
                "Second synthetic exercise study",
                "Kim",
                2021,
              ),
            ],
          },
        });
      if (path === "/works")
        return json({ status: "ok", message: { items: [] } });
    }
    if (url.hostname === "api.openalex.org") {
      if (path === `/works/doi:${smithDoi}`)
        return json({
          id: `https://openalex.org/W77${smithDoi.replace(/\D/g, "")}`,
          doi: `https://doi.org/${smithDoi}`,
          title: "Insulin in fictional muscle",
          publication_year: 2020,
          authorships: [{ author: { display_name: "J Smith" } }],
          open_access: {
            is_oa: true,
            oa_status: "green",
            oa_url: "https://repo.example.org/smith.pdf",
          },
          abstract_inverted_index: { Fictional: [0], abstract: [1] },
        });
      if (path === "/works" && q.includes("A fictional cohort of adults"))
        return json({
          results: [
            {
              id: `https://openalex.org/W88${smithDoi.replace(/\D/g, "")}`,
              doi: null,
              title: "A fictional cohort of adults",
              publication_year: 2019,
              authorships: [
                { author: { display_name: "K Lee" } },
                { author: { display_name: "J Park" } },
              ],
              open_access: { is_oa: false, oa_status: "closed", oa_url: null },
            },
          ],
        });
      if (path === "/works") return json({ results: [] });
    }
    return json({ message: "not found" }, 404);
  };
  const retriever = createDefaultRetriever({
    fetch,
    logger: { warn: () => {} },
    sleep: async () => {},
    minIntervalMs: 0,
    retryBaseDelayMs: 0,
  });
  return { retriever, calls };
}

const unavailable = () =>
  createDefaultRetriever({
    fetch: async () => json({}, 503),
    logger: { warn: () => {} },
    sleep: async () => {},
    minIntervalMs: 0,
    maxRetries: 1,
  });

afterEach(() => setPublicationRetriever(null));

let docCounter = 0;
const uniqueDoi = () => `10.1234/jmp.${Date.now()}.${++docCounter}`;

async function documentWithReferences(token: string, doi: string) {
  const up = await api("POST", "/documents/upload", {
    token,
    form: fileForm(paperPdf(doi), "paper.pdf", PDF_MIME),
  });
  const id = up.body.data.id as string;
  expect(
    (await api("POST", `/documents/${id}/extract`, { token })).status,
  ).toBe(200);
  expect(
    (await api("POST", `/documents/${id}/detect-citations`, { token })).status,
  ).toBe(200);
  const refs = (await api("GET", `/documents/${id}/references`, { token })).body
    .data.references as {
    id: string;
    title: string;
    authors: string[];
    doi: string | null;
  }[];
  return {
    id,
    refs,
    byAuthor: (title: string) => refs.find((r) => r.title?.startsWith(title)),
  };
}

describe("POST /api/documents/:id/retrieve-publications", () => {
  test("matches by DOI and title, keeps uncertain results unlinked, stores metadata", async () => {
    const doi = uniqueDoi();
    const { retriever } = providers(doi);
    setPublicationRetriever(retriever);
    const { token } = await registerUser();
    const { id, refs, byAuthor } = await documentWithReferences(token, doi);
    expect(refs).toHaveLength(4);

    const res = await api("POST", `/documents/${id}/retrieve-publications`, {
      token,
    });
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.stats).toMatchObject({
      references: 4,
      processed: 4,
      skipped: 0,
      remaining: 0,
      publicationsCreated: 2,
    });
    expect(data.stats.byStatus).toMatchObject({
      MATCHED: 2,
      AMBIGUOUS: 1,
      NOT_FOUND: 1,
      NEEDS_REVIEW: 0,
      FAILED: 0,
    });
    expect(data.note).toContain("does not mean the full text is available");

    const resultFor = (title: string) =>
      data.results.find(
        (r: { referenceId: string }) => r.referenceId === byAuthor(title)?.id,
      );
    expect(resultFor("Insulin")).toMatchObject({
      status: "MATCHED",
      method: "DOI",
      confidence: 0.99,
    });
    expect(resultFor("A fictional cohort")).toMatchObject({
      status: "MATCHED",
      method: "TITLE",
    });
    expect(resultFor("Second synthetic")).toMatchObject({
      status: "AMBIGUOUS",
      publicationId: null,
      confidence: 0,
    });
    expect(resultFor("Second synthetic").candidates).toHaveLength(2);
    expect(resultFor("First synthetic")).toMatchObject({
      status: "NOT_FOUND",
      publicationId: null,
    });

    // DB: the DOI match is stored, merged with OpenAlex's OA info, and linked to the reference.
    const smithRef = await prisma.reference.findUniqueOrThrow({
      where: { id: byAuthor("Insulin")?.id },
      include: { publication: true },
    });
    expect(smithRef.publicationMatchStatus).toBe("MATCHED");
    expect(smithRef.publicationMatchMethod).toBe("DOI");
    expect(smithRef.retrievedAt).toBeInstanceOf(Date);
    expect(smithRef.publication).toMatchObject({
      doi,
      title: "Insulin in fictional muscle",
      year: 2020,
      journal: "Journal of Made-up Physiology",
      publisher: "Example Press",
      abstract: "Fictional abstract",
      openAccess: true,
      openAccessStatus: "green",
      openAlexId: `W77${doi.replace(/\D/g, "")}`,
      provider: "CROSSREF,OPENALEX",
      retrievalStatus: "RETRIEVED",
    });
    // A title-only OpenAlex match without a DOI is deduplicated by OpenAlex id.
    const leeRef = await prisma.reference.findUniqueOrThrow({
      where: { id: byAuthor("A fictional cohort")?.id },
      include: { publication: true },
    });
    expect(leeRef.publication).toMatchObject({
      doi: null,
      openAlexId: `W88${doi.replace(/\D/g, "")}`,
      openAccess: false,
      openAccessStatus: "closed",
      provider: "OPENALEX",
    });

    // Uncertain outcomes stay visible but unlinked; non-matched candidates are not saved as publications.
    const kimB = await prisma.reference.findUniqueOrThrow({
      where: { id: byAuthor("Second synthetic")?.id },
    });
    expect(kimB.publicationId).toBeNull();
    expect(JSON.parse(kimB.publicationCandidates ?? "[]")).toHaveLength(2);
    expect(
      await prisma.publication.count({
        where: { doi: { startsWith: "10.5555/kim.b" } },
      }),
    ).toBe(0);

    // Re-running without force skips everything that already has a result.
    const again = await api("POST", `/documents/${id}/retrieve-publications`, {
      token,
    });
    expect(again.body.data.stats).toMatchObject({ processed: 0, skipped: 4 });
  });

  test("GET endpoints expose status, confidence, candidates and publication", async () => {
    const doi = uniqueDoi();
    setPublicationRetriever(providers(doi).retriever);
    const { token } = await registerUser();
    const { id, byAuthor } = await documentWithReferences(token, doi);
    await api("POST", `/documents/${id}/retrieve-publications`, { token });

    const list = (await api("GET", `/documents/${id}/publications`, { token }))
      .body.data;
    expect(list.total).toBe(4);
    expect(list.publications).toHaveLength(2);
    const smith = list.references.find(
      (r: { reference: { id: string } }) =>
        r.reference.id === byAuthor("Insulin")?.id,
    );
    expect(smith.retrieval).toMatchObject({
      status: "MATCHED",
      confidence: 0.99,
      method: "DOI",
      errors: [],
    });
    expect(smith.publication).toMatchObject({
      doi,
      doiUrl: `https://doi.org/${doi}`,
      providers: ["CROSSREF", "OPENALEX"],
    });

    const ambiguous = (
      await api("GET", `/documents/${id}/publications?status=AMBIGUOUS`, {
        token,
      })
    ).body.data;
    expect(ambiguous.total).toBe(1);

    const forRef = await api(
      "GET",
      `/references/${byAuthor("Second synthetic")?.id}/publication`,
      { token },
    );
    expect(forRef.status).toBe(200);
    expect(forRef.body.data.publication).toBeNull();
    expect(forRef.body.data.retrieval.status).toBe("AMBIGUOUS");
    expect(
      forRef.body.data.candidates.map((c: { doi: string }) => c.doi).sort(),
    ).toEqual(["10.5555/kim.b.1", "10.5555/kim.b.2"]);

    const pub = await api("GET", `/publications/${smith.publication.id}`, {
      token,
    });
    expect(pub.status).toBe(200);
    expect(pub.body.data.publication.title).toBe("Insulin in fictional muscle");
    expect(pub.body.data.references).toHaveLength(1);
  });

  test("deduplicates publications by DOI across documents and users", async () => {
    const doi = uniqueDoi();
    setPublicationRetriever(providers(doi).retriever);
    const a = await registerUser();
    const b = await registerUser();
    const docA = await documentWithReferences(a.token, doi);
    const docB = await documentWithReferences(b.token, doi);
    await api("POST", `/documents/${docA.id}/retrieve-publications`, {
      token: a.token,
    });
    const resB = await api(
      "POST",
      `/documents/${docB.id}/retrieve-publications`,
      { token: b.token },
    );
    expect(resB.body.data.stats.publicationsCreated).toBe(0);
    expect(await prisma.publication.count({ where: { doi } })).toBe(1);

    // Each user sees only their own references to the shared publication.
    const pub = await prisma.publication.findUniqueOrThrow({ where: { doi } });
    const seenByB = (
      await api("GET", `/publications/${pub.id}`, { token: b.token })
    ).body.data;
    expect(
      seenByB.references.map((r: { documentId: string }) => r.documentId),
    ).toEqual([docB.id]);
  });

  test("never overwrites reliable existing metadata; only fills empty fields", async () => {
    const doi = uniqueDoi();
    await prisma.publication.create({
      data: {
        doi,
        title: "Curated title",
        year: 2020,
        abstract: "Curated abstract",
        publisher: "Curated Press",
      },
    });
    setPublicationRetriever(providers(doi).retriever);
    const { token } = await registerUser();
    const { id } = await documentWithReferences(token, doi);
    await api("POST", `/documents/${id}/retrieve-publications`, { token });

    const pub = await prisma.publication.findUniqueOrThrow({ where: { doi } });
    expect(pub).toMatchObject({
      title: "Curated title",
      abstract: "Curated abstract",
      publisher: "Curated Press",
      year: 2020, // kept
      journal: "Journal of Made-up Physiology",
      openAccess: true,
      openAlexId: `W77${doi.replace(/\D/g, "")}`,
      retrievalStatus: "RETRIEVED", // filled
    });
    expect(JSON.parse(pub.authors ?? "[]")).toEqual(["Smith, J"]);
  });

  test("an OpenAlex id already stored with a different DOI is not merged into", async () => {
    const doi = uniqueDoi();
    const other = await prisma.publication.create({
      data: {
        doi: `${doi}.other`,
        openAlexId: `W77${doi.replace(/\D/g, "")}`,
        title: "Some other work",
      },
    });
    setPublicationRetriever(providers(doi).retriever);
    const { token } = await registerUser();
    const { id } = await documentWithReferences(token, doi);
    await api("POST", `/documents/${id}/retrieve-publications`, { token });

    const created = await prisma.publication.findUniqueOrThrow({
      where: { doi },
    });
    expect(created.id).not.toBe(other.id);
    expect(created.openAlexId).toBeNull();
    expect(
      await prisma.publication.findUniqueOrThrow({ where: { id: other.id } }),
    ).toMatchObject({ title: "Some other work", abstract: null });
  });

  test("unavailable providers → FAILED without crashing, then retried on the next run", async () => {
    const doi = uniqueDoi();
    setPublicationRetriever(unavailable());
    const { token } = await registerUser();
    const { id, byAuthor } = await documentWithReferences(token, doi);

    const down = await api("POST", `/documents/${id}/retrieve-publications`, {
      token,
    });
    expect(down.status).toBe(200);
    expect(down.body.data.stats.byStatus.FAILED).toBe(4);
    const failed = await prisma.reference.findUniqueOrThrow({
      where: { id: byAuthor("Insulin")?.id },
    });
    expect(failed.publicationId).toBeNull();
    expect(failed.publicationMatchStatus).toBe("FAILED");
    expect(JSON.parse(failed.retrievalError ?? "[]")[0]).toMatchObject({
      kind: "HTTP",
      status: 503,
    });

    setPublicationRetriever(providers(doi).retriever);
    const up = await api("POST", `/documents/${id}/retrieve-publications`, {
      token,
    });
    expect(up.body.data.stats).toMatchObject({ processed: 4, skipped: 0 });
    expect(up.body.data.stats.byStatus.MATCHED).toBe(2);
  });

  test("an outage during a forced re-run keeps existing links", async () => {
    const doi = uniqueDoi();
    setPublicationRetriever(providers(doi).retriever);
    const { token } = await registerUser();
    const { id, byAuthor } = await documentWithReferences(token, doi);
    await api("POST", `/documents/${id}/retrieve-publications`, { token });

    setPublicationRetriever(unavailable());
    const smithId = byAuthor("Insulin")?.id ?? "";
    const res = await api("POST", `/documents/${id}/retrieve-publications`, {
      token,
      json: { referenceIds: [smithId], force: true },
    });
    expect(res.body.data.stats.processed).toBe(1);
    const ref = await prisma.reference.findUniqueOrThrow({
      where: { id: smithId },
    });
    expect(ref.publicationId).not.toBeNull();
    expect(ref.publicationMatchStatus).toBe("MATCHED");
    expect(ref.retrievalError).toContain("503");
  });

  test("re-running citation detection keeps retrieval results", async () => {
    const doi = uniqueDoi();
    setPublicationRetriever(providers(doi).retriever);
    const { token } = await registerUser();
    const { id } = await documentWithReferences(token, doi);
    await api("POST", `/documents/${id}/retrieve-publications`, { token });
    await api("POST", `/documents/${id}/detect-citations`, { token });

    const refs = (await api("GET", `/documents/${id}/publications`, { token }))
      .body.data.references;
    expect(
      refs
        .map((r: { retrieval: { status: string } }) => r.retrieval.status)
        .sort(),
    ).toEqual(["AMBIGUOUS", "MATCHED", "MATCHED", "NOT_FOUND"]);
    expect(
      refs.filter((r: { publication: unknown }) => r.publication),
    ).toHaveLength(2);
  });

  test("ownership, validation and preconditions", async () => {
    const doi = uniqueDoi();
    setPublicationRetriever(providers(doi).retriever);
    const owner = await registerUser();
    const other = await registerUser();
    const { id, refs } = await documentWithReferences(owner.token, doi);
    await api("POST", `/documents/${id}/retrieve-publications`, {
      token: owner.token,
    });
    const pub = await prisma.publication.findUniqueOrThrow({ where: { doi } });

    expect(
      (
        await api("POST", `/documents/${id}/retrieve-publications`, {
          token: other.token,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await api("GET", `/documents/${id}/publications`, {
          token: other.token,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await api("GET", `/references/${refs[0]?.id}/publication`, {
          token: other.token,
        })
      ).status,
    ).toBe(404);
    expect(
      (await api("GET", `/publications/${pub.id}`, { token: other.token }))
        .status,
    ).toBe(404);
    expect((await api("GET", `/publications/${pub.id}`)).status).toBe(401);

    expect(
      (
        await api("POST", `/documents/${id}/retrieve-publications`, {
          token: owner.token,
          json: { referenceIds: ["nope"] },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await api("POST", `/documents/${id}/retrieve-publications`, {
          token: owner.token,
          json: { force: "yes" },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api("GET", `/documents/${id}/publications?status=MAYBE`, {
          token: owner.token,
        })
      ).status,
    ).toBe(400);

    // A document without detected references cannot be processed yet.
    const up = await api("POST", "/documents/upload", {
      token: owner.token,
      form: fileForm(paperPdf(doi), "p.pdf", PDF_MIME),
    });
    const res = await api(
      "POST",
      `/documents/${up.body.data.id}/retrieve-publications`,
      { token: owner.token },
    );
    expect(res.status).toBe(409);
  });
});
