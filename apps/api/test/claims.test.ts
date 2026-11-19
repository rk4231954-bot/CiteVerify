import { describe, expect, test } from "bun:test";
import { prisma } from "@citeverify/database";
import { buildPdf, flowPage } from "@citeverify/document-parser/testing";
import { call, fileForm, PDF_MIME, registerUser } from "./helpers.ts";

/** `call` with the envelope left untyped: these tests assert on its shape directly. */
async function api(...args: Parameters<typeof call>) {
  const res = await call(...args);
  // biome-ignore lint/suspicious/noExplicitAny: response shape is asserted by the tests
  return { status: res.status, body: res.body as any };
}

// A SYNTHETIC two-page paper; its sentences are invented for testing.
const paperPdf = () =>
  buildPdf([
    flowPage([
      { lines: ["1. Introduction"], size: 13 },
      {
        lines: [
          "In this paper, we present a synthetic framework. Insulin regulates glucose uptake",
          "in skeletal muscle [1].",
        ],
      },
      { lines: ["2. Results"], size: 13 },
      {
        lines: [
          "Treatment A significantly increased growth rate. Group A had higher survival than",
          "group B (p < 0.01).",
        ],
      },
    ]),
    flowPage([
      { lines: ["3. Discussion"], size: 13 },
      {
        lines: [
          "The results indicate a positive relationship between temperature and mortality.",
        ],
      },
      { lines: ["Acknowledgements"], size: 13 },
      {
        lines: ["We thank the synthetic lab. Funding increased staff by 20%."],
      },
    ]),
  ]);

async function extractedDocument(token: string) {
  const up = await api("POST", "/documents/upload", {
    token,
    form: fileForm(paperPdf(), "paper.pdf", PDF_MIME),
  });
  const id = up.body.data.id as string;
  const ex = await api("POST", `/documents/${id}/extract`, { token });
  expect(ex.status).toBe(200);
  return id;
}

describe("POST /api/documents/:id/extract-claims", () => {
  test("extracts claims from the stored extraction and saves them", async () => {
    const { token } = await registerUser();
    const id = await extractedDocument(token);

    const res = await api("POST", `/documents/${id}/extract-claims`, {
      token,
    });
    expect(res.status).toBe(201);
    const data = res.body.data;
    expect(data).toMatchObject({
      documentId: id,
      method: "RULE_BASED",
      created: 4,
      skippedDuplicates: 0,
      removed: 0,
    });
    expect(data.claims.map((c: { category: string }) => c.category)).toEqual([
      "SCIENTIFIC_FACT",
      "EXPERIMENTAL_FINDING",
      "STATISTICAL_CLAIM",
      "RESEARCH_CONCLUSION",
    ]);

    const [fact, , stat, conclusion] = data.claims;
    expect(fact).toMatchObject({
      originalText: "Insulin regulates glucose uptake in skeletal muscle [1].",
      normalizedText: "Insulin regulates glucose uptake in skeletal muscle.",
      pageNumber: 1,
      section: "1. Introduction",
      extractionMethod: "RULE_BASED",
    });
    expect(fact.paragraphId).toMatch(/^p\d+$/);
    expect(stat.characteristics).toEqual(
      expect.arrayContaining(["P_VALUE", "COMPARISON"]),
    );
    expect(stat.rationale.length).toBeGreaterThan(0);
    expect(conclusion).toMatchObject({
      pageNumber: 2,
      section: "3. Discussion",
    });
    expect(conclusion.confidence).toBeGreaterThan(0.5);
    expect(conclusion.confidence).toBeLessThan(1);

    // Paragraph ids point back into the stored extraction.
    const stored = await api("GET", `/documents/${id}/extraction`, { token });
    const paragraphs = stored.body.data.extraction.result.paragraphs as {
      id: string;
      cleanedText: string;
    }[];
    for (const claim of data.claims)
      expect(
        paragraphs.find((p) => p.id === claim.paragraphId)?.cleanedText,
      ).toContain(claim.originalText);

    // Document status is untouched by claim extraction.
    expect(
      (await api("GET", `/documents/${id}`, { token })).body.data.document
        .status,
    ).toBe("EXTRACTED");
  });

  test("re-running does not create duplicates; replace re-creates", async () => {
    const { token } = await registerUser();
    const id = await extractedDocument(token);
    await api("POST", `/documents/${id}/extract-claims`, { token });

    const again = await api("POST", `/documents/${id}/extract-claims`, {
      token,
      json: {},
    });
    expect(again.body.data).toMatchObject({
      created: 0,
      skippedDuplicates: 4,
      claims: [],
    });
    expect(
      await prisma.extractedClaim.count({ where: { documentId: id } }),
    ).toBe(4);

    const replaced = await api("POST", `/documents/${id}/extract-claims`, {
      token,
      json: { replace: true },
    });
    expect(replaced.body.data).toMatchObject({
      created: 4,
      removed: 4,
      skippedDuplicates: 0,
    });
    expect(
      await prisma.extractedClaim.count({ where: { documentId: id } }),
    ).toBe(4);
  });

  test("duplicates of manually stored claims are skipped", async () => {
    const { token } = await registerUser();
    const id = await extractedDocument(token);
    await prisma.extractedClaim.create({
      data: {
        documentId: id,
        originalText: "treatment a significantly increased growth rate",
        extractionMethod: "MANUAL",
      },
    });
    const res = await api("POST", `/documents/${id}/extract-claims`, {
      token,
      json: { replace: true },
    });
    expect(res.body.data).toMatchObject({
      created: 3,
      skippedDuplicates: 1,
      removed: 0,
    });
  });

  test("honours a custom confidence threshold", async () => {
    const { token } = await registerUser();
    const id = await extractedDocument(token);
    const res = await api("POST", `/documents/${id}/extract-claims`, {
      token,
      json: { minConfidence: 0.99 },
    });
    expect(res.body.data.created).toBe(0);
  });

  test("requires a usable extraction", async () => {
    const { token } = await registerUser();
    const up = await api("POST", "/documents/upload", {
      token,
      form: fileForm(paperPdf(), "paper.pdf", PDF_MIME),
    });
    const res = await api(
      "POST",
      `/documents/${up.body.data.id}/extract-claims`,
      { token },
    );
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  test("AI method without a configured provider is reported, not faked", async () => {
    const { token } = await registerUser();
    const id = await extractedDocument(token);
    const res = await api("POST", `/documents/${id}/extract-claims`, {
      token,
      json: { method: "AI" },
    });
    expect(res.status).toBe(501);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: "AI_PROVIDER_NOT_CONFIGURED" },
    });
    expect(
      await prisma.extractedClaim.count({ where: { documentId: id } }),
    ).toBe(0);
  });

  test("validates the body", async () => {
    const { token } = await registerUser();
    const id = await extractedDocument(token);
    const res = await api("POST", `/documents/${id}/extract-claims`, {
      token,
      json: { method: "MAGIC" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  test("requires authentication and ownership", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const id = await extractedDocument(owner.token);
    expect((await api("POST", `/documents/${id}/extract-claims`)).status).toBe(
      401,
    );
    expect(
      (
        await api("POST", `/documents/${id}/extract-claims`, {
          token: other.token,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await api("POST", "/documents/missing/extract-claims", {
          token: owner.token,
        })
      ).status,
    ).toBe(404);
  });
});

describe("claim retrieval and deletion", () => {
  test("GET /documents/:id/claims lists in reading order with filters and pagination", async () => {
    const { token } = await registerUser();
    const id = await extractedDocument(token);
    await api("POST", `/documents/${id}/extract-claims`, { token });

    const all = await api("GET", `/documents/${id}/claims`, { token });
    expect(all.status).toBe(200);
    expect(
      all.body.data.claims.map((c: { position: number }) => c.position),
    ).toEqual([0, 1, 2, 3]);
    expect(all.body.data.pagination).toMatchObject({ total: 4, page: 1 });

    const stats = await api(
      "GET",
      `/documents/${id}/claims?category=STATISTICAL_CLAIM`,
      { token },
    );
    expect(stats.body.data.claims).toHaveLength(1);

    const paged = await api("GET", `/documents/${id}/claims?limit=3&page=2`, {
      token,
    });
    expect(paged.body.data.claims).toHaveLength(1);

    expect(
      (await api("GET", `/documents/${id}/claims?category=OPINION`, { token }))
        .status,
    ).toBe(400);
  });

  test("GET and DELETE /claims/:id enforce ownership", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const id = await extractedDocument(owner.token);
    const { claims } = (
      await api("POST", `/documents/${id}/extract-claims`, {
        token: owner.token,
      })
    ).body.data;
    const claimId = claims[0].id as string;

    const got = await api("GET", `/claims/${claimId}`, { token: owner.token });
    expect(got.status).toBe(200);
    expect(got.body.data.claim).toMatchObject({ id: claimId, documentId: id });

    expect((await api("GET", `/claims/${claimId}`)).status).toBe(401);
    expect(
      (await api("GET", `/claims/${claimId}`, { token: other.token })).status,
    ).toBe(404);
    expect(
      (await api("DELETE", `/claims/${claimId}`, { token: other.token }))
        .status,
    ).toBe(404);

    const del = await api("DELETE", `/claims/${claimId}`, {
      token: owner.token,
    });
    expect(del.body).toMatchObject({
      success: true,
      data: { deleted: { id: claimId } },
    });
    expect(
      (await api("GET", `/claims/${claimId}`, { token: owner.token })).status,
    ).toBe(404);
    expect(
      (await api("DELETE", `/claims/${claimId}`, { token: owner.token }))
        .status,
    ).toBe(404);
  });

  test("claims are removed with their document", async () => {
    const { token } = await registerUser();
    const id = await extractedDocument(token);
    await api("POST", `/documents/${id}/extract-claims`, { token });
    await api("DELETE", `/documents/${id}`, { token });
    expect(
      await prisma.extractedClaim.count({ where: { documentId: id } }),
    ).toBe(0);
  });
});
