import { afterEach, describe, expect, test } from "bun:test";
import { prisma } from "@citeverify/database";
import { buildPdf, flowPage } from "@citeverify/document-parser/testing";
import { fetchOpenAccessFullText } from "@citeverify/evidence-extractor";
import type { VerificationAiProvider } from "@citeverify/verification-engine";
import { setVerificationAiProvider } from "../src/services/ai-provider.ts";
import { setFullTextSource } from "../src/services/evidence-providers.ts";
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
        "Daytime napping significantly improves memory consolidation in older adults.",
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

const OA_URL = "https://repo.example.org/smith-2020.pdf";
const SMITH_ABSTRACT =
  "Methods: We conducted a randomised controlled trial of 240 adults aged 65 years or older. Results: Aerobic exercise reduced systolic blood pressure by 8.2 mmHg compared with usual care (95% CI 5.1 to 11.3; p < 0.001).";
const LEE_ABSTRACT =
  "We followed 1,200 adults for two years. Coffee consumption was not associated with sleep quality after adjustment for age (p = 0.41).";
const RESULT_SENTENCE =
  "Systolic blood pressure decreased by 8.2 mmHg in the aerobic exercise group compared with usual care (95% CI 5.1 to 11.3; p < 0.001).";

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
        "Systolic blood pressure decreased by 8.2 mmHg in the aerobic exercise group compared",
        "with usual care (95% CI 5.1 to 11.3; p < 0.001).",
      ],
    },
  ]),
]);

function mockOpenAccess() {
  setFullTextSource((request) =>
    fetchOpenAccessFullText(request, {
      fetch: async (input) =>
        String(input) === OA_URL
          ? new Response(smithFullText, {
              headers: { "content-type": "application/pdf" },
            })
          : new Response("not found", { status: 404 }),
    }),
  );
}

afterEach(() => {
  setFullTextSource(null);
  setVerificationAiProvider(null);
});

let counter = 0;
type PubData = Parameters<typeof prisma.publication.create>[0]["data"];

async function setup(
  options: { smith?: Partial<PubData>; lee?: Partial<PubData> } = {},
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
      doi: `10.5555/verify.smith.${Date.now()}.${n}`,
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
      retrievalStatus: "RETRIEVED",
      ...options.lee,
    },
  });
  for (const ref of await prisma.reference.findMany({ where: { documentId } }))
    await prisma.reference.update({
      where: { id: ref.id },
      data: {
        publicationId: ref.rawText.startsWith("Smith") ? smith.id : lee.id,
        publicationMatchStatus: "MATCHED",
        publicationMatchConfidence: 0.99,
      },
    });
  const claims = await prisma.extractedClaim.findMany({
    where: { documentId },
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
    claims,
    exercise: claim("exercise"),
    coffee: claim("Coffee"),
  };
}

const resultFor = (results: { claimId: string }[], claimId: string) =>
  // biome-ignore lint/suspicious/noExplicitAny: response shape is asserted by the tests
  results.find((r) => r.claimId === claimId) as any;

describe("POST /api/documents/:id/verify", () => {
  test("verifies every claim, stores explainable results and evidence snapshots", async () => {
    mockOpenAccess();
    const { token, documentId, exercise, coffee, smith, lee, claims } =
      await setup();

    const res = await api("POST", `/documents/${documentId}/verify`, { token });
    expect(res.status).toBe(201);
    const data = res.body.data;
    expect(data.job).toMatchObject({
      status: "COMPLETED",
      method: "RULE_BASED",
      totalClaims: claims.length,
      processedClaims: claims.length,
    });
    expect(data.assessmentType).toBe("AUTOMATED");
    expect(data.disclaimer).toContain("not a confirmed scientific fact");
    expect(data.results).toHaveLength(claims.length);
    expect(data.summary.claims).toBe(claims.length);

    // Cited full text (open access) agrees → SUPPORTED, quoted verbatim with its source.
    const supported = resultFor(data.results, exercise.id);
    expect(supported.verdict).toBe("SUPPORTED");
    expect(supported.confidence).toBeGreaterThanOrEqual(50);
    expect(supported.confidence).toBeLessThanOrEqual(90);
    expect(supported.evidenceSource).not.toBe("ABSTRACT");
    expect(supported.verificationScope).toBe("FULL");
    const quoted = supported.supportingEvidence.find(
      (e: { sourceText: string }) => e.sourceText === RESULT_SENTENCE,
    );
    expect(quoted).toMatchObject({
      evidenceAvailability: "FULL_TEXT",
      section: "Results",
      pageNumber: 1,
      sourceUrl: OA_URL,
      role: "SUPPORTING",
    });
    expect(supported.publications[0]).toMatchObject({
      id: smith.id,
      contribution: "SUPPORTING",
    });
    expect(supported.explanation).toBeString();

    // Abstract-only source reporting no association → CONTRADICTED, limited, review.
    const contradicted = resultFor(data.results, coffee.id);
    expect(contradicted.verdict).toBe("CONTRADICTED");
    expect(contradicted.evidenceSource).toBe("ABSTRACT");
    expect(contradicted.verificationScope).toBe("LIMITED");
    expect(contradicted.confidence).toBeLessThanOrEqual(60);
    expect(contradicted.humanReview.recommended).toBe(true);
    expect(contradicted.contradictingEvidence[0].sourceText).toBe(
      "Coffee consumption was not associated with sleep quality after adjustment for age (p = 0.41).",
    );
    expect(contradicted.contradictingEvidence[0].pageNumber).toBeNull();
    expect(contradicted.limitations.join(" ")).toContain(
      "only the abstract was available",
    );

    // An uncited claim cannot be checked against a source.
    const uncited = data.results.find(
      (r: { claim: { originalText: string } }) =>
        r.claim.originalText.startsWith("Daytime napping"),
    );
    expect(uncited).toBeDefined();
    expect(uncited).toMatchObject({
      verdict: "NEEDS_HUMAN_REVIEW",
      reasonCode: "NO_CITATION",
    });

    // DB: verdict, 0..1 confidence, explanation, evidence associations.
    const row = await prisma.verificationResult.findFirstOrThrow({
      where: { claimId: exercise.id },
      include: { evidence: true },
    });
    expect(row.confidence).toBeCloseTo(supported.confidence / 100, 2);
    expect(row.reasonCode).toBe("SUPPORTING_EVIDENCE");
    expect(row.evidence.length).toBeGreaterThan(0);
    for (const e of row.evidence) expect(e.evidenceId).toBeString();
    expect(
      await prisma.evidence.count({ where: { publicationId: lee.id } }),
    ).toBeGreaterThan(0);
  });

  test("missing evidence → NEEDS_HUMAN_REVIEW; off-topic source → MISLEADING_CITATION", async () => {
    const { token, documentId, exercise, coffee } = await setup({
      smith: { abstract: null, openAccess: false, openAccessUrl: null },
      lee: {
        title: "Soil nitrogen dynamics in a fictional wheat field",
        abstract:
          "Nitrogen fertiliser increased wheat grain yield by 12% across three fictional growing seasons (p < 0.01).",
      },
    });
    const res = await api("POST", `/documents/${documentId}/verify`, { token });
    expect(res.status).toBe(201);
    expect(resultFor(res.body.data.results, exercise.id)).toMatchObject({
      verdict: "NEEDS_HUMAN_REVIEW",
      reasonCode: "NO_EVIDENCE",
      confidence: 0,
      evidenceSource: "NONE",
    });
    const misleading = resultFor(res.body.data.results, coffee.id);
    expect(misleading.verdict).toBe("MISLEADING_CITATION");
    expect(misleading.humanReview.recommended).toBe(true);
    expect(misleading.supportingEvidence).toEqual([]);
  });

  test("claimIds limits the run; unknown ids are rejected", async () => {
    mockOpenAccess();
    const { token, documentId, exercise } = await setup();
    const res = await api("POST", `/documents/${documentId}/verify`, {
      token,
      json: { claimIds: [exercise.id] },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.results).toHaveLength(1);
    const bad = await api("POST", `/documents/${documentId}/verify`, {
      token,
      json: { claimIds: ["nope"] },
    });
    expect(bad.status).toBe(400);
  });

  test("a document without claims → 409; a running job → 409; an abandoned one is closed", async () => {
    const { token } = await registerUser();
    const up = await api("POST", "/documents/upload", {
      token,
      form: fileForm(citingPaper, "paper.pdf", PDF_MIME),
    });
    const res = await api("POST", `/documents/${up.body.data.id}/verify`, {
      token,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain("extract-claims");

    mockOpenAccess();
    const s = await setup();
    const running = await prisma.verificationJob.create({
      data: {
        documentId: s.documentId,
        status: "RUNNING",
        startedAt: new Date(),
      },
    });
    expect(
      (
        await api("POST", `/documents/${s.documentId}/verify`, {
          token: s.token,
        })
      ).status,
    ).toBe(409);
    await prisma.verificationJob.update({
      where: { id: running.id },
      data: { startedAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    expect(
      (
        await api("POST", `/documents/${s.documentId}/verify`, {
          token: s.token,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await prisma.verificationJob.findUniqueOrThrow({
          where: { id: running.id },
        })
      ).status,
    ).toBe("FAILED");
  });

  test("AI method: 501 without a provider (no job recorded); a provider is cross-checked", async () => {
    mockOpenAccess();
    const { token, documentId, exercise } = await setup();
    const none = await api("POST", `/documents/${documentId}/verify`, {
      token,
      json: { method: "AI" },
    });
    expect(none.status).toBe(501);
    expect(none.body.error.message).toContain("verification");
    expect(await prisma.verificationJob.count({ where: { documentId } })).toBe(
      0,
    );

    const provider: VerificationAiProvider = {
      name: "mock",
      assessEvidence: async ({ passages }) => [
        ...passages.map((p) => ({
          evidenceId: p.evidenceId,
          stance: "AGREES",
          rationale: "mock",
        })),
        { evidenceId: "invented", stance: "AGREES" },
      ],
    };
    setVerificationAiProvider(provider);
    const res = await api("POST", `/documents/${documentId}/verify`, {
      token,
      json: { method: "AI", claimIds: [exercise.id] },
    });
    expect(res.status).toBe(201);
    const r = res.body.data.results[0];
    expect(r.method).toBe("AI");
    expect(r.strategy).toBe("ai:mock");
    const ids = [
      ...r.supportingEvidence,
      ...r.contradictingEvidence,
      ...r.contextEvidence,
    ].map((e: { evidenceId: string }) => e.evidenceId);
    expect(ids).not.toContain("invented");
  });

  test("access, auth and validation", async () => {
    const { documentId } = await setup();
    const other = await registerUser();
    expect(
      (
        await api("POST", `/documents/${documentId}/verify`, {
          token: other.token,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await api("GET", `/documents/${documentId}/verification`, {
          token: other.token,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await api("GET", `/documents/${documentId}/verification/status`, {
          token: other.token,
        })
      ).status,
    ).toBe(404);
    expect((await api("POST", `/documents/${documentId}/verify`)).status).toBe(
      401,
    );
    expect(
      (
        await api("POST", `/documents/${documentId}/verify`, {
          token: other.token,
          json: { method: "MAGIC" },
        })
      ).status,
    ).toBe(400);
  });
});

describe("GET verification results, status and claim details", () => {
  test("before and after a run, with filters and history", async () => {
    mockOpenAccess();
    const { token, documentId, exercise, coffee } = await setup();

    const before = await api("GET", `/documents/${documentId}/verification`, {
      token,
    });
    expect(before.status).toBe(200);
    expect(before.body.data).toMatchObject({ job: null, results: [] });
    expect(before.body.data.reason).toContain("not been verified");
    const statusBefore = await api(
      "GET",
      `/documents/${documentId}/verification/status`,
      { token },
    );
    expect(statusBefore.body.data).toMatchObject({
      verified: false,
      latestJob: null,
    });
    const claimBefore = await api(
      "GET",
      `/claims/${exercise.id}/verification`,
      { token },
    );
    expect(claimBefore.body.data).toMatchObject({
      verified: false,
      result: null,
      history: [],
    });

    const first = await api("POST", `/documents/${documentId}/verify`, {
      token,
    });
    const second = await api("POST", `/documents/${documentId}/verify`, {
      token,
    });
    expect(second.body.data.job.id).not.toBe(first.body.data.job.id);

    const status = await api(
      "GET",
      `/documents/${documentId}/verification/status`,
      { token },
    );
    expect(status.body.data).toMatchObject({
      verified: true,
      latestCompletedJobId: second.body.data.job.id,
      latestJob: { status: "COMPLETED", stale: false },
    });

    const latest = await api("GET", `/documents/${documentId}/verification`, {
      token,
    });
    expect(latest.body.data.job.id).toBe(second.body.data.job.id);
    expect(latest.body.data.summary.byVerdict.SUPPORTED).toBeGreaterThanOrEqual(
      1,
    );
    const contradicted = await api(
      "GET",
      `/documents/${documentId}/verification?verdict=CONTRADICTED`,
      { token },
    );
    expect(
      contradicted.body.data.results.map((r: { claimId: string }) => r.claimId),
    ).toEqual([coffee.id]);
    const reviewed = await api(
      "GET",
      `/documents/${documentId}/verification?humanReview=true`,
      { token },
    );
    for (const r of reviewed.body.data.results)
      expect(r.humanReview.recommended).toBe(true);
    const older = await api(
      "GET",
      `/documents/${documentId}/verification?jobId=${first.body.data.job.id}`,
      {
        token,
      },
    );
    expect(older.body.data.job.id).toBe(first.body.data.job.id);
    expect(
      (
        await api("GET", `/documents/${documentId}/verification?jobId=nope`, {
          token,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await api("GET", `/documents/${documentId}/verification?verdict=TRUE`, {
          token,
        })
      ).status,
    ).toBe(400);

    const detail = await api("GET", `/claims/${exercise.id}/verification`, {
      token,
    });
    expect(detail.status).toBe(200);
    expect(detail.body.data.result).toMatchObject({
      verdict: "SUPPORTED",
      jobId: second.body.data.job.id,
    });
    expect(detail.body.data.history).toHaveLength(2);
    expect(detail.body.data.disclaimer).toBeString();
  });

  test("results keep their evidence text after the evidence is re-extracted", async () => {
    mockOpenAccess();
    const { token, documentId, exercise, smith } = await setup();
    await api("POST", `/documents/${documentId}/verify`, { token });
    await api("POST", `/publications/${smith.id}/extract-evidence`, {
      token,
      json: { replace: true },
    });
    const detail = await api("GET", `/claims/${exercise.id}/verification`, {
      token,
    });
    const kept = detail.body.data.result.supportingEvidence;
    expect(kept.length).toBeGreaterThan(0);
    for (const e of kept) {
      expect(e.evidenceId).toBeNull(); // the old Evidence row is gone…
      expect(e.sourceText.length).toBeGreaterThan(0); // …the quoted text is not
    }
  });

  test("claim details: access and cascade on claim deletion", async () => {
    mockOpenAccess();
    const { token, documentId, exercise } = await setup();
    await api("POST", `/documents/${documentId}/verify`, { token });
    const other = await registerUser();
    expect(
      (
        await api("GET", `/claims/${exercise.id}/verification`, {
          token: other.token,
        })
      ).status,
    ).toBe(404);
    expect(
      (await api("GET", `/claims/${exercise.id}/verification`)).status,
    ).toBe(401);
    await api("DELETE", `/claims/${exercise.id}`, { token });
    expect(
      await prisma.verificationResult.count({
        where: { claimId: exercise.id },
      }),
    ).toBe(0);
  });
});
