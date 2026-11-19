import { describe, expect, test } from "bun:test";
import { extractEvidence, segmentAbstract } from "../src/index.ts";
import {
  content,
  FULL_TEXT,
  STRUCTURED_ABSTRACT,
  UNSTRUCTURED_ABSTRACT,
} from "./fixtures.ts";

const byText = <T extends { sourceText: string }>(
  evidence: T[],
  start: string,
) => evidence.find((e) => e.sourceText.startsWith(start));

describe("abstract-based extraction", () => {
  test("structured abstract: segments by label, abstract-based, limited scope", async () => {
    const out = await extractEvidence(
      content({
        abstract: STRUCTURED_ABSTRACT,
        abstractSourceUrl: "https://doi.org/10.5555/x",
      }),
    );
    expect(out.verificationScope).toBe("LIMITED");
    expect(out.warnings.join(" ")).toContain("verification scope is limited");
    expect(
      out.evidence.every((e) => e.evidenceAvailability === "ABSTRACT"),
    ).toBe(true);
    // Abstracts carry no reliable page numbers; the stated source URL is preserved, not invented.
    expect(
      out.evidence.every(
        (e) =>
          e.pageNumber === null && e.sourceUrl === "https://doi.org/10.5555/x",
      ),
    ).toBe(true);
    expect(
      out.evidence.map((e) => [
        e.evidenceType,
        e.details.location.abstractLabel,
      ]),
    ).toEqual([
      ["METHODOLOGY", "Methods"],
      ["STATISTICAL_RESULT", "Results"],
      ["ABSTRACT_FINDING", "Results"],
      ["CONCLUSION", "Conclusions"],
    ]);
    // Background and objective sentences are not evidence.
    expect(byText(out.evidence, "Short sleep is common")).toBeUndefined();
    expect(byText(out.evidence, "We aimed")).toBeUndefined();
  });

  test("unstructured abstract: classified from sentence cues", async () => {
    const out = await extractEvidence(
      content({ abstract: UNSTRUCTURED_ABSTRACT }),
    );
    expect(out.evidence.map((e) => e.evidenceType)).toEqual([
      "METHODOLOGY",
      "STATISTICAL_RESULT",
      "CONCLUSION",
    ]);
    expect(out.evidence.every((e) => e.sourceUrl === null)).toBe(true); // no URL known → none invented
    expect(byText(out.evidence, "We recruited")?.details.sampleSizes).toEqual([
      { value: 64, text: "64 nurses" },
    ]);
  });

  test("a result in an abstract is never labelled as a full-text experimental result", async () => {
    const out = await extractEvidence(
      content({
        abstract:
          "Daily walking was associated with better sleep quality in older adults.",
      }),
    );
    expect(out.evidence[0]?.evidenceType).toBe("ABSTRACT_FINDING");
    expect(out.evidence[0]?.evidenceAvailability).toBe("ABSTRACT");
  });

  test("segmentAbstract keeps exact offsets and drops a leading 'Abstract' heading", () => {
    const abstract = `Abstract: ${STRUCTURED_ABSTRACT}`;
    const segments = segmentAbstract(abstract);
    expect(segments.map((s) => s.label)).toEqual([
      "Background",
      "Objective",
      "Methods",
      "Results",
      "Conclusions",
    ]);
    expect(abstract.slice(segments[3]?.start, segments[3]?.end)).toStartWith(
      "Sleep extension increased",
    );
    expect(segmentAbstract("Plain text without labels. Still plain.")).toEqual([
      { label: null, kind: "ABSTRACT", start: 0, end: 39 },
    ]);
  });
});

describe("full-text extraction", () => {
  const full = () =>
    extractEvidence(
      content({
        abstract: STRUCTURED_ABSTRACT,
        fullText: {
          paragraphs: FULL_TEXT,
          sourceUrl: "https://oa.example.org/x.pdf",
        },
      }),
    );

  test("full scope; preserves section headings and page numbers", async () => {
    const out = await full();
    expect(out.verificationScope).toBe("FULL");
    const stat = byText(
      out.evidence,
      "Sleep extension increased total sleep time by 46",
    );
    expect(stat).toMatchObject({
      evidenceAvailability: "FULL_TEXT",
      section: "3. Results",
      pageNumber: 2,
      sourceUrl: "https://oa.example.org/x.pdf",
    });
    expect(byText(out.evidence, "Group differences")?.section).toBe(
      "2.1 Statistical analysis",
    );
  });

  test("experimental findings and statistical results", async () => {
    const out = await full();
    expect(
      byText(out.evidence, "Daytime sleepiness decreased")?.evidenceType,
    ).toBe("EXPERIMENTAL_RESULT");
    const stat = byText(
      out.evidence,
      "Sleep extension increased total sleep time by 46",
    );
    expect(stat?.evidenceType).toBe("STATISTICAL_RESULT");
    expect(stat?.details.statistics).toEqual([
      { kind: "CONFIDENCE_INTERVAL", text: "95% CI 31-61" },
      { kind: "P_VALUE", text: "p < 0.001" },
    ]);
    expect(
      byText(
        out.evidence,
        "Working memory accuracy was",
      )?.details.statistics.map((s) => s.kind),
    ).toEqual(["MEAN_SD", "MEAN_SD"]);
    // A null result is still a result.
    expect(
      byText(out.evidence, "No significant difference in reaction time")
        ?.evidenceType,
    ).toBe("STATISTICAL_RESULT");
  });

  test("methodology, sample size and study conditions", async () => {
    const out = await full();
    const design = byText(out.evidence, "We conducted a randomized");
    expect(design?.evidenceType).toBe("METHODOLOGY");
    expect(design?.details.studyDesign).toEqual([
      "randomized controlled trial",
    ]);
    expect(
      byText(out.evidence, "A total of 120 adults")?.details.sampleSizes.map(
        (s) => s.value,
      ),
    ).toEqual([120, 120]);
    expect(byText(out.evidence, "Group differences")?.evidenceType).toBe(
      "METHODOLOGY",
    );
    expect(byText(out.evidence, "The study took place")).toBeUndefined(); // no methodological content
  });

  test("limitations, discussion and conclusions", async () => {
    const out = await full();
    expect(byText(out.evidence, "Sleep was self-reported")?.evidenceType).toBe(
      "LIMITATION",
    );
    expect(byText(out.evidence, "In conclusion")?.evidenceType).toBe(
      "CONCLUSION",
    );
    expect(
      byText(out.evidence, "Our findings are consistent")?.evidenceType,
    ).toBe("DISCUSSION");
    expect(
      byText(out.evidence, "Sleep is a complex behaviour"),
    ).toBeUndefined(); // generic, not about this study
  });

  test("does not treat every sentence as evidence", async () => {
    const out = await full();
    for (const skipped of [
      "Short sleep is associated with poorer",
      "Previous trials reported",
      "Table 2 shows",
      "We thank the participants",
      "1. Doe J.",
    ])
      expect(byText(out.evidence, skipped)).toBeUndefined();
    expect(out.stats.selected).toBeLessThan(out.stats.sentencesConsidered);
  });

  test("full text without headings falls back to sentence cues and says so", async () => {
    const paragraphs = FULL_TEXT.map((p) => ({ ...p, section: null }));
    const out = await extractEvidence(
      content({ fullText: { paragraphs, sourceUrl: null } }),
    );
    expect(out.warnings.join(" ")).toContain(
      "no recognisable section headings",
    );
    expect(
      byText(out.evidence, "Sleep extension increased total sleep time by 46")
        ?.evidenceType,
    ).toBe("STATISTICAL_RESULT");
  });
});

describe("missing content, duplicates and traceability", () => {
  test("no abstract and no full text → scope NONE, no evidence, no error", async () => {
    const out = await extractEvidence(content());
    expect(out).toMatchObject({ verificationScope: "NONE", evidence: [] });
    expect(out.warnings[0]).toContain("No abstract or full text");
    expect(
      (await extractEvidence(content({ abstract: "   " }))).verificationScope,
    ).toBe("NONE");
  });

  test("a sentence in both the abstract and the full text is kept once, as FULL_TEXT", async () => {
    const out = await extractEvidence(
      content({
        abstract: STRUCTURED_ABSTRACT,
        fullText: { paragraphs: FULL_TEXT, sourceUrl: null },
      }),
    );
    const copies = out.evidence.filter((e) =>
      e.sourceText.startsWith(
        "Sleep extension increased total sleep time by 46",
      ),
    );
    expect(copies).toHaveLength(1);
    expect(copies[0]?.evidenceAvailability).toBe("FULL_TEXT");
    expect(out.stats.duplicatesRemoved).toBe(1);
    expect(new Set(out.evidence.map((e) => e.fingerprint)).size).toBe(
      out.evidence.length,
    );
  });

  test("every passage traces back to its exact source text", async () => {
    const abstract = STRUCTURED_ABSTRACT;
    const out = await extractEvidence(
      content({
        abstract,
        fullText: { paragraphs: FULL_TEXT, sourceUrl: null },
      }),
    );
    for (const e of out.evidence) {
      const { passageId, charStart, charEnd } = e.details.location;
      const source =
        passageId === "abstract"
          ? abstract
          : FULL_TEXT.find((p) => p.id === passageId)?.cleanedText;
      expect(source?.slice(charStart, charEnd)).toBe(e.sourceText);
      // Every extracted detail is a verbatim substring — nothing computed or invented.
      for (const d of [...e.details.statistics, ...e.details.sampleSizes])
        expect(e.sourceText).toContain(d.text);
      for (const d of [...e.details.studyDesign, ...e.details.conditions])
        expect(e.sourceText).toContain(d);
    }
    expect(out.evidence.map((e) => e.position)).toEqual(
      out.evidence.map((_, i) => i),
    );
  });

  test("normalizedText strips citation markers but never changes numbers", async () => {
    const out = await extractEvidence(
      content({
        fullText: {
          paragraphs: [
            {
              id: "r",
              order: 0,
              cleanedText:
                "Mortality was reduced by 12.5% in the treated group compared with controls [4].",
              pageNumber: 3,
              section: "Results",
            },
          ],
          sourceUrl: null,
        },
      }),
    );
    expect(out.evidence[0]?.sourceText).toBe(
      "Mortality was reduced by 12.5% in the treated group compared with controls [4].",
    );
    expect(out.evidence[0]?.normalizedText).toBe(
      "Mortality was reduced by 12.5% in the treated group compared with controls.",
    );
  });

  test("minConfidence and maxEvidence are honoured", async () => {
    const c = content({
      abstract: STRUCTURED_ABSTRACT,
      fullText: { paragraphs: FULL_TEXT, sourceUrl: null },
    });
    const strict = await extractEvidence(c, { minConfidence: 0.75 });
    expect(strict.evidence.every((e) => e.confidence >= 0.75)).toBe(true);
    const capped = await extractEvidence(c, { maxEvidence: 3 });
    expect(capped.evidence).toHaveLength(3);
    expect(capped.warnings.join(" ")).toContain("capped at 3");
  });
});
