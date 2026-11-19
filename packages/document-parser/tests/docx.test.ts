import { describe, expect, test } from "bun:test";
import { ExtractionStatus } from "@citeverify/shared";
import { extractionResultSchema, parseDocument } from "../src/index.ts";
import { buildDocx } from "./fixtures.ts";

const doc = () =>
  buildDocx(
    [
      { type: "title", text: "Synthetic Manuscript on Exercise Timing" },
      { type: "heading", level: 1, text: "Abstract" },
      {
        type: "paragraph",
        text: "This invented abstract reports α ≤ 0.05 and x² effects [1].",
      },
      { type: "heading", level: 1, text: "Methods" },
      { type: "heading", level: 2, text: "Participants" },
      {
        type: "paragraph",
        text: "Sixty fictional participants (μ = 34 years) were enrolled.",
      },
      { type: "paragraph", text: "   " },
      {
        type: "table",
        rows: [
          ["Group", "n", "Mean ± SD"],
          ["Walking", "30", "6.1 ± 1.2"],
          ["Control", "30", "5.4 ± 1.4"],
        ],
      },
      { type: "heading", level: 1, text: "Results" },
      {
        type: "paragraph",
        text: "Sleep scores differed (see doi:10.5555/synthetic-demo.0002) & more.",
      },
    ],
    {
      title: "Synthetic Manuscript on Exercise Timing",
      creator: "Doe, J.; Roe, A.",
      keywords: "synthetic; demo",
    },
  );

describe("DOCX extraction", () => {
  test("extracts metadata, title, abstract, and a schema-valid result", async () => {
    const r = await parseDocument(await doc());
    expect(() => extractionResultSchema.parse(r)).not.toThrow();
    expect(r).toMatchObject({
      format: "docx",
      status: ExtractionStatus.COMPLETED,
      title: "Synthetic Manuscript on Exercise Timing",
      titleSource: "metadata",
      authors: ["Doe, J.", "Roe, A."],
      abstract: "This invented abstract reports α ≤ 0.05 and x² effects [1].",
      totalPages: null,
    });
    expect(r.metadata).toMatchObject({
      keywords: "synthetic; demo",
      createdAt: "2026-01-15T10:00:00Z",
    });
  });

  test("preserves heading hierarchy and paragraph order, with null page numbers", async () => {
    const r = await parseDocument(await doc());
    expect(r.headings.map((h) => [h.text, h.level])).toEqual([
      ["Synthetic Manuscript on Exercise Timing", 1],
      ["Abstract", 1],
      ["Methods", 1],
      ["Participants", 2],
      ["Results", 1],
    ]);
    expect(r.paragraphs.map((p) => [p.section, p.cleanedText])).toEqual([
      [
        "Abstract",
        "This invented abstract reports α ≤ 0.05 and x² effects [1].",
      ],
      [
        "Participants",
        "Sixty fictional participants (μ = 34 years) were enrolled.",
      ],
      [
        "Results",
        "Sleep scores differed (see doi:10.5555/synthetic-demo.0002) & more.",
      ],
    ]);
    expect(
      [...r.paragraphs, ...r.headings, ...r.tables].every(
        (b) => b.pageNumber === null,
      ),
    ).toBe(true);
    expect(r.pages).toEqual([]);
  });

  test("extracts tables in position", async () => {
    const r = await parseDocument(await doc());
    expect(r.tables).toHaveLength(1);
    expect(r.tables[0]).toMatchObject({
      section: "Participants",
      rows: [
        ["Group", "n", "Mean ± SD"],
        ["Walking", "30", "6.1 ± 1.2"],
        ["Control", "30", "5.4 ± 1.4"],
      ],
    });
    const results = r.headings.find((h) => h.text === "Results");
    expect(r.tables[0]?.order).toBeLessThan(results?.order ?? 0);
  });

  test("drops empty paragraphs", async () => {
    const r = await parseDocument(await doc());
    expect(r.paragraphs.every((p) => p.cleanedText.trim().length > 0)).toBe(
      true,
    );
  });
});
