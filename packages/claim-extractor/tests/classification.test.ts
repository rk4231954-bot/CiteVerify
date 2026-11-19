import { describe, expect, test } from "bun:test";
import {
  ClaimCategory as C,
  ClaimCharacteristic as K,
} from "@citeverify/shared";
import { classifySentence } from "../src/index.ts";

// All sentences are SYNTHETIC examples written for these tests.
const OPTS = { minConfidence: 0.5, minWords: 4, maxWords: 90 };
const classify = (text: string, section: string | null = null) =>
  classifySentence(text, section, OPTS);

describe("claim categories", () => {
  test.each([
    ["Insulin regulates glucose uptake in skeletal muscle.", C.SCIENTIFIC_FACT],
    [
      "Chronic inflammation is known to impair tissue repair.",
      C.SCIENTIFIC_FACT,
    ],
    [
      "Vitamin D deficiency is associated with lower bone density.",
      C.SCIENTIFIC_FACT,
    ],
  ])("SCIENTIFIC_FACT: %p", (text, category) => {
    expect(classify(text)).toMatchObject({ isClaim: true, category });
  });

  test.each([
    [
      "Treatment A significantly increased growth rate.",
      [K.CHANGE_DIRECTION, K.STATISTICAL_SIGNIFICANCE],
    ],
    [
      "Researchers observed a 15% improvement in production.",
      [K.PERCENTAGE, K.CHANGE_DIRECTION],
    ],
    [
      "The experiment demonstrated improved performance under controlled conditions.",
      [K.CHANGE_DIRECTION],
    ],
    ["Elevated enzyme activity was observed in treated samples.", []],
  ])("EXPERIMENTAL_FINDING: %p", (text, characteristics) => {
    const r = classify(text);
    expect(r).toMatchObject({
      isClaim: true,
      category: C.EXPERIMENTAL_FINDING,
    });
    expect(r.characteristics).toEqual(expect.arrayContaining(characteristics));
  });

  test.each([
    [
      "Mean systolic pressure fell from 142 to 131 mmHg (p < 0.001).",
      K.P_VALUE,
    ],
    [
      "Exposure was associated with admissions (OR = 1.21, 95% CI 1.10–1.33).",
      K.CONFIDENCE_INTERVAL,
    ],
    [
      "Scores differed between groups, t(58) = 3.2, after the intervention.",
      K.TEST_STATISTIC,
    ],
    [
      "The difference between arms was statistically significant in older adults.",
      K.STATISTICAL_SIGNIFICANCE,
    ],
  ])("STATISTICAL_CLAIM: %p", (text, characteristic) => {
    const r = classify(text);
    expect(r).toMatchObject({ isClaim: true, category: C.STATISTICAL_CLAIM });
    expect(r.characteristics).toContain(characteristic);
  });

  test.each([
    "Smoking causes lung cancer in a dose-dependent manner.",
    "High salt intake leads to elevated blood pressure in rodents.",
    "Drought stress induced early flowering in the fictional cultivar.",
    "Exercise improves insulin sensitivity in older adults.",
  ])("CAUSAL_CLAIM: %p", (text) => {
    const r = classify(text);
    expect(r).toMatchObject({ isClaim: true, category: C.CAUSAL_CLAIM });
    expect(r.characteristics).toContain(K.CAUSAL_LANGUAGE);
  });

  test.each([
    "Group A had higher survival than group B.",
    "The new catalyst outperformed the reference catalyst at low temperature.",
    "Yields were lower in clay soils compared with sandy soils.",
  ])("COMPARATIVE_CLAIM: %p", (text) => {
    const r = classify(text);
    expect(r).toMatchObject({ isClaim: true, category: C.COMPARATIVE_CLAIM });
    expect(r.characteristics).toContain(K.COMPARISON);
  });

  test.each([
    "The results indicate a positive relationship between temperature and mortality.",
    "Taken together, these findings support a role for sleep in memory consolidation.",
    "We conclude that the intervention is feasible in rural clinics.",
  ])("RESEARCH_CONCLUSION: %p", (text) => {
    expect(classify(text)).toMatchObject({
      isClaim: true,
      category: C.RESEARCH_CONCLUSION,
    });
  });

  test.each([
    [
      "The global prevalence of the synthetic condition is 9.3% among adults.",
      K.PERCENTAGE,
    ],
    ["Average daily intake was 2.4 g per person.", K.NUMERIC_VALUE],
  ])("NUMERICAL_CLAIM: %p", (text, characteristic) => {
    const r = classify(text);
    expect(r).toMatchObject({ isClaim: true, category: C.NUMERICAL_CLAIM });
    expect(r.characteristics).toContain(characteristic);
  });

  test("records hedging, negation, and citations as characteristics", () => {
    expect(
      classify("Caffeine may reduce reaction time in fatigued drivers.")
        .characteristics,
    ).toContain(K.HEDGED);
    expect(
      classify("There was no significant difference between the groups.")
        .characteristics,
    ).toContain(K.NEGATED);
    expect(
      classify("Smoking causes lung cancer in most cohorts [3].")
        .characteristics,
    ).toContain(K.CITES_SOURCE);
  });

  test("explains why a sentence was selected", () => {
    const r = classify(
      "Mean systolic pressure fell from 142 to 131 mmHg (p < 0.001).",
      "Results",
    );
    expect(r.rationale).toEqual(
      expect.arrayContaining(['p-value: "p < 0.001"', 'section "Results"']),
    );
  });
});

describe("ordinary sentences are excluded", () => {
  test.each([
    [
      "In this paper, we present a new framework for sleep research.",
      "describes the paper, not a finding",
    ],
    [
      "The aim of this study was to explore walking habits.",
      "describes the paper, not a finding",
    ],
    [
      "The remainder of this paper is organized as follows.",
      "describes the paper, not a finding",
    ],
    [
      "Climate change is an important topic for many researchers.",
      "no assertive scientific cue",
    ],
    ["The study was conducted in 2019.", "no assertive scientific cue"],
    [
      "More than 50 participants completed the survey.",
      "no assertive scientific cue",
    ],
    [
      "Table 1 summarizes the baseline characteristics.",
      "no assertive scientific cue",
    ],
    ["We thank the participants for their time.", "administrative statement"],
    [
      "This work was funded by a synthetic research grant.",
      "administrative statement",
    ],
    ["The authors declare no competing interests.", "administrative statement"],
    ["What drives this effect remains unclear?", "question"],
    ["Results.", "too short"],
  ])("%p", (text, reason) => {
    expect(classify(text)).toMatchObject({
      isClaim: false,
      rejectedBecause: reason,
    });
  });

  test("procedural method descriptions fall below the threshold", () => {
    const r = classify(
      "Samples were collected from 120 participants and stored at −80 °C.",
      "Methods",
    );
    expect(r.isClaim).toBe(false);
    expect(r.rejectedBecause).toMatch(/below threshold/);
  });

  test("never assigns a category without a matching cue", () => {
    const r = classify("The synthetic weather was pleasant during the visit.");
    expect(r).toMatchObject({ isClaim: false, category: null });
  });
});
