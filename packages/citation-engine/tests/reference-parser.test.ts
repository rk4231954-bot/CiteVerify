import { describe, expect, test } from "bun:test";
import { parseDocument } from "@citeverify/document-parser";
import {
  buildDocx,
  buildPdf,
  flowPage,
} from "@citeverify/document-parser/testing";
import {
  extractReferences,
  isBibliographyHeading,
  parseReferenceFields,
} from "../src/index.ts";
import { para } from "./helpers.ts";

// All bibliographic entries are SYNTHETIC; DOIs use the reserved 10.5555 / 10.1234 test prefixes.

describe("bibliography headings", () => {
  test.each([
    "References",
    "REFERENCES",
    "7. References",
    "Bibliography",
    "Works Cited",
    "Literature Cited",
    "References and Notes",
    "IV. References:",
  ])("recognises %p", (h) => expect(isBibliographyHeading(h)).toBe(true));
  test.each([
    "Reference values",
    "Introduction",
    "Further references to prior work",
  ])("ignores %p", (h) => expect(isBibliographyHeading(h)).toBe(false));
});

describe("reference field parsing", () => {
  test("APA / Harvard", () => {
    expect(
      parseReferenceFields(
        "Smith, J., Lee, K., & Park, M. (2020a). A fictional cohort of walkers. Synthetic Medicine, 4(2), 1–9. https://doi.org/10.5555/SM.2020.4",
      ),
    ).toEqual({
      authors: ["Smith, J.", "Lee, K.", "Park, M."],
      authorsTruncated: false,
      title: "A fictional cohort of walkers",
      year: 2020,
      yearSuffix: "a",
      venue: "Synthetic Medicine",
      doi: "10.5555/sm.2020.4",
      url: null,
    });
  });

  test("IEEE", () => {
    expect(
      parseReferenceFields(
        'J. Smith, A. Doe, and K. Lee, "Invented sensors for testing," IEEE Trans. Fictional Eng., vol. 3, pp. 1–5, 2021, doi: 10.1109/TFE.2021.12.',
      ),
    ).toMatchObject({
      authors: ["J. Smith", "A. Doe", "K. Lee"],
      title: "Invented sensors for testing",
      year: 2021,
      venue: "IEEE Trans. Fictional Eng",
      doi: "10.1109/tfe.2021.12",
    });
  });

  test("Vancouver", () => {
    expect(
      parseReferenceFields(
        "Smith J, Doe AB, et al. A synthetic trial of placebo tea. J Imag Res. 2018;12(4):100-110.",
      ),
    ).toMatchObject({
      authors: ["Smith J", "Doe AB"],
      authorsTruncated: true,
      title: "A synthetic trial of placebo tea",
      year: 2018,
      venue: "J Imag Res",
    });
  });

  test("Vancouver entry whose title contains 'and'", () => {
    expect(
      parseReferenceFields(
        "Kim H. Insulin and made-up muscle. Example Press; 2017.",
      ),
    ).toMatchObject({
      authors: ["Kim H"],
      title: "Insulin and made-up muscle",
      venue: "Example Press",
      year: 2017,
    });
    expect(
      parseReferenceFields(
        "J. Smith and K. Lee. A synthetic duet. Imag J. 2001;1:1.",
      ),
    ).toMatchObject({
      authors: ["J. Smith", "K. Lee"],
      title: "A synthetic duet",
    });
  });

  test("never invents missing fields; DOI digits are not mistaken for a year", () => {
    expect(
      parseReferenceFields("Unstructured synthetic note without details"),
    ).toEqual({
      authors: [],
      authorsTruncated: false,
      title: null,
      year: null,
      yearSuffix: null,
      venue: null,
      doi: null,
      url: null,
    });
    expect(
      parseReferenceFields(
        "Doe, A. (n.d.). Undated synthetic report. Retrieved from https://example.org/r.",
      ),
    ).toMatchObject({
      year: null,
      venue: null,
      url: "https://example.org/r",
      doi: null,
    });
    expect(
      parseReferenceFields("Anon. Synthetic leaflet. doi:10.5555/2019.77").year,
    ).toBeNull();
  });
});

describe("reference list extraction", () => {
  test("numbered list from a PDF, with wrapped lines and preserved raw text", async () => {
    const pdf = buildPdf([
      flowPage([
        { lines: ["Glucose rose [1, 2]."] },
        { lines: ["References"], size: 13 },
        {
          lines: [
            "[1] Smith J, Doe A. A synthetic glucose study. J Imag Res. 2019;3:1-5.",
            "[2] Lee K. Another invented paper about fictional muscle tissue and",
            "uptake. Fict Physiol. 2020;8:9-10. doi:10.5555/fp.2020.8",
            "[3] Kim H. Never cited. Imag Lett. 2017;1:1.",
          ],
        },
      ]),
    ]);
    const { paragraphs } = await parseDocument(pdf);
    const { references, style } = extractReferences("d", paragraphs);
    expect(style).toBe("NUMBERED");
    expect(references.map((r) => [r.label, r.year, r.doi])).toEqual([
      ["1", 2019, null],
      ["2", 2020, "10.5555/fp.2020.8"],
      ["3", 2017, null],
    ]);
    expect(references[1]?.rawText).toBe(
      "[2] Lee K. Another invented paper about fictional muscle tissue and uptake. Fict Physiol. 2020;8:9-10. doi:10.5555/fp.2020.8",
    );
    expect(references[1]).toMatchObject({
      pageNumber: 1,
      position: 1,
      title: "Another invented paper about fictional muscle tissue and uptake",
    });
  });

  test("author-year list from a DOCX (one paragraph per entry)", async () => {
    const docx = await buildDocx([
      { type: "heading", level: 1, text: "Introduction" },
      { type: "paragraph", text: "Glucose rose (Smith, 2020)." },
      { type: "heading", level: 1, text: "Works Cited" },
      {
        type: "paragraph",
        text: "Smith, J. (2020). Synthetic glucose. Fiction Journal, 1, 1-2.",
      },
      {
        type: "paragraph",
        text: "Zhou, L., & Lee, K. (2018). Imaginary insulin. Example Press.",
      },
    ]);
    const { paragraphs } = await parseDocument(docx);
    const { references } = extractReferences("d", paragraphs);
    expect(references.map((r) => [r.authors, r.year, r.pageNumber])).toEqual([
      [["Smith, J."], 2020, null],
      [["Zhou, L.", "Lee, K."], 2018, null],
    ]);
  });

  test("splits merged lines and finds an undetected heading line", () => {
    const paragraphs = [
      para("Body text [1]."),
      para(
        "Literature Cited\n[1] Doe A. First synthetic. Imag J. 2001;1:1. [2] Roe B. Second synthetic. Imag J. 2002;2:2.",
        "Discussion",
      ),
    ];
    const { references, bibliographyParagraphIds } = extractReferences(
      "d",
      paragraphs,
    );
    expect(references.map((r) => r.rawText)).toEqual([
      "[1] Doe A. First synthetic. Imag J. 2001;1:1.",
      "[2] Roe B. Second synthetic. Imag J. 2002;2:2.",
    ]);
    expect([...bibliographyParagraphIds]).toEqual([
      paragraphs[1]?.id ?? "missing",
    ]);
  });

  test("a wrapped line beginning with a number does not start a new entry", () => {
    const { references } = extractReferences("d", [
      para(
        "[1] Doe A. A synthetic report on rainfall in\n12. regions. Imag J. 2001;1:1.\n[2] Roe B. Second. Imag J. 2002;2:2.",
        "References",
      ),
    ]);
    expect(references.map((r) => r.label)).toEqual(["1", "2"]);
  });

  test("duplicate entries are kept once", () => {
    const { references, duplicatesRemoved } = extractReferences("d", [
      para(
        "Smith, J. (2020). Synthetic glucose. Fiction Journal, 1, 1-2.",
        "References",
      ),
      para(
        "Smith, J. (2020). Synthetic  glucose. Fiction journal, 1, 1-2.",
        "References",
      ),
    ]);
    expect(references).toHaveLength(1);
    expect(duplicatesRemoved).toBe(1);
  });

  test("no bibliography → no references", () => {
    expect(
      extractReferences("d", [para("Only body text (Smith, 2020).")])
        .references,
    ).toEqual([]);
  });
});
