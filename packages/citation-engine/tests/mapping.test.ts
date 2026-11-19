import { describe, expect, test } from "bun:test";
import { extractClaims } from "@citeverify/claim-extractor";
import { parseDocument } from "@citeverify/document-parser";
import { buildPdf, flowPage } from "@citeverify/document-parser/testing";
import { ClaimCitationStatus as L } from "@citeverify/shared";
import {
  analyzeCitations,
  citationMatchSchema,
  detectedCitationSchema,
  parsedReferenceSchema,
} from "../src/index.ts";
import { para } from "./helpers.ts";

// SYNTHETIC text throughout.

describe("claim ↔ citation mapping", () => {
  const bib = para(
    "[1] Doe A. One. Imag J. 2001;1:1.\n[2] Roe B. Two. Imag J. 2002;2:2.\n[3] Poe C. Three. Imag J. 2003;3:3.",
    "References",
  );

  test("links citations inside a claim sentence only — not every claim in the paragraph", () => {
    const p = para(
      "Insulin regulates glucose uptake [1]. Smoking causes lung cancer [2, 3].",
    );
    const claims = [
      {
        id: "c1",
        paragraphId: p.id,
        originalText: "Insulin regulates glucose uptake [1].",
      },
      {
        id: "c2",
        paragraphId: p.id,
        originalText: "Smoking causes lung cancer [2, 3].",
      },
    ];
    const { links, claimMappings } = analyzeCitations({
      documentId: "d",
      extraction: { paragraphs: [p, bib] },
      claims,
    });
    const byClaim = (id: string) => claimMappings.find((m) => m.claimId === id);
    expect(byClaim("c1")?.citations.map((c) => c.citationKey)).toEqual(["1"]);
    expect(byClaim("c2")?.citations.map((c) => c.citationKey)).toEqual([
      "2",
      "3",
    ]);
    expect(
      links.every((l) => l.status === L.LINKED && l.confidence === 0.9),
    ).toBe(true);
    expect(byClaim("c2")?.status).toBe("MAPPED");
    expect(byClaim("c2")?.referenceIds).toHaveLength(2);
  });

  test("a marker directly after the sentence is linked", () => {
    const p = para(
      "Exercise improves insulin sensitivity. [2] Other text follows here.",
    );
    const { links } = analyzeCitations({
      documentId: "d",
      extraction: { paragraphs: [p, bib] },
      claims: [
        {
          id: "c",
          paragraphId: p.id,
          originalText: "Exercise improves insulin sensitivity.",
        },
      ],
    });
    expect(links).toEqual([
      expect.objectContaining({
        claimId: "c",
        status: L.LINKED,
        confidence: 0.8,
      }),
    ]);
  });

  test("a narrative citation opening the next sentence is not attached to the previous claim", () => {
    const p = para(
      "Smoking causes lung cancer [1]. Roe and Poe (2003) described the cohort.",
    );
    const { links } = analyzeCitations({
      documentId: "d",
      extraction: { paragraphs: [p, bib] },
      claims: [
        {
          id: "c",
          paragraphId: p.id,
          originalText: "Smoking causes lung cancer [1].",
        },
      ],
    });
    expect(links.map((l) => l.citationId)).toHaveLength(1);
  });

  test("a citation in the next sentence is only proposed for review", () => {
    const p = para(
      "Exercise improves insulin sensitivity. This was confirmed in two trials [3].",
    );
    const { claimMappings } = analyzeCitations({
      documentId: "d",
      extraction: { paragraphs: [p, bib] },
      claims: [
        {
          id: "c",
          paragraphId: p.id,
          originalText: "Exercise improves insulin sensitivity.",
        },
      ],
    });
    expect(claimMappings[0]).toMatchObject({
      status: "NEEDS_REVIEW",
      citations: [
        { citationKey: "3", linkStatus: L.NEEDS_REVIEW, linkConfidence: 0.35 },
      ],
    });
  });

  test("claims with no nearby citation, or whose matches are uncertain, are reported as such", () => {
    const p = para(
      "Exercise improves insulin sensitivity. Nothing else here. Later work agreed [9].",
    );
    const { claimMappings } = analyzeCitations({
      documentId: "d",
      extraction: { paragraphs: [p, bib] },
      claims: [
        {
          id: "none",
          paragraphId: p.id,
          originalText: "Exercise improves insulin sensitivity.",
        },
        {
          id: "unmatched",
          paragraphId: null,
          originalText: "Later work agreed [9].",
        }, // located by text
      ],
    });
    expect(
      claimMappings.map((m) => [m.claimId, m.status, m.confidence]),
    ).toEqual([
      ["none", "NO_CITATION", 0],
      ["unmatched", "NEEDS_REVIEW", 0],
    ]);
    expect(claimMappings[1]?.citations[0]?.matchStatus).toBe("UNMATCHED");
  });

  test("bibliography text is never scanned for in-text citations", () => {
    const { citations } = analyzeCitations({
      documentId: "d",
      extraction: { paragraphs: [bib] },
    });
    expect(citations).toEqual([]);
  });
});

describe("end to end on parser + claim-extractor output", () => {
  test("a synthetic author-year paper", async () => {
    const extraction = await parseDocument(
      buildPdf([
        flowPage([
          { lines: ["1. Introduction"], size: 13 },
          {
            lines: [
              "Insulin regulates glucose uptake in skeletal muscle (Smith et al., 2020). Training",
              "was well tolerated (Lee & Park, 2019; Smith, 2021; Kim, 2015).",
            ],
          },
        ]),
        flowPage([
          { lines: ["References"], size: 13 },
          {
            lines: [
              "Lee, K., & Park, J. (2019). Tolerability of invented training. Example Press.",
              "Smith, J., Doe, A., & Roe, B. (2020). Insulin in fictional muscle. Journal of Made-up",
              "Physiology, 8, 100-110. doi:10.1234/jmp.2020.8",
              "Smith, J. (2021). A single-author synthetic note. Fiction Letters, 1, 1-2.",
              "Zhou, L. (2010). Never cited synthetic work. Imaginary Review, 2, 3-4.",
            ],
          },
        ]),
      ]),
    );
    const { claims } = await extractClaims({ documentId: "d", extraction });
    const result = analyzeCitations({ documentId: "d", extraction, claims });

    for (const c of result.citations)
      expect(() => detectedCitationSchema.parse(c)).not.toThrow();
    for (const r of result.references)
      expect(() => parsedReferenceSchema.parse(r)).not.toThrow();
    for (const m of result.matches)
      expect(() => citationMatchSchema.parse(m)).not.toThrow();

    expect(result.references.map((r) => r.authors[0])).toEqual([
      "Lee, K.",
      "Smith, J.",
      "Smith, J.",
      "Zhou, L.",
    ]);
    expect(result.references[1]).toMatchObject({
      doi: "10.1234/jmp.2020.8",
      pageNumber: 2,
      venue: "Journal of Made-up Physiology",
    });
    expect(result.matches.map((m) => m.status)).toEqual([
      "MATCHED",
      "MATCHED",
      "MATCHED",
      "UNMATCHED",
    ]);
    expect(result.citations[0]).toMatchObject({
      pageNumber: 1,
      section: "1. Introduction",
      citationText: "(Smith et al., 2020)",
    });
    expect(result.stats).toMatchObject({
      citations: 4,
      references: 4,
      matched: 3,
      unmatched: 1,
      uncitedReferences: 1,
    });

    const insulin = claims.find((c) => c.originalText.startsWith("Insulin"));
    const mapping = result.claimMappings.find((m) => m.claimId === insulin?.id);
    expect(mapping).toMatchObject({
      status: "MAPPED",
      referenceIds: [result.references[1]?.id],
    });
  });
});
