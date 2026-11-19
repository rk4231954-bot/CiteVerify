import { describe, expect, test } from "bun:test";
import {
  classifySentence,
  combineSignalWeights,
  computeConfidence,
  roundConfidence,
} from "../src/index.ts";

describe("confidence calculation", () => {
  test("noisy-OR combination of signal weights", () => {
    expect(combineSignalWeights([])).toBe(0);
    expect(combineSignalWeights([0.5])).toBeCloseTo(0.5);
    expect(combineSignalWeights([0.5, 0.5])).toBeCloseTo(0.75);
    expect(combineSignalWeights([0.6, 0.3, 0.1])).toBeCloseTo(
      1 - 0.4 * 0.7 * 0.9,
    );
  });

  test("penalties scale confidence down", () => {
    expect(computeConfidence([0.5, 0.5], [{ reason: "x", factor: 0.5 }])).toBe(
      0.38,
    );
  });

  test("is clamped to (0, 1) and rounded to 2 decimals", () => {
    expect(computeConfidence(Array(20).fill(0.9))).toBe(0.99);
    expect(roundConfidence(-1)).toBe(0.01);
    expect(roundConfidence(0.12345)).toBe(0.12);
  });

  test("more corroborating evidence → higher extraction confidence", () => {
    const opts = { minConfidence: 0.5, minWords: 4, maxWords: 90 };
    const weak = classifySentence(
      "Group A had higher survival than group B.",
      null,
      opts,
    );
    const strong = classifySentence(
      "Group A had significantly higher survival than group B (p < 0.01, 95% CI 1.1–2.0).",
      "Results",
      opts,
    );
    expect(strong.confidence).toBeGreaterThan(weak.confidence);
    expect(strong.confidence).toBeLessThan(1);
  });
});
