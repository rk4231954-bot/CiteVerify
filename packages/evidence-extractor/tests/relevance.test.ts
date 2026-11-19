import { describe, expect, test } from "bun:test";
import {
  extractEvidence,
  rankEvidenceForClaim,
  subjectOutcome,
} from "../src/index.ts";
import { content, FULL_TEXT, STRUCTURED_ABSTRACT } from "./fixtures.ts";

async function candidates() {
  const out = await extractEvidence(
    content({
      abstract: STRUCTURED_ABSTRACT,
      fullText: { paragraphs: FULL_TEXT, sourceUrl: null },
    }),
  );
  return out.evidence.map((e) => ({
    id: e.sourceText,
    text: e.normalizedText,
    evidenceType: e.evidenceType,
  }));
}

describe("claim-evidence relevance ranking", () => {
  test("ranks the passage about the claim's subject AND outcome first", async () => {
    const ranked = rankEvidenceForClaim(
      { id: "c1", text: "Extending sleep improves working memory." },
      await candidates(),
    );
    expect(ranked[0]?.evidenceId).toStartWith(
      "In conclusion, extending sleep improved working memory",
    );
    expect(ranked[0]?.relevanceLevel).toBe("HIGH");
    expect(ranked.map((r) => r.rank)).toEqual(ranked.map((_, i) => i + 1));
    expect(
      ranked.every(
        (r, i) =>
          i === 0 || (ranked[i - 1]?.relevanceScore ?? 0) >= r.relevanceScore,
      ),
    ).toBe(true);
  });

  test("numbers in the claim favour passages reporting the same quantity", async () => {
    const ranked = rankEvidenceForClaim(
      {
        id: "c2",
        text: "Sleep extension increases total sleep time by 46 minutes.",
      },
      await candidates(),
    );
    expect(ranked[0]?.evidenceId).toStartWith(
      "Sleep extension increased total sleep time by 46 minutes",
    );
    expect(ranked[0]?.matchedNumbers).toEqual(["46 minute"]);
    expect(ranked[0]?.breakdown.numbers).toBe(1);
    expect(ranked[1]?.relevanceScore).toBeLessThan(0.5); // same topic, but not the 46-minute result
  });

  test("the outcome term matters more than the shared topic", async () => {
    const ranked = rankEvidenceForClaim(
      { id: "c3", text: "Sleep extension does not affect reaction time." },
      await candidates(),
    );
    expect(ranked[0]?.evidenceId).toStartWith(
      "No significant difference in reaction time",
    );
  });

  test("unrelated claims get no candidates", async () => {
    expect(
      rankEvidenceForClaim(
        { id: "c4", text: "Caffeine reduces blood pressure in older adults." },
        await candidates(),
      ),
    ).toEqual([]);
    expect(
      rankEvidenceForClaim({ id: "c5", text: "The." }, await candidates()),
    ).toEqual([]);
    expect(
      rankEvidenceForClaim({ id: "c6", text: "Sleep improves memory." }, []),
    ).toEqual([]);
  });

  test("topK and minRelevance are honoured; scores stay within 0..1", async () => {
    const ranked = rankEvidenceForClaim(
      { id: "c1", text: "Extending sleep improves working memory." },
      await candidates(),
      { topK: 2, minRelevance: 0.5 },
    );
    expect(ranked).toHaveLength(2);
    expect(
      ranked.every((r) => r.relevanceScore >= 0.5 && r.relevanceScore <= 1),
    ).toBe(true);
  });

  test("relevance carries no verdict: an opposite claim is just as relevant", async () => {
    const c = await candidates();
    const pro = rankEvidenceForClaim(
      { id: "a", text: "Extending sleep improves working memory." },
      c,
    )[0];
    const con = rankEvidenceForClaim(
      { id: "b", text: "Extending sleep does not improve working memory." },
      c,
    )[0];
    expect(con?.evidenceId).toBe(pro?.evidenceId ?? "");
    expect(Object.keys(con ?? {})).not.toContain("verdict");
  });

  test("subject/outcome split", () => {
    expect(
      subjectOutcome(
        "Vitamin D supplementation reduces fracture risk in older women.",
      ),
    ).toEqual({
      subject: ["vitamin", "supplement"],
      outcome: ["fractur", "risk", "older", "women"],
    });
    expect(subjectOutcome("Fracture risk in older women.")).toBeNull();
  });
});
