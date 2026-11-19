import { describe, expect, test } from "bun:test";
import {
  cleanMultilineText,
  cleanText,
  collapseLineBreaks,
  collapseWhitespace,
  countWords,
  isEffectivelyEmpty,
  joinWrappedLines,
  normalizeUnicode,
} from "../src/index.ts";

describe("normalizeUnicode", () => {
  test("expands ligatures and normalises odd spaces", () => {
    expect(normalizeUnicode("ﬁrst eﬀect here too")).toBe(
      "first effect here too",
    );
  });

  test("removes zero-width and control characters", () => {
    expect(normalizeUnicode("a​b﻿c\u0007d")).toBe("abcd");
  });

  test("composes accents (NFC) without NFKC-style destruction of notation", () => {
    expect(normalizeUnicode("café")).toBe("café");
    // NFKC would turn these into "x2", "1⁄2", "mu" — they must survive.
    expect(normalizeUnicode("x² ½ µ H₂O")).toBe("x² ½ µ H₂O");
  });
});

describe("whitespace and line breaks", () => {
  test("collapses spaces/tabs per line and trims", () => {
    expect(collapseWhitespace("  a \t  b  \n   c   ")).toBe("a b\nc");
  });

  test("collapses repeated line breaks", () => {
    expect(collapseLineBreaks("a\n\n\n\n\nb\n\nc\n")).toBe("a\n\nb\n\nc");
  });

  test("keeps paragraph breaks in multi-line text", () => {
    expect(cleanMultilineText("first\nline\n\n\n\nsecond   para")).toBe(
      "first line\n\nsecond para",
    );
  });
});

describe("joinWrappedLines (de-hyphenation)", () => {
  test("repairs a word broken across lines", () => {
    expect(joinWrappedLines(["a mod-", "est effect"])).toBe("a modest effect");
  });

  test("keeps genuine compound hyphens", () => {
    expect(joinWrappedLines(["self-", "reported sleep"])).toBe(
      "self-reported sleep",
    );
    expect(joinWrappedLines(["well-", "known result"])).toBe(
      "well-known result",
    );
  });

  test("never alters DOIs, URLs, or identifiers split across lines", () => {
    expect(joinWrappedLines(["doi:10.5555/synthetic-", "demo.0001"])).toBe(
      "doi:10.5555/synthetic-demo.0001",
    );
    expect(joinWrappedLines(["https://example.org/a-", "b"])).toBe(
      "https://example.org/a-b",
    );
    expect(joinWrappedLines(["COVID-", "19 cases"])).toBe("COVID-19 cases");
  });

  test("joins soft-hyphenated words", () => {
    expect(joinWrappedLines(["exam­", "ple"])).toBe("example");
  });

  test("joins ordinary wrapped lines with a single space", () => {
    expect(joinWrappedLines(["one", "  two ", "", "three"])).toBe(
      "one two three",
    );
  });
});

describe("cleanText preserves scientific content", () => {
  test.each([
    "Effect was 12 ± 3% (p < 0.05, 95% CI 0.2–0.6).",
    "Concentration of 5 × 10⁻³ mol/L at 37 °C.",
    "As shown previously [1, 3–5] and (Doe et al., 2021).",
    "∑ xᵢ ≤ α where α = 0.05 and β ≥ 0.8.",
    "See https://doi.org/10.5555/synthetic-demo.0001.",
    "Reported in μg/mL ≈ 1.5e-3.",
  ])("leaves %p unchanged", (text) => {
    expect(cleanText(text)).toBe(text);
  });

  test("cleans artifacts around preserved content", () => {
    expect(
      cleanText("  The ﬁnding (p < 0.05)\nwas sig-\nnificant [2].  "),
    ).toBe("The finding (p < 0.05) was significant [2].");
  });
});

describe("helpers", () => {
  test("isEffectivelyEmpty", () => {
    expect(isEffectivelyEmpty("  • – ... ")).toBe(true);
    expect(isEffectivelyEmpty("1")).toBe(false);
  });

  test("countWords", () => {
    expect(countWords("The 3.5-fold increase wasn't large.")).toBe(5);
  });
});
