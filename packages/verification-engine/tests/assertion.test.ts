import { describe, expect, test } from "bun:test";
import { analyzeAssertion, analyzeClaim } from "../src/index.ts";

const outcome = analyzeClaim({
  id: "c",
  text: "Aerobic exercise reduces systolic blood pressure (Smith, 2020).",
}).outcome;

describe("analyzeAssertion", () => {
  test.each([
    [
      "Systolic blood pressure decreased by 8.2 mmHg (p < 0.001).",
      "DOWN",
      "SIGNIFICANT",
    ],
    [
      "Exercise did not reduce systolic blood pressure (p = 0.41).",
      "NONE",
      "NOT_SIGNIFICANT",
    ],
    [
      "There was no significant difference in systolic blood pressure.",
      "NONE",
      "NOT_SIGNIFICANT",
    ],
    ["Systolic blood pressure increased by 3 mmHg.", "UP", null],
    [
      "Exercise was inversely associated with systolic blood pressure.",
      "DOWN",
      null,
    ],
    [
      "Exercise was associated with lower systolic blood pressure.",
      "DOWN",
      null,
    ],
  ] as const)("%s", (text, polarity, significance) => {
    const a = analyzeAssertion(text, { outcomeTerms: outcome });
    expect(a.polarity).toBe(polarity);
    expect(a.significance).toBe(significance);
  });

  test("citation markers never become outcome terms", () => {
    expect(outcome).not.toContain("smith");
  });

  test("relation kind, hedging, absolute wording, quantities and populations", () => {
    const a = analyzeAssertion("Smoking causes lung cancer in all adults.");
    expect(a).toMatchObject({
      polarity: "UP",
      relation: "CAUSAL",
      absoluteTerms: ["all"],
      populations: ["ADULTS"],
    });
    const b = analyzeAssertion(
      "Exercise may lower blood pressure by 5 mmHg (95% CI 2 to 8) in mice.",
    );
    expect(b.hedged).toBe(true);
    expect(b.quantities).toEqual(["5 mmhg"]);
    expect(b.populations).toEqual(["ANIMAL"]);
  });

  test("the cue closest to the outcome governs", () => {
    const a = analyzeAssertion(
      "Despite higher adherence costs, the intervention reduced systolic blood pressure.",
      { outcomeTerms: outcome },
    );
    expect(a.polarity).toBe("DOWN");
  });
});
