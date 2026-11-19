import { describe, expect, test } from "bun:test";
import {
  classifyEvidenceSentence,
  classifyHeading,
  extractStatistics,
  isNonEvidence,
  SectionTracker,
} from "../src/index.ts";

const classify = (
  sentence: string,
  sectionKind: Parameters<typeof classifyEvidenceSentence>[1]["sectionKind"],
  availability: "ABSTRACT" | "FULL_TEXT" = "FULL_TEXT",
) =>
  classifyEvidenceSentence(sentence, {
    sectionKind,
    section: sectionKind,
    availability,
  })?.evidenceType ?? null;

describe("section headings", () => {
  test.each([
    ["2. Materials and Methods", "METHODS"],
    ["Statistical Analysis", "METHODS"],
    ["III. RESULTS", "RESULTS"],
    ["Results and Discussion", "RESULTS"],
    ["4 Discussion", "DISCUSSION"],
    ["Strengths and limitations", "LIMITATIONS"],
    ["Conclusions", "CONCLUSION"],
    ["References", "REFERENCES"],
    ["Acknowledgements", "BACK_MATTER"],
    ["Conflict of interest", "BACK_MATTER"],
    ["1. Introduction", "INTRODUCTION"],
    ["Abstract", "ABSTRACT"],
  ])("%s → %s", (heading, kind) =>
    expect(classifyHeading(heading)).toBe(kind as never),
  );

  test("unknown subsection headings inherit the enclosing section", () => {
    const t = new SectionTracker();
    expect(t.kindFor("3. Results")).toBe("RESULTS");
    expect(t.kindFor("3.2 Sleep outcomes")).toBe("RESULTS");
    expect(t.kindFor("4. Discussion")).toBe("DISCUSSION");
    expect(new SectionTracker().kindFor("Something unusual")).toBe("OTHER");
  });
});

describe("evidence classification", () => {
  test("section decides the category, cues are still required", () => {
    expect(
      classify(
        "The intervention reduced HbA1c by 0.4% compared with placebo.",
        "RESULTS",
      ),
    ).toBe("EXPERIMENTAL_RESULT");
    expect(
      classify(
        "The intervention reduced HbA1c (p = 0.02) compared with placebo.",
        "RESULTS",
      ),
    ).toBe("STATISTICAL_RESULT");
    expect(
      classify(
        "Baseline characteristics of the cohort are listed in the supplement.",
        "RESULTS",
      ),
    ).toBeNull();
    expect(
      classify(
        "Participants were recruited from three primary care clinics.",
        "METHODS",
      ),
    ).toBe("METHODOLOGY");
    expect(
      classify(
        "The clinics are located in the northern region of the country.",
        "METHODS",
      ),
    ).toBeNull();
    expect(
      classify(
        "These findings suggest that metformin lowers glucose in adults.",
        "DISCUSSION",
      ),
    ).toBe("CONCLUSION");
    expect(
      classify(
        "A limitation is the short follow-up of only twelve weeks.",
        "DISCUSSION",
      ),
    ).toBe("LIMITATION");
    expect(
      classify(
        "Our results are consistent with two earlier randomized trials.",
        "DISCUSSION",
      ),
    ).toBe("DISCUSSION");
    expect(
      classify(
        "Others have reported similar effects in rodents and primates [5].",
        "DISCUSSION",
      ),
    ).toBeNull();
  });

  test("introductions, references and back matter are never evidence", () => {
    const s =
      "Metformin reduced HbA1c by 0.4% compared with placebo (p < 0.01).";
    expect(classify(s, "INTRODUCTION")).toBeNull();
    expect(classify(s, "REFERENCES")).toBeNull();
    expect(classify(s, "BACK_MATTER")).toBeNull();
  });

  test("abstract results become ABSTRACT_FINDING", () => {
    expect(
      classify(
        "Walking improved sleep quality compared with usual activity.",
        "RESULTS",
        "ABSTRACT",
      ),
    ).toBe("ABSTRACT_FINDING");
    expect(
      classify(
        "Walking improved sleep quality compared with usual activity.",
        "ABSTRACT",
        "FULL_TEXT",
      ),
    ).toBe("ABSTRACT_FINDING");
  });

  test("objectives, questions, captions and fragments are skipped", () => {
    expect(
      isNonEvidence("Does sleep extension improve memory in adults?"),
    ).toBe("question");
    expect(
      isNonEvidence("Figure 2. Sleep time by group and week of the study."),
    ).toBe("caption or boilerplate");
    expect(isNonEvidence("12.1 (3.4) 14.2 (2.9) 0.03 0.41 0.77 1.2")).toContain(
      "table fragment",
    );
    expect(isNonEvidence("Too short.")).toBe("too short");
    expect(
      classify(
        "The aim of this study was to examine whether sleep improves memory.",
        null,
      ),
    ).toBeNull();
  });

  test("confidence reflects the classification and explains itself", () => {
    const strong = classifyEvidenceSentence(
      "Mortality was lower in the treated group (HR = 0.72; 95% CI 0.60-0.86; p < 0.001).",
      {
        sectionKind: "RESULTS",
        section: "Results",
        availability: "FULL_TEXT",
      },
    );
    const weak = classifyEvidenceSentence(
      "Mortality was lower in the treated group than in controls.",
      { sectionKind: null, section: null, availability: "FULL_TEXT" },
    );
    expect(strong?.confidence).toBeGreaterThan(weak?.confidence ?? 1);
    expect(strong?.signals).toContain('section "Results"');
    expect(weak?.signals).toContain("classified from sentence cues only");
  });
});

describe("statistics extraction (verbatim)", () => {
  test("recognises common reporting formats", () => {
    expect(
      extractStatistics(
        "OR = 1.8, 95% CI 1.2–2.7, P<0.01; t(48) = 2.31; 3.2 ± 0.4 kg; 27% of patients",
      ).map((s) => [s.kind, s.text]),
    ).toEqual([
      ["EFFECT_SIZE", "OR = 1.8"],
      ["CONFIDENCE_INTERVAL", "95% CI 1.2–2.7"],
      ["P_VALUE", "P<0.01"],
      ["TEST_STATISTIC", "t(48) = 2.31"],
      ["MEAN_SD", "3.2 ± 0.4"],
      ["PERCENTAGE", "27%"],
    ]);
  });
});
