import { describe, expect, test } from "bun:test";
import { parseDocument } from "@citeverify/document-parser";
import { buildPdf, flowPage } from "@citeverify/document-parser/testing";
import { ClaimCategory as C, ClaimExtractionMethod } from "@citeverify/shared";
import {
  claimSchema,
  extractClaims,
  extractClaimsRuleBased,
  type SourceParagraph,
} from "../src/index.ts";

/** A SYNTHETIC two-page paper, parsed by the real document-parser. */
async function syntheticPaper() {
  const pdf = buildPdf([
    flowPage([
      { lines: ["1. Introduction"], size: 13 },
      {
        lines: [
          "Climate change is an important topic for many researchers. Insulin regulates glucose",
          "uptake in skeletal muscle [1].",
        ],
      },
      {
        lines: ["In this paper, we present a new framework for crop research."],
      },
      { lines: ["2. Results"], size: 13 },
      {
        lines: [
          "Treatment A significantly increased growth rate. Researchers observed a 15% improve-",
          "ment in production (p < 0.05).",
        ],
      },
    ]),
    flowPage([
      { lines: ["3. Discussion"], size: 13 },
      {
        lines: [
          "The results indicate a positive relationship between temperature and mortality.",
          "Treatment A significantly increased growth rate.",
        ],
      },
      { lines: ["Acknowledgements"], size: 13 },
      {
        lines: [
          "We thank the synthetic farm for providing access. Funding increased staff by 20%.",
        ],
      },
    ]),
  ]);
  return parseDocument(pdf);
}

describe("rule-based extraction from document-parser output", () => {
  test("finds claims, skips ordinary sentences, and produces schema-valid claims", async () => {
    const { claims, stats } = await extractClaims({
      documentId: "doc-1",
      extraction: await syntheticPaper(),
    });
    expect(claims.map((c) => [c.category, c.originalText])).toEqual([
      [
        C.SCIENTIFIC_FACT,
        "Insulin regulates glucose uptake in skeletal muscle [1].",
      ],
      [
        C.EXPERIMENTAL_FINDING,
        "Treatment A significantly increased growth rate.",
      ],
      [
        C.STATISTICAL_CLAIM,
        "Researchers observed a 15% improvement in production (p < 0.05).",
      ],
      [
        C.RESEARCH_CONCLUSION,
        "The results indicate a positive relationship between temperature and mortality.",
      ],
    ]);
    for (const claim of claims) {
      expect(() => claimSchema.parse(claim)).not.toThrow();
      expect(claim.extractionMethod).toBe(ClaimExtractionMethod.RULE_BASED);
      expect(claim.documentId).toBe("doc-1");
    }
    expect(stats.paragraphsSkipped).toBe(1); // Acknowledgements
  });

  test("preserves page, section, paragraph id, and the exact sentence", async () => {
    const extraction = await syntheticPaper();
    const { claims } = await extractClaims({ documentId: "doc-1", extraction });
    for (const claim of claims) {
      const paragraph = extraction.paragraphs.find(
        (p) => p.id === claim.paragraphId,
      );
      expect(paragraph).toBeDefined();
      expect(paragraph?.cleanedText).toContain(claim.originalText); // verbatim
      expect(claim.pageNumber).toBe(paragraph?.pageNumber ?? -1);
      expect(claim.section).toBe(paragraph?.section ?? "");
    }
    const conclusion = claims.find((c) => c.category === C.RESEARCH_CONCLUSION);
    expect(conclusion).toMatchObject({
      pageNumber: 2,
      section: "3. Discussion",
    });
    expect(claims.map((c) => c.position)).toEqual([0, 1, 2, 3]);
  });

  test("removes duplicate claims within a document (first occurrence wins)", async () => {
    const { claims, stats } = await extractClaims({
      documentId: "doc-1",
      extraction: await syntheticPaper(),
    });
    const growth = claims.filter(
      (c) =>
        c.originalText === "Treatment A significantly increased growth rate.",
    );
    expect(growth).toHaveLength(1);
    expect(growth[0]?.pageNumber).toBe(1);
    expect(stats.duplicatesRemoved).toBe(1);
  });

  test("never extracts from acknowledgement sections", async () => {
    const { claims } = await extractClaims({
      documentId: "doc-1",
      extraction: await syntheticPaper(),
    });
    expect(claims.some((c) => c.originalText.includes("Funding"))).toBe(false);
  });

  test("respects a custom confidence threshold", () => {
    const paragraphs: SourceParagraph[] = [
      {
        id: "p1",
        order: 0,
        cleanedText: "Group A had higher survival than group B.",
        pageNumber: null,
        section: null,
      },
    ];
    expect(extractClaimsRuleBased("d", paragraphs).claims).toHaveLength(1);
    expect(
      extractClaimsRuleBased("d", paragraphs, { minConfidence: 0.9 }).claims,
    ).toHaveLength(0);
  });
});
