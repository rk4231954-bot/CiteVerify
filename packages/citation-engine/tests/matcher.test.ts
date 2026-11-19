import { describe, expect, test } from "bun:test";
import { CitationMatchStatus as S } from "@citeverify/shared";
import {
  type DetectedCitation,
  detectCitations,
  matchCitation,
  type ParsedReference,
  surnameSimilarity,
} from "../src/index.ts";
import { para, ref } from "./helpers.ts";

// All names, works and years are SYNTHETIC.
function citation(text: string): DetectedCitation {
  const { citations } = detectCitations("d", [para(text)]);
  if (!citations[0]) throw new Error(`no citation in ${text}`);
  return citations[0];
}
const match = (text: string, refs: ParsedReference[]) =>
  matchCitation(citation(text), refs);

describe("numeric matching", () => {
  const refs = [
    ref({ authors: ["Doe A"], label: "1" }),
    ref({ authors: ["Roe B"], label: "2" }),
  ];
  test("matches the entry with the same number", () => {
    const m = match("Rose [2].", refs);
    expect(m).toMatchObject({ status: S.MATCHED, referenceId: refs[1]?.id });
    expect(m.confidence).toBeGreaterThan(0.9);
  });
  test("a number with no entry is UNMATCHED", () => {
    expect(match("Rose [9].", refs)).toMatchObject({
      status: S.UNMATCHED,
      referenceId: null,
      candidates: [],
    });
  });
  test("two entries with the same label are AMBIGUOUS", () => {
    const dup = [...refs, ref({ authors: ["Poe C"], label: "2" })];
    expect(match("Rose [2].", dup)).toMatchObject({
      status: S.AMBIGUOUS,
      referenceId: null,
    });
  });
  test("an unnumbered bibliography only proposes the n-th entry", () => {
    const unlabelled = [
      ref({ authors: ["Doe A"] }),
      ref({ authors: ["Roe B"] }),
    ];
    const m = match("Rose [2].", unlabelled);
    expect(m).toMatchObject({ status: S.NEEDS_REVIEW, referenceId: null });
    expect(m.candidates[0]?.referenceId).toBe(unlabelled[1]?.id);
  });
});

describe("author-year matching", () => {
  const smith3 = ref({
    authors: ["Smith, J.", "Doe, A.", "Roe, B."],
    year: 2020,
  });
  const smith1 = ref({ authors: ["Smith, J."], year: 2020 });
  const lee = ref({ authors: ["Lee, K.", "Park, J."], year: 2019 });

  test("matches surname and year", () => {
    expect(match("Rose (Lee & Park, 2019).", [smith3, lee])).toMatchObject({
      status: S.MATCHED,
      referenceId: lee.id,
      confidence: 1,
    });
  });

  test("'et al.' picks the multi-author work over a same-name single-author work", () => {
    expect(match("Rose (Smith et al., 2020).", [smith1, smith3])).toMatchObject(
      { status: S.MATCHED, referenceId: smith3.id },
    );
    expect(match("Rose (Smith, 2020).", [smith1, smith3])).toMatchObject({
      status: S.MATCHED,
      referenceId: smith1.id,
    });
  });

  test("same author, same year: the suffix decides", () => {
    const a = ref({ authors: ["Kim, H."], year: 2021, yearSuffix: "a" });
    const b = ref({ authors: ["Kim, H."], year: 2021, yearSuffix: "b" });
    expect(match("Rose (Kim, 2021b).", [a, b])).toMatchObject({
      status: S.MATCHED,
      referenceId: b.id,
    });
    const ambiguous = match("Rose (Kim, 2021).", [a, b]);
    expect(ambiguous).toMatchObject({ status: S.AMBIGUOUS, referenceId: null });
    expect(ambiguous.candidates.map((c) => c.referenceId).sort()).toEqual(
      [a.id, b.id].sort(),
    );
  });

  test("a year off by one is only NEEDS_REVIEW", () => {
    const m = match("Rose (Lee & Park, 2018).", [lee]);
    expect(m).toMatchObject({ status: S.NEEDS_REVIEW, referenceId: null });
    expect(m.candidates[0]?.reasons.join(" ")).toContain("year off by one");
  });

  test("incomplete author information is never silently matched", () => {
    const unparsed = ref({
      authors: [],
      rawText: "Smith J et al 2020 synthetic glucose report",
      year: 2020,
    });
    expect(match("Rose (Smith et al., 2020).", [unparsed])).toMatchObject({
      status: S.NEEDS_REVIEW,
      referenceId: null,
    });
    const undated = ref({ authors: ["Smith, J.", "Doe, A.", "Roe, B."] });
    expect(match("Rose (Smith et al., 2020).", [undated])).toMatchObject({
      status: S.NEEDS_REVIEW,
      referenceId: null,
    });
  });

  test("different author or year → UNMATCHED", () => {
    expect(match("Rose (Garcia, 2020).", [smith1, lee])).toMatchObject({
      status: S.UNMATCHED,
    });
    expect(match("Rose (Smith, 2015).", [smith1])).toMatchObject({
      status: S.UNMATCHED,
    });
  });

  test("co-author mismatch is flagged", () => {
    expect(match("Rose (Lee & Smith, 2019).", [lee])).toMatchObject({
      status: S.NEEDS_REVIEW,
    });
  });

  test("tolerates diacritics, particles and a one-letter slip", () => {
    expect(surnameSimilarity("Müller", "Muller")).toBe(1);
    expect(surnameSimilarity("van der Berg", "Berg")).toBe(0.95);
    expect(surnameSimilarity("Johnson", "Jonson")).toBe(0.75);
    expect(surnameSimilarity("Lee", "Li")).toBe(0);
    const vdb = ref({ authors: ["van der Berg, K."], year: 2019 });
    expect(match("As van der Berg (2019) noted.", [vdb])).toMatchObject({
      status: S.MATCHED,
      referenceId: vdb.id,
    });
  });
});
