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

// A SYNTHETIC paper. "Kim (2021)" is ambiguous (2021a/2021b) and "Garcia (2015)" has no entry.
const paperPdf = () =>
  buildPdf([
    flowPage([
      { lines: ["1. Introduction"], size: 13 },
      {
        lines: [
          "Insulin regulates glucose uptake in skeletal muscle (Smith et al., 2020). Smoking",
          "causes lung cancer (Kim, 2021).",
        ],
      },
      {
        lines: [
          "Group A had higher survival than group B (Garcia, 2015). Lee and Park (2019)",
          "described the cohort.",
        ],
      },
    ]),
    flowPage([
      { lines: ["References"], size: 13 },
      {
        lines: [
          "Kim, H. (2021a). First synthetic smoking study. Imaginary Oncology, 1, 1-2.",
          "Kim, H. (2021b). Second synthetic smoking study. Imaginary Oncology, 2, 3-4.",
          "Lee, K., & Park, J. (2019). A fictional cohort. Example Press.",
          "Smith, J., Doe, A., & Roe, B. (2020). Insulin in fictional muscle. Journal of Made-up",
          "Physiology, 8, 100-110. https://doi.org/10.1234/JMP.2020.8",
        ],
      },
    ]),
  ]);

async function preparedDocument(token: string, { claims = true } = {}) {
  const up = await api("POST", "/documents/upload", {
    token,
    form: fileForm(paperPdf(), "paper.pdf", PDF_MIME),
  });
  const id = up.body.data.id as string;
  expect(
    (await api("POST", `/documents/${id}/extract`, { token })).status,
  ).toBe(200);
  if (claims)
    expect(
      (await api("POST", `/documents/${id}/extract-claims`, { token })).status,
    ).toBe(201);
  return id;
}

describe("POST /api/documents/:id/detect-citations", () => {
  test("detects, matches, maps to claims and stores everything", async () => {
    const { token } = await registerUser();
    const id = await preparedDocument(token);

    const res = await api("POST", `/documents/${id}/detect-citations`, {
      token,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.stats).toMatchObject({
      citations: 4,
      references: 4,
      matched: 2,
      ambiguous: 1,
      unmatched: 1,
      needsReview: 0,
      uncitedReferences: 2, // Kim 2021a and 2021b are only ambiguously cited
    });

    const references = (
      await api("GET", `/documents/${id}/references`, { token })
    ).body.data.references;
    expect(references.map((r: { authors: string[] }) => r.authors[0])).toEqual([
      "Kim, H.",
      "Kim, H.",
      "Lee, K.",
      "Smith, J.",
    ]);
    expect(references[3]).toMatchObject({
      year: 2020,
      doi: "10.1234/jmp.2020.8",
      doiUrl: "https://doi.org/10.1234/jmp.2020.8",
      venue: "Journal of Made-up Physiology",
      pageNumber: 2,
      citationCount: 1,
    });
    expect(references[0]).toMatchObject({ yearSuffix: "a", citationCount: 0 });

    const citations = (
      await api("GET", `/documents/${id}/citations`, { token })
    ).body.data.citations;
    expect(
      citations.map((c: { citationText: string; matchStatus: string }) => [
        c.citationText,
        c.matchStatus,
      ]),
    ).toEqual([
      ["(Smith et al., 2020)", "MATCHED"],
      ["(Kim, 2021)", "AMBIGUOUS"],
      ["(Garcia, 2015)", "UNMATCHED"],
      ["Lee and Park (2019)", "MATCHED"],
    ]);
    const [smith, kim] = citations;
    expect(smith).toMatchObject({
      citationType: "AUTHOR_YEAR",
      pageNumber: 1,
      section: "1. Introduction",
      referenceId: references[3].id,
    });
    expect(smith.reference.doi).toBe("10.1234/jmp.2020.8");
    expect(kim.referenceId).toBeNull(); // uncertain matches are never assigned

    // Claims link only to the citation in their own sentence.
    const mappings = res.body.data.claimMappings as {
      claimId: string;
      status: string;
      citations: { citationKey: string }[];
    }[];
    const claimRows = await prisma.extractedClaim.findMany({
      where: { documentId: id },
      select: { id: true, originalText: true },
    });
    const mappingFor = (start: string) =>
      mappings.find(
        (m) =>
          m.claimId ===
          claimRows.find((c) => c.originalText.startsWith(start))?.id,
      );
    expect(mappingFor("Insulin")).toMatchObject({
      status: "MAPPED",
      citations: [{ citationKey: "Smith et al., 2020" }],
    });
    expect(mappingFor("Smoking")).toMatchObject({
      status: "NEEDS_REVIEW",
      citations: [{ citationKey: "Kim, 2021" }],
    });
    expect(mappingFor("Group A")).toMatchObject({
      status: "NEEDS_REVIEW",
      citations: [{ citationKey: "Garcia, 2015" }],
    });

    // The claim endpoint shows the same links.
    const insulinId = claimRows.find((c) =>
      c.originalText.startsWith("Insulin"),
    )?.id;
    const claim = (await api("GET", `/claims/${insulinId}`, { token })).body
      .data.claim;
    expect(claim.citations).toEqual([
      expect.objectContaining({
        citationText: "(Smith et al., 2020)",
        linkStatus: "LINKED",
        matchStatus: "MATCHED",
      }),
    ]);
  });

  test("re-running replaces the previous output without duplicates", async () => {
    const { token } = await registerUser();
    const id = await preparedDocument(token);
    await api("POST", `/documents/${id}/detect-citations`, { token });
    const again = await api("POST", `/documents/${id}/detect-citations`, {
      token,
    });
    expect(again.body.data.replaced).toEqual({ citations: 4, references: 4 });
    expect(await prisma.citation.count({ where: { documentId: id } })).toBe(4);
    expect(await prisma.reference.count({ where: { documentId: id } })).toBe(4);
    expect(
      await prisma.claimCitation.count({
        where: { claim: { documentId: id } },
      }),
    ).toBe(3);
  });

  test("works before claims exist (no links), and maps once re-run after claim extraction", async () => {
    const { token } = await registerUser();
    const id = await preparedDocument(token, { claims: false });
    const first = await api("POST", `/documents/${id}/detect-citations`, {
      token,
    });
    expect(first.body.data.stats).toMatchObject({
      citations: 4,
      claimLinks: 0,
    });
    await api("POST", `/documents/${id}/extract-claims`, { token });
    const second = await api("POST", `/documents/${id}/detect-citations`, {
      token,
    });
    expect(second.body.data.stats.claimLinks).toBe(3);
  });

  test("leaves manually entered citations and references alone", async () => {
    const { token } = await registerUser();
    const id = await preparedDocument(token);
    const manualRef = await prisma.reference.create({
      data: { documentId: id, rawText: "Manual synthetic reference" },
    });
    await prisma.citation.create({
      data: {
        documentId: id,
        citationText: "[*]",
        citationType: "OTHER",
        referenceId: manualRef.id,
      },
    });
    await api("POST", `/documents/${id}/detect-citations`, { token });
    await api("POST", `/documents/${id}/detect-citations`, { token });
    expect(
      await prisma.citation.count({
        where: { documentId: id, paragraphId: null },
      }),
    ).toBe(1);
    expect(
      await prisma.reference.count({
        where: { documentId: id, position: null },
      }),
    ).toBe(1);
  });

  test("requires a usable extraction, auth and ownership", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const up = await api("POST", "/documents/upload", {
      token: owner.token,
      form: fileForm(paperPdf(), "p.pdf", PDF_MIME),
    });
    const id = up.body.data.id as string;
    expect(
      (
        await api("POST", `/documents/${id}/detect-citations`, {
          token: owner.token,
        })
      ).status,
    ).toBe(409);
    expect(
      (await api("POST", `/documents/${id}/detect-citations`)).status,
    ).toBe(401);
    expect(
      (
        await api("POST", `/documents/${id}/detect-citations`, {
          token: other.token,
        })
      ).status,
    ).toBe(404);
    expect(
      (await api("GET", `/documents/${id}/citations`, { token: other.token }))
        .status,
    ).toBe(404);
    expect(
      (await api("GET", `/documents/${id}/references`, { token: other.token }))
        .status,
    ).toBe(404);
  });
});

describe("citation retrieval", () => {
  test("GET /citations/:id and /matches expose uncertain candidates", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const id = await preparedDocument(owner.token);
    await api("POST", `/documents/${id}/detect-citations`, {
      token: owner.token,
    });
    const citations = (
      await api("GET", `/documents/${id}/citations?status=AMBIGUOUS`, {
        token: owner.token,
      })
    ).body.data.citations;
    expect(citations).toHaveLength(1);
    const kimId = citations[0].id as string;

    const one = await api("GET", `/citations/${kimId}`, { token: owner.token });
    expect(one.body.data.citation).toMatchObject({
      id: kimId,
      citationKey: "Kim, 2021",
      matchStatus: "AMBIGUOUS",
    });

    const matches = (
      await api("GET", `/citations/${kimId}/matches`, { token: owner.token })
    ).body.data;
    expect(matches).toMatchObject({ status: "AMBIGUOUS", referenceId: null });
    expect(
      matches.candidates
        .map((c: { reference: { yearSuffix: string }; chosen: boolean }) => [
          c.reference.yearSuffix,
          c.chosen,
        ])
        .sort(),
    ).toEqual([
      ["a", false],
      ["b", false],
    ]);
    expect(matches.candidates[0].reasons.join(" ")).toContain("suffix");

    expect(
      (await api("GET", `/citations/${kimId}`, { token: other.token })).status,
    ).toBe(404);
    expect(
      (await api("GET", `/citations/${kimId}/matches`, { token: other.token }))
        .status,
    ).toBe(404);
    expect((await api("GET", `/citations/${kimId}`)).status).toBe(401);
    expect(
      (
        await api("GET", `/documents/${id}/citations?status=MAYBE`, {
          token: owner.token,
        })
      ).status,
    ).toBe(400);
  });

  test("everything is removed with the document; deleting a claim keeps its citations", async () => {
    const { token } = await registerUser();
    const id = await preparedDocument(token);
    await api("POST", `/documents/${id}/detect-citations`, { token });
    const claim = await prisma.extractedClaim.findFirst({
      where: { documentId: id, citationLinks: { some: {} } },
    });
    await api("DELETE", `/claims/${claim?.id}`, { token });
    expect(await prisma.citation.count({ where: { documentId: id } })).toBe(4);
    expect(
      await prisma.claimCitation.count({ where: { claimId: claim?.id } }),
    ).toBe(0);

    await api("DELETE", `/documents/${id}`, { token });
    expect(await prisma.citation.count({ where: { documentId: id } })).toBe(0);
    expect(await prisma.reference.count({ where: { documentId: id } })).toBe(0);
  });
});
