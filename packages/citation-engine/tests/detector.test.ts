import { describe, expect, test } from "bun:test";
import {
  detectAuthorYearCitations,
  detectCitations,
  detectNumericCitations,
} from "../src/index.ts";
import { para } from "./helpers.ts";

// All text is SYNTHETIC.
const keys = (text: string) =>
  [...detectNumericCitations(text), ...detectAuthorYearCitations(text)]
    .sort((a, b) => a.start - b.start)
    .map((m) => [m.text, m.targets.map((t) => t.key)]);

describe("numeric citations", () => {
  test.each([
    ["Sleep improved [1].", "[1]", ["1"]],
    ["Sleep improved [1, 2].", "[1, 2]", ["1", "2"]],
    ["Sleep improved [1–3].", "[1–3]", ["1", "2", "3"]],
    ["Sleep improved [1, 3, 5].", "[1, 3, 5]", ["1", "3", "5"]],
    ["Sleep improved [2,4-6].", "[2,4-6]", ["2", "4", "5", "6"]],
  ])("%p", (text, marker, expected) => {
    expect(keys(text)).toEqual([[marker, expected]]);
  });

  test.each([
    "The value lies in the interval [1, 10].",
    "Let x ∈ [1, 10] be given.",
    "The matrix element a[2] equals a[3][1].",
    "Collected in [2020] by volunteers.",
    "Probabilities in [0.5, 1] were kept.",
    "An invalid range [5–2] or [0].",
  ])("ignores non-citation brackets: %p", (text) => {
    expect(detectNumericCitations(text)).toEqual([]);
  });
});

describe("author-year citations", () => {
  test.each([
    ["Glucose rose (Smith, 2023).", "(Smith, 2023)", ["Smith, 2023"]],
    [
      "Glucose rose (Smith et al., 2023).",
      "(Smith et al., 2023)",
      ["Smith et al., 2023"],
    ],
    [
      "Glucose rose (Smith & Johnson, 2022).",
      "(Smith & Johnson, 2022)",
      ["Smith & Johnson, 2022"],
    ],
    [
      "Smith et al. (2023) reported a rise.",
      "Smith et al. (2023)",
      ["Smith et al., 2023"],
    ],
    [
      "Smith and Johnson (2022) agreed.",
      "Smith and Johnson (2022)",
      ["Smith & Johnson, 2022"],
    ],
    [
      "As shown (see Smith, 2020, p. 4).",
      "(see Smith, 2020, p. 4)",
      ["Smith, 2020"],
    ],
    [
      "Twice (Smith, 2020a, b).",
      "(Smith, 2020a, b)",
      ["Smith, 2020a", "Smith, 2020b"],
    ],
    ["Undated (Doe, n.d.).", "(Doe, n.d.)", ["Doe, n.d."]],
    [
      "As van der Berg (2019) noted.",
      "van der Berg (2019)",
      ["van der Berg, 2019"],
    ],
    [
      "Accents (Müller & Østergaard, 2018).",
      "(Müller & Østergaard, 2018)",
      ["Müller & Østergaard, 2018"],
    ],
  ])("%p", (text, marker, expected) => {
    expect(keys(text)).toEqual([[marker, expected]]);
  });

  test.each([
    "Data were collected in 2019 (2019).",
    "The sample was large (n = 2020).",
    "As listed (Table 2, 2020).",
    "Recruitment began (January 2020).",
    "The agency WHO (2020) published guidance.",
    "See Figure (2021) for details.",
    "Mean scores were high (M = 2.4, SD = 0.3).",
  ])("ignores years, counts and statistics: %p", (text) => {
    expect(detectAuthorYearCitations(text)).toEqual([]);
  });
});

describe("multiple citations in one sentence", () => {
  test("mixes markers and preserves the original text of each", () => {
    expect(
      keys(
        "Rates fell [2] and rose (Lee et al., 2021; Kim & Cho, 2019), as Park (2018) showed [4, 5].",
      ),
    ).toEqual([
      ["[2]", ["2"]],
      [
        "(Lee et al., 2021; Kim & Cho, 2019)",
        ["Lee et al., 2021", "Kim & Cho, 2019"],
      ],
      ["Park (2018)", ["Park, 2018"]],
      ["[4, 5]", ["4", "5"]],
    ]);
  });

  test("records paragraph, page, section and exact offsets", () => {
    const p = para("Rates fell [2] in cohort B (Lee, 2021).", "2. Results", 3);
    const { citations } = detectCitations("doc", [p]);
    expect(citations).toHaveLength(2);
    for (const c of citations) {
      expect(c).toMatchObject({
        documentId: "doc",
        paragraphId: p.id,
        pageNumber: 3,
        section: "2. Results",
      });
      expect(p.cleanedText.slice(c.start, c.end)).toBe(c.citationText);
    }
    expect(citations.map((c) => c.format)).toEqual(["NUMERIC", "AUTHOR_YEAR"]);
  });

  test("the same item twice in one marker is one citation", () => {
    const { citations, duplicatesRemoved } = detectCitations("doc", [
      para("Twice (Doe, 2020; Doe, 2020) and [3, 3]."),
    ]);
    expect(citations.map((c) => c.citationKey)).toEqual(["Doe, 2020", "3"]);
    expect(duplicatesRemoved).toBe(1); // "[3, 3]" is collapsed while parsing the list
  });
});
