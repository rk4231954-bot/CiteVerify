import { describe, expect, test } from "bun:test";
import { ExtractionStatus } from "@citeverify/shared";
import { extractionResultSchema, parseDocument } from "../src/index.ts";
import { buildPdf, flowPage } from "./fixtures.ts";

const paper = () =>
  buildPdf(
    [
      flowPage([
        {
          lines: ["A Synthetic Study of Walking", "and Sleep Quality"],
          size: 18,
        },
        { lines: ["Abstract"] },
        {
          lines: [
            "This synthetic abstract reports a mod-",
            "est effect of daily walking on sleep [1].",
          ],
        },
        { lines: ["1. Introduction"], size: 13 },
        {
          lines: [
            "Self-",
            "reported sleep improved by 12 ± 3% in",
            "the fictional cohort (Doe et al., 2021).",
          ],
        },
        {
          lines: [
            "A second paragraph cites doi:10.5555/synthetic-",
            "demo.0001 for details.",
          ],
        },
        { lines: ["1"] }, // page-number footer
      ]),
      flowPage([
        { lines: ["2. Results"], size: 13 },
        { lines: ["Effect size was 0.4 × baseline (n = 120, r² = 0.31)."] },
        { lines: ["2"] },
      ]),
      flowPage([
        { lines: ["2.1 Subgroups"], size: 12 },
        { lines: ["No differences were found between subgroups."] },
      ]),
    ],
    {
      Title: "A Synthetic Study of Walking and Sleep Quality",
      Author: "Example, A.; Placeholder, B.",
    },
  );

describe("PDF extraction", () => {
  test("extracts metadata, abstract, and a schema-valid result", async () => {
    const r = await parseDocument(paper());
    expect(() => extractionResultSchema.parse(r)).not.toThrow();
    expect(r).toMatchObject({
      format: "pdf",
      status: ExtractionStatus.COMPLETED,
      title: "A Synthetic Study of Walking and Sleep Quality",
      titleSource: "metadata",
      authors: ["Example, A.", "Placeholder, B."],
      abstract:
        "This synthetic abstract reports a modest effect of daily walking on sleep [1].",
      totalPages: 3,
    });
    expect(r.metadata.producer).toBe("CiteVerify synthetic test fixture");
    expect(r.warnings).toEqual([]);
  });

  test("keeps page numbers across a multi-page document", async () => {
    const r = await parseDocument(paper());
    expect(r.pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
    expect(r.pages.every((p) => p.hasText)).toBe(true);
    const byText = (s: string) =>
      r.paragraphs.find((p) => p.cleanedText.includes(s));
    expect(byText("Self-reported")?.pageNumber).toBe(1);
    expect(byText("Effect size")?.pageNumber).toBe(2);
    expect(byText("subgroups")?.pageNumber).toBe(3);
  });

  test("splits paragraphs, keeps original lines, and tracks sections", async () => {
    const r = await parseDocument(paper());
    expect(r.paragraphs.map((p) => p.cleanedText)).toEqual([
      "This synthetic abstract reports a modest effect of daily walking on sleep [1].",
      "Self-reported sleep improved by 12 ± 3% in the fictional cohort (Doe et al., 2021).",
      "A second paragraph cites doi:10.5555/synthetic-demo.0001 for details.",
      "Effect size was 0.4 × baseline (n = 120, r² = 0.31).",
      "No differences were found between subgroups.",
    ]);
    const intro = r.paragraphs[1];
    expect(intro?.originalText).toBe(
      "Self-\nreported sleep improved by 12 ± 3% in\nthe fictional cohort (Doe et al., 2021).",
    );
    expect(intro?.section).toBe("1. Introduction");
    expect(r.paragraphs.map((p) => p.id)).toEqual([
      "p1",
      "p2",
      "p3",
      "p4",
      "p5",
    ]);
    // order is strictly increasing in reading order
    const orders = [...r.paragraphs, ...r.headings]
      .map((b) => b.order)
      .sort((a, b) => a - b);
    expect(new Set(orders).size).toBe(orders.length);
  });

  test("detects headings with numbering levels and drops page-number footers", async () => {
    const r = await parseDocument(paper());
    expect(r.headings.map((h) => [h.text, h.level, h.pageNumber])).toEqual([
      ["A Synthetic Study of Walking and Sleep Quality", 1, 1],
      ["Abstract", null, 1],
      ["1. Introduction", 1, 1],
      ["2. Results", 1, 2],
      ["2.1 Subgroups", 2, 3],
    ]);
    expect(r.paragraphs.some((p) => /^\d+$/.test(p.cleanedText))).toBe(false);
  });

  test("handles special characters (WinAnsi: ± × ² é °)", async () => {
    const r = await parseDocument(
      buildPdf([
        flowPage([{ lines: ["Café data: 37 °C, 12 ± 3, 2 × 10², naïve"] }]),
      ]),
    );
    expect(r.paragraphs[0]?.cleanedText).toBe(
      "Café data: 37 °C, 12 ± 3, 2 × 10², naïve",
    );
  });

  test("reports a page without text as PARTIAL with a warning", async () => {
    const r = await parseDocument(
      buildPdf([flowPage([{ lines: ["Only page one has text."] }]), []]),
    );
    expect(r.status).toBe(ExtractionStatus.PARTIAL);
    expect(r.pages[1]).toMatchObject({ pageNumber: 2, hasText: false });
    expect(r.warnings).toContain("Page 2 has no extractable text.");
  });
});
