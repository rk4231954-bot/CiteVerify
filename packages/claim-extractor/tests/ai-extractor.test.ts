import { describe, expect, test } from "bun:test";
import { ClaimExtractionMethod } from "@citeverify/shared";
import {
  type ClaimAiProvider,
  ClaimExtractionError,
  extractClaims,
  type SourceParagraph,
} from "../src/index.ts";

const paragraphs: SourceParagraph[] = [
  {
    id: "p1",
    order: 0,
    cleanedText: "Warming raised yields by 8%. Soil moisture fell sharply.",
    pageNumber: 3,
    section: "Results",
  },
  {
    id: "p2",
    order: 1,
    cleanedText: "We thank the reviewers.",
    pageNumber: 4,
    section: "Acknowledgements",
  },
];

/** A fake, offline provider — no external API is called in tests. */
const fakeProvider = (candidates: unknown[]): ClaimAiProvider => ({
  name: "fake-test-provider",
  extractClaims: async () => candidates as never,
});

describe("AI extraction interface", () => {
  test("requires a configured provider", async () => {
    const run = extractClaims(
      { documentId: "d", extraction: { paragraphs } },
      { method: "AI" },
    );
    await expect(run).rejects.toBeInstanceOf(ClaimExtractionError);
    await expect(run).rejects.toMatchObject({
      code: "AI_PROVIDER_NOT_CONFIGURED",
    });
  });

  test("accepts verbatim candidates and tags them as AI-extracted", async () => {
    const provider = fakeProvider([
      {
        paragraphId: "p1",
        sentence: "Soil moisture fell sharply.",
        category: "EXPERIMENTAL_FINDING",
        confidence: 0.7,
        rationale: "observed change",
      },
      {
        paragraphId: "p1",
        sentence: "Warming raised yields by 8%.",
        category: "NUMERICAL_CLAIM",
        characteristics: ["PERCENTAGE"],
        confidence: 0.9,
        rationale: "quantified effect",
      },
    ]);
    const { claims } = await extractClaims(
      { documentId: "d", extraction: { paragraphs } },
      { method: "AI", aiProvider: provider },
    );
    expect(claims.map((c) => [c.position, c.originalText])).toEqual([
      [0, "Warming raised yields by 8%."], // re-ordered into reading order
      [1, "Soil moisture fell sharply."],
    ]);
    expect(claims[0]).toMatchObject({
      extractionMethod: ClaimExtractionMethod.AI,
      pageNumber: 3,
      section: "Results",
      paragraphId: "p1",
      rationale: ['AI provider "fake-test-provider": quantified effect'],
    });
  });

  test("rejects invented text, unknown paragraphs, invalid shapes, and skipped sections", async () => {
    const provider = fakeProvider([
      {
        paragraphId: "p1",
        sentence: "Warming raised yields by 80%.",
        category: "NUMERICAL_CLAIM",
        confidence: 0.9,
        rationale: "altered value",
      },
      {
        paragraphId: "p9",
        sentence: "Anything.",
        category: "SCIENTIFIC_FACT",
        confidence: 0.5,
        rationale: "x",
      },
      {
        paragraphId: "p1",
        sentence: "Soil moisture fell sharply.",
        category: "NOT_A_CATEGORY",
        confidence: 0.5,
        rationale: "x",
      },
      {
        paragraphId: "p2",
        sentence: "We thank the reviewers.",
        category: "SCIENTIFIC_FACT",
        confidence: 0.5,
        rationale: "x",
      },
    ]);
    const { claims, warnings } = await extractClaims(
      { documentId: "d", extraction: { paragraphs } },
      { method: "AI", aiProvider: provider },
    );
    expect(claims).toEqual([]);
    expect(warnings).toEqual([
      "AI candidate #1 rejected: not a verbatim quote of paragraph p1",
      'AI candidate #2 rejected: unknown paragraph "p9"',
      "AI candidate #3 rejected: invalid shape",
      'AI candidate #4 rejected: unknown paragraph "p2"',
    ]);
  });

  test("wraps provider failures", async () => {
    const provider: ClaimAiProvider = {
      name: "broken",
      extractClaims: async () => {
        throw new Error("timeout");
      },
    };
    await expect(
      extractClaims(
        { documentId: "d", extraction: { paragraphs } },
        { method: "AI", aiProvider: provider },
      ),
    ).rejects.toMatchObject({ code: "AI_PROVIDER_ERROR" });
  });

  test("defaults to rule-based extraction without any provider", async () => {
    const { claims } = await extractClaims({
      documentId: "d",
      extraction: { paragraphs },
    });
    expect(
      claims.every(
        (c) => c.extractionMethod === ClaimExtractionMethod.RULE_BASED,
      ),
    ).toBe(true);
  });
});
