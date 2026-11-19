import { describe, expect, test } from "bun:test";
import {
  claimFingerprint,
  hasCitationMarker,
  normalizeClaimText,
  splitSentences,
} from "../src/index.ts";

describe("normalizeClaimText", () => {
  test("removes citation markers and connectives, collapses whitespace", () => {
    expect(
      normalizeClaimText("However,  rates   fell by 12 ± 3% [1, 4–6]."),
    ).toBe("rates fell by 12 ± 3%.");
    expect(
      normalizeClaimText("Sleep improved (Doe et al., 2021; Roe & Poe, 2019)."),
    ).toBe("Sleep improved.");
    expect(normalizeClaimText("It was “clearly” lower (see Doe, 2020).")).toBe(
      'It was "clearly" lower.',
    );
  });

  test.each([
    "The dose was 5 × 10⁻³ mol/L at 37 °C (p < 0.05).",
    "Mean ± SD was 6.1 ± 1.2, range 0.2–0.6, β = −0.31.",
    "Expression of [Ca2+] rose 2.5-fold in HEK293 cells.",
    "PM2.5 exposure exceeded 35 µg/m³ on 12 days.",
  ])("never alters values: %p", (text) => {
    expect(normalizeClaimText(text)).toBe(text);
  });

  test("detects citation markers", () => {
    expect(hasCitationMarker("as shown [12].")).toBe(true);
    expect(hasCitationMarker("as shown (Doe et al., 2021).")).toBe(true);
    expect(hasCitationMarker("concentration of [Ca2+] rose")).toBe(false);
  });

  test("fingerprint ignores case, punctuation, and citations — but not values", () => {
    const a = claimFingerprint(normalizeClaimText("Rates fell by 12% [1]."));
    expect(a).toBe(claimFingerprint(normalizeClaimText("rates fell by 12%")));
    expect(a).not.toBe(
      claimFingerprint(normalizeClaimText("Rates fell by 13%.")),
    );
  });
});

describe("splitSentences", () => {
  test("handles abbreviations, initials, decimals, and citations", () => {
    const text =
      "Doe et al. (2020) found a 2.5-fold rise (Fig. 2). J. Smith disagreed, e.g. in vitro. Rates fell by 0.5 vs. 0.7 units [1]. Next one!";
    expect(splitSentences(text).map((s) => s.text)).toEqual([
      "Doe et al. (2020) found a 2.5-fold rise (Fig. 2).",
      "J. Smith disagreed, e.g. in vitro.",
      "Rates fell by 0.5 vs. 0.7 units [1].",
      "Next one!",
    ]);
  });

  test("returns exact substrings with offsets", () => {
    const text = "First claim here.  Second claim there.";
    for (const s of splitSentences(text))
      expect(text.slice(s.start, s.end)).toBe(s.text);
  });
});
