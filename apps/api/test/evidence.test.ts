import { afterEach, describe, expect, test } from "bun:test";
import { prisma } from "@citeverify/database";
import { buildPdf, flowPage } from "@citeverify/document-parser/testing";
import {
  type EvidenceAiProvider,
  fetchOpenAccessFullText,
} from "@citeverify/evidence-extractor";
import {
  setEvidenceAiProvider,
  setFullTextSource,
} from "../src/services/evidence-providers.ts";
import { call, fileForm, PDF_MIME, registerUser } from "./helpers.ts";

async function api(...args: Parameters<typeof call>) {
  const res = await call(...args);
  // biome-ignore lint/suspicious/noExplicitAny: response shape is asserted by the tests
  return { status: res.status, body: res.body as any };
}

// ─── SYNTHETIC fixtures: every study, author, number and URL is fictional ──

const citingPaper = buildPdf([
  flowPage([
    { lines: ["1. Introduction"], size: 13 },
    {
      lines: [
        "Aerobic exercise reduces systolic blood pressure in older adults (Smith et al., 2020).",
        "Coffee consumption is associated with improved sleep quality (Lee & Park, 2019).",
      ],
    },
  ]),
  flowPage([
    { lines: ["References"], size: 13 },
    {
      lines: [
        "Lee, K., & Park, J. (2019). A fictional sleep cohort. Example Press.",
        "Smith, J., Doe, A., & Roe, B. (2020). Walking and blood pressure in a fictional trial.",
        "Journal of Made-up Cardiology, 8, 100-110.",
      ],
    },
  ]),
]);

const SMITH_ABSTRACT =
  "Background: Hypertension is common in older adults. Methods: We conducted a randomised controlled trial of 240 adults aged 65 years or older. Results: Aerobic exercise reduced systolic blood pressure by 8.2 mmHg compared with usual care (95% CI 5.1 to 11.3; p < 0.001). Conclusions: Supervised aerobic exercise lowers systolic blood pressure in older adults.";

const LEE_ABSTRACT =
  "We followed 1,200 adults for two years. Coffee consumption was not associated with sleep quality after adjustment for age (p = 0.41).";

const OA_URL = "https://repo.example.org/smith-2020.pdf";

const smithFullText = buildPdf([
  flowPage([
    { lines: ["Methods"], size: 13 },
    {
      lines: [
        "We randomly assigned 240 participants aged 65 years or older to supervised",
        "aerobic exercise or usual care for 12 weeks.",
      ],
    },
    { lines: ["Results"], size: 13 },
    {
      lines: [
        "Systolic blood pressure decreased by 8.2 mmHg in the exercise group compared",
        "with usual care (95% CI 5.1 to 11.3; p < 0.001).",
      ],
    },
  ]),
  flowPage([
    { lines: ["Limitations"], size: 13 },
    {
      lines: [
        "The trial was limited by its short follow-up and a predominantly urban sample",
        "of older adults.",
      ],
    },
    { lines: ["Conclusion"], size: 13 },
    {
      lines: [
        "These findings suggest that supervised aerobic exercise lowers systolic blood",
        "pressure in older adults.",
      ],
    },
  ]),
]);

/** The real open-access source, with an in-memory "network" that only knows OA_URL. */
function mockOpenAccess(pdf = smithFullText, status = 200) {
  const calls: string[] = [];
  setFullTextSource((request) =>
    fetchOpenAccessFullText(request, {
      fetch: async (input) => {
        calls.push(String(input));
        return String(input) === OA_URL
          ? new Response(status === 200 ? pdf : "denied", {
              status,
              headers: { "content-type": "application/pdf" },
            })
          : new Response("not found", { status: 404 });
      },
    }),
  );
  return calls;
}

afterEach(() => {
  setFullTextSource(null);
  setEvidenceAiProvider(null);
});

let counter = 0;

/** A user's document whose references are matched to two synthetic publications. */
async function setup(
  options: {
    smith?: Partial<Parameters<typeof prisma.publication.create>[0]["data"]>;
  } = {},
) {
  const { token } = await registerUser();
  const up = await api("POST", "/documents/upload", {
    token,
    form: fileForm(citingPaper, "paper.pdf", PDF_MIME),
  });
  const documentId = up.body.data.id as string;
  expect(
    (await api("POST", `/documents/${documentId}/extract`, { token })).status,
  ).toBe(200);
  expect(
    (await api("POST", `/documents/${documentId}/extract-claims`, { token }))
      .status,
  ).toBe(201);
  expect(
    (await api("POST", `/documents/${documentId}/detect-citations`, { token }))
      .status,
  ).toBe(200);

  const n = ++counter;
  const smith = await prisma.publication.create({
    data: {
      title: "Walking and blood pressure in a fictional trial",
      year: 2020,
      doi: `10.5555/evidence.smith.${Date.now()}.${n}`,
      abstract: SMITH_ABSTRACT,
      openAccess: true,
      openAccessUrl: OA_URL,
      retrievalStatus: "RETRIEVED",
      ...options.smith,
    },
  });
  const lee = await prisma.publication.create({
    data: {
      title: "A fictional sleep cohort",
      year: 2019,
      abstract: LEE_ABSTRACT,
      openAccess: false,
      retrievalStatus: "RETRIEVED",
    },
  });
  const refs = await prisma.reference.findMany({ where: { documentId } });
  for (const ref of refs)
    await prisma.reference.update({
      where: { id: ref.id },
      data: {
        publicationId: ref.rawText.startsWith("Smith") ? smith.id : lee.id,
        publicationMatchStatus: "MATCHED",
      },
    });
  const claims = await prisma.extractedClaim.findMany({
    where: { documentId },
    include: { citationLinks: true },
  });
  const claim = (word: string) => {
    const c = claims.find((x) => x.originalText.includes(word));
    if (!c) throw new Error(`no claim containing "${word}"`);
    return c;
  };
  return {
    token,
    documentId,
    smith,
    lee,
    exercise: claim("exercise"),
    coffee: claim("Coffee"),
  };
}

const types = (evidence: { evidenceType: string }[]) =>
  new Set(evidence.map((e) => e.evidenceType));

describe("POST /api/publications/:id/extract-evidence", () => {
  test("open-access publication: full text and abstract, sections and pages kept", async () => {
    const calls = mockOpenAccess();
    const { token, smith } = await setup();
    const res = await api(
      "POST",
      `/publications/${smith.id}/extract-evidence`,
      { token },
    );
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(calls).toEqual([OA_URL]);
    expect(data.verificationScope).toBe("FULL");
    expect(data.fullText).toMatchObject({
      status: "AVAILABLE",
      sourceUrl: OA_URL,
    });
    expect(data.created).toBeGreaterThan(0);
    expect(data.created).toBe(data.evidence.length);

    const full = data.evidence.filter(
      (e: { evidenceAvailability: string }) =>
        e.evidenceAvailability === "FULL_TEXT",
    );
    expect(types(full)).toEqual(
      new Set([
        "METHODOLOGY",
        "STATISTICAL_RESULT",
        "LIMITATION",
        "CONCLUSION",
      ]),
    );
    for (const e of full) {
      expect(e.sourceUrl).toBe(OA_URL);
      expect([1, 2]).toContain(e.pageNumber);
      expect(e.section).toBeString();
      expect(e.extractionMethod).toBe("RULE_BASED");
    }
    const stat = full.find(
      (e: { evidenceType: string }) => e.evidenceType === "STATISTICAL_RESULT",
    );
    expect(stat.sourceText).toContain("8.2 mmHg");
    expect(stat.section).toBe("Results");
    expect(stat.pageNumber).toBe(1);
    expect(
      stat.details.statistics.map((s: { text: string }) => s.text),
    ).toEqual(expect.arrayContaining(["p < 0.001"]));

    // Passages identical in the abstract and full text are stored once.
    const abstract = data.evidence.filter(
      (e: { evidenceAvailability: string }) =>
        e.evidenceAvailability === "ABSTRACT",
    );
    for (const e of abstract) expect(e.pageNumber).toBeNull();

    const pub = await prisma.publication.findUniqueOrThrow({
      where: { id: smith.id },
    });
    expect(pub.fullTextStatus).toBe("AVAILABLE");
    expect(pub.evidenceExtractedAt).toBeInstanceOf(Date);
    expect(
      await prisma.evidence.count({ where: { publicationId: smith.id } }),
    ).toBe(data.created);
  });

  test("closed publication: abstract only, never fetched, limited scope", async () => {
    const calls = mockOpenAccess();
    const { token, lee } = await setup();
    const res = await api("POST", `/publications/${lee.id}/extract-evidence`, {
      token,
    });
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(calls).toEqual([]);
    expect(data.verificationScope).toBe("LIMITED");
    expect(data.fullText.status).toBe("NOT_OPEN_ACCESS");
    expect(data.warnings.join(" ")).toContain("Only the abstract is available");
    expect(data.evidence.length).toBeGreaterThan(0);
    for (const e of data.evidence) {
      expect(e.evidenceAvailability).toBe("ABSTRACT");
      expect(e.pageNumber).toBeNull();
      expect(LEE_ABSTRACT).toContain(e.sourceText); // verbatim, never rewritten
    }
    expect(
      types(data.evidence).has("ABSTRACT_FINDING") ||
        types(data.evidence).has("STATISTICAL_RESULT"),
    ).toBe(true);
  });

  test("access denied by the host falls back to the abstract", async () => {
    mockOpenAccess(smithFullText, 403);
    const { token, smith } = await setup();
    const res = await api(
      "POST",
      `/publications/${smith.id}/extract-evidence`,
      { token },
    );
    expect(res.status).toBe(200);
    expect(res.body.data.fullText.status).toBe("ACCESS_DENIED");
    expect(res.body.data.verificationScope).toBe("LIMITED");
    expect(res.body.data.warnings.join(" ")).toContain("Full text not used");
  });

  test("no abstract and no full text: 200 with scope NONE and nothing stored", async () => {
    mockOpenAccess();
    const { token, smith } = await setup({
      smith: { abstract: null, openAccess: false, openAccessUrl: null },
    });
    const res = await api(
      "POST",
      `/publications/${smith.id}/extract-evidence`,
      { token },
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      verificationScope: "NONE",
      created: 0,
      evidence: [],
    });
    expect(res.body.data.warnings.join(" ")).toContain(
      "No abstract or full text",
    );
  });

  test("re-running skips duplicates; replace re-extracts but keeps manual rows", async () => {
    mockOpenAccess();
    const { token, smith } = await setup();
    const first = await api(
      "POST",
      `/publications/${smith.id}/extract-evidence`,
      { token },
    );
    const again = await api(
      "POST",
      `/publications/${smith.id}/extract-evidence`,
      { token },
    );
    expect(again.body.data).toMatchObject({ created: 0, removed: 0 });
    expect(again.body.data.duplicatesSkipped).toBe(first.body.data.created);

    await prisma.evidence.create({
      data: {
        publicationId: smith.id,
        sourceText: "A manually curated passage.",
        evidenceAvailability: "ABSTRACT",
        extractionMethod: "MANUAL",
      },
    });
    const replaced = await api(
      "POST",
      `/publications/${smith.id}/extract-evidence`,
      {
        token,
        json: { replace: true },
      },
    );
    expect(replaced.body.data.removed).toBe(first.body.data.created);
    expect(replaced.body.data.created).toBe(first.body.data.created);
    expect(replaced.body.data.totalStored).toBe(first.body.data.created + 1);
  });

  test("fullText:false uses the abstract only", async () => {
    const calls = mockOpenAccess();
    const { token, smith } = await setup();
    const res = await api(
      "POST",
      `/publications/${smith.id}/extract-evidence`,
      {
        token,
        json: { fullText: false },
      },
    );
    expect(calls).toEqual([]);
    expect(res.body.data.verificationScope).toBe("LIMITED");
    expect(res.body.data.fullText.status).toBe("NOT_ATTEMPTED");
  });

  test("AI method: 501 without a provider; proposals must quote the source", async () => {
    const { token, smith } = await setup();
    const none = await api(
      "POST",
      `/publications/${smith.id}/extract-evidence`,
      {
        token,
        json: { method: "AI", fullText: false },
      },
    );
    expect(none.status).toBe(501);
    expect(none.body.error.code).toBe("AI_PROVIDER_NOT_CONFIGURED");
    expect(none.body.error.message).toContain("evidence extraction");

    const provider: EvidenceAiProvider = {
      name: "mock",
      extractEvidence: async ({ passages }) => [
        {
          passageId: passages[0]?.id,
          sentence:
            "Aerobic exercise reduced systolic blood pressure by 8.2 mmHg compared with usual care (95% CI 5.1 to 11.3; p < 0.001).",
          evidenceType: "STATISTICAL_RESULT",
          confidence: 0.9,
        },
        {
          passageId: passages[0]?.id,
          sentence: "Exercise cures hypertension.",
          evidenceType: "CONCLUSION",
        },
      ],
    };
    setEvidenceAiProvider(provider);
    const res = await api(
      "POST",
      `/publications/${smith.id}/extract-evidence`,
      {
        token,
        json: { method: "AI", fullText: false },
      },
    );
    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(1);
    expect(res.body.data.evidence[0]).toMatchObject({
      extractionMethod: "AI",
      evidenceType: "STATISTICAL_RESULT",
    });
  });

  test("access, validation and auth", async () => {
    const { smith } = await setup();
    const other = await registerUser();
    expect(
      (
        await api("POST", `/publications/${smith.id}/extract-evidence`, {
          token: other.token,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await api("GET", `/publications/${smith.id}/evidence`, {
          token: other.token,
        })
      ).status,
    ).toBe(404);
    expect(
      (await api("POST", `/publications/${smith.id}/extract-evidence`)).status,
    ).toBe(401);
    const bad = await api(
      "POST",
      `/publications/${smith.id}/extract-evidence`,
      {
        token: other.token,
        json: { method: "MAGIC" },
      },
    );
    expect(bad.status).toBe(400);
  });
});

describe("GET /api/publications/:id/evidence", () => {
  test("lists stored evidence in reading order with filters", async () => {
    mockOpenAccess();
    const { token, smith } = await setup();
    const empty = await api("GET", `/publications/${smith.id}/evidence`, {
      token,
    });
    expect(empty.body.data).toMatchObject({
      total: 0,
      verificationScope: "NONE",
    });

    await api("POST", `/publications/${smith.id}/extract-evidence`, { token });
    const all = await api("GET", `/publications/${smith.id}/evidence`, {
      token,
    });
    expect(all.status).toBe(200);
    expect(all.body.data.verificationScope).toBe("FULL");
    expect(all.body.data.publication.fullTextStatus).toBe("AVAILABLE");
    const positions = all.body.data.evidence.map(
      (e: { position: number }) => e.position,
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));

    const limits = await api(
      "GET",
      `/publications/${smith.id}/evidence?type=LIMITATION`,
      { token },
    );
    expect(limits.body.data.total).toBeGreaterThan(0);
    for (const e of limits.body.data.evidence)
      expect(e.evidenceType).toBe("LIMITATION");
    const abs = await api(
      "GET",
      `/publications/${smith.id}/evidence?availability=ABSTRACT`,
      { token },
    );
    for (const e of abs.body.data.evidence)
      expect(e.evidenceAvailability).toBe("ABSTRACT");
    expect(
      (
        await api("GET", `/publications/${smith.id}/evidence?type=VERDICT`, {
          token,
        })
      ).status,
    ).toBe(400);
  });
});

describe("POST /api/claims/:id/find-evidence and GET /api/claims/:id/evidence", () => {
  test("ranks the cited publication's passages by relevance and stores the links", async () => {
    mockOpenAccess();
    const { token, exercise, smith, lee } = await setup();
    expect(exercise.citationLinks.length).toBeGreaterThan(0);

    const res = await api("POST", `/claims/${exercise.id}/find-evidence`, {
      token,
    });
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.scope).toBe("CITED");
    // Only the cited (Smith) publication is searched — and it was extracted on demand.
    expect(data.publications.map((p: { id: string }) => p.id)).toEqual([
      smith.id,
    ]);
    expect(data.publications[0]).toMatchObject({
      verificationScope: "FULL",
      fullTextStatus: "AVAILABLE",
    });
    expect(data.note).toContain(
      "do not indicate whether the passage supports or contradicts",
    );

    expect(data.candidates.length).toBeGreaterThan(1);
    const ranks = data.candidates.map((c: { rank: number }) => c.rank);
    expect(ranks).toEqual(ranks.map((_: number, i: number) => i + 1));
    const scores = data.candidates.map(
      (c: { relevanceScore: number }) => c.relevanceScore,
    );
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    const top = data.candidates[0];
    expect(top.evidence.sourceText).toMatch(/systolic blood pressure/i);
    expect(top.publication.id).toBe(smith.id);
    expect(top.matchedTerms.length).toBeGreaterThan(0);
    for (const c of data.candidates) {
      expect(c.relevanceScore).toBeGreaterThanOrEqual(0.2);
      expect(c.relevanceScore).toBeLessThanOrEqual(1);
      expect(c).not.toHaveProperty("verdict");
      expect(c).not.toHaveProperty("supported");
    }

    // DB relations: many passages per claim, nothing about the uncited publication.
    const links = await prisma.claimEvidence.findMany({
      where: { claimId: exercise.id },
      include: { evidence: true },
    });
    expect(links).toHaveLength(data.candidates.length);
    for (const l of links) {
      expect(l.evidence.publicationId).toBe(smith.id);
      expect(l.method).toBe("LEXICAL");
      expect(JSON.parse(l.matchedTerms ?? "{}")).toHaveProperty("breakdown");
    }
    expect(
      await prisma.evidence.count({ where: { publicationId: lee.id } }),
    ).toBe(0);

    const stored = await api("GET", `/claims/${exercise.id}/evidence`, {
      token,
    });
    expect(stored.status).toBe(200);
    expect(stored.body.data.total).toBe(data.candidates.length);
    expect(
      stored.body.data.candidates.map(
        (c: { evidence: { id: string } }) => c.evidence.id,
      ),
    ).toEqual(
      data.candidates.map((c: { evidence: { id: string } }) => c.evidence.id),
    );

    // Re-running replaces the links (no duplicates) and re-uses the stored evidence.
    const evidenceBefore = await prisma.evidence.count({
      where: { publicationId: smith.id },
    });
    await api("POST", `/claims/${exercise.id}/find-evidence`, { token });
    expect(
      await prisma.claimEvidence.count({ where: { claimId: exercise.id } }),
    ).toBe(links.length);
    expect(
      await prisma.evidence.count({ where: { publicationId: smith.id } }),
    ).toBe(evidenceBefore);
  });

  test("scope DOCUMENT searches every matched publication; topK limits the list", async () => {
    mockOpenAccess();
    const { token, coffee, smith, lee } = await setup();
    const res = await api("POST", `/claims/${coffee.id}/find-evidence`, {
      token,
      json: { scope: "DOCUMENT", topK: 2 },
    });
    expect(res.status).toBe(200);
    expect(
      new Set(res.body.data.publications.map((p: { id: string }) => p.id)),
    ).toEqual(new Set([smith.id, lee.id]));
    expect(res.body.data.candidates.length).toBeLessThanOrEqual(2);
    expect(res.body.data.candidates[0].publication.id).toBe(lee.id);
  });

  test("a claim without linked publications returns an empty list with a reason", async () => {
    const { token, exercise } = await setup();
    await prisma.claimCitation.deleteMany({ where: { claimId: exercise.id } });
    const res = await api("POST", `/claims/${exercise.id}/find-evidence`, {
      token,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.candidates).toEqual([]);
    expect(res.body.data.reason).toContain("no linked citations");
  });

  test("extractMissing:false ranks only already-stored evidence", async () => {
    const calls = mockOpenAccess();
    const { token, exercise } = await setup();
    const res = await api("POST", `/claims/${exercise.id}/find-evidence`, {
      token,
      json: { extractMissing: false },
    });
    expect(calls).toEqual([]);
    expect(res.body.data.candidates).toEqual([]);
    expect(res.body.data.warnings.join(" ")).toContain(
      "no extractable evidence",
    );
  });

  test("cascade: deleting the claim or re-extracting removes links", async () => {
    mockOpenAccess();
    const { token, exercise, smith } = await setup();
    await api("POST", `/claims/${exercise.id}/find-evidence`, { token });
    expect(
      await prisma.claimEvidence.count({ where: { claimId: exercise.id } }),
    ).toBeGreaterThan(0);

    await api("POST", `/publications/${smith.id}/extract-evidence`, {
      token,
      json: { replace: true },
    });
    expect(
      await prisma.claimEvidence.count({ where: { claimId: exercise.id } }),
    ).toBe(0);

    await api("POST", `/claims/${exercise.id}/find-evidence`, { token });
    expect(
      (await api("DELETE", `/claims/${exercise.id}`, { token })).status,
    ).toBe(200);
    expect(
      await prisma.claimEvidence.count({ where: { claimId: exercise.id } }),
    ).toBe(0);
    expect(
      await prisma.evidence.count({ where: { publicationId: smith.id } }),
    ).toBeGreaterThan(0);
  });

  test("access and validation", async () => {
    const { exercise } = await setup();
    const other = await registerUser();
    expect(
      (
        await api("POST", `/claims/${exercise.id}/find-evidence`, {
          token: other.token,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await api("GET", `/claims/${exercise.id}/evidence`, {
          token: other.token,
        })
      ).status,
    ).toBe(404);
    expect((await api("GET", `/claims/${exercise.id}/evidence`)).status).toBe(
      401,
    );
    expect(
      (
        await api("POST", `/claims/${exercise.id}/find-evidence`, {
          token: other.token,
          json: { topK: 0 },
        })
      ).status,
    ).toBe(400);
  });
});
