import { describe, expect, test } from "bun:test";
import {
  createAiStrategy,
  DISCLAIMER,
  type VerificationAiProvider,
  VerificationError,
  verifyClaim,
} from "../src/index.ts";
import { citation, evidence, input, METHODS, publication } from "./fixtures.ts";

const A = publication("A");
const RESULT =
  "Systolic blood pressure decreased by 8.2 mmHg in the exercise group compared with usual care (95% CI 5.1 to 11.3; p < 0.001).";
const CONCLUSION =
  "Supervised aerobic exercise lowers systolic blood pressure in older adults.";

describe("verdicts", () => {
  test("SUPPORTED: full-text results agree, evidence quoted verbatim with its source", async () => {
    const ev = [
      METHODS("A"),
      evidence("A", RESULT),
      evidence("A", CONCLUSION, {
        evidenceType: "CONCLUSION",
        section: "Conclusion",
      }),
    ];
    const r = await verifyClaim(input([citation(A)], ev));
    expect(r.verdict).toBe("SUPPORTED");
    expect(r.reasonCode).toBe("SUPPORTING_EVIDENCE");
    expect(r.confidence).toBeGreaterThanOrEqual(60);
    expect(r.confidence).toBeLessThanOrEqual(90);
    expect(r.evidenceSource).toBe("FULL_TEXT");
    expect(r.verificationScope).toBe("FULL");
    expect(r.contradictingEvidence).toEqual([]);
    expect(r.supportingEvidence.map((e) => e.sourceText)).toContain(RESULT);
    const top = r.supportingEvidence.find((e) => e.sourceText === RESULT);
    expect(top).toMatchObject({
      publicationId: "A",
      evidenceAvailability: "FULL_TEXT",
      section: "Results",
      pageNumber: 4,
      sourceUrl: "https://repo.example.org/A.pdf",
    });
    expect(top?.rationale.join(" ")).toContain("decrease");
    expect(r.publications[0]).toMatchObject({
      id: "A",
      contribution: "SUPPORTING",
      onTopic: true,
    });
    expect(r.assessmentType).toBe("AUTOMATED");
    expect(r.disclaimer).toBe(DISCLAIMER);
    expect(r.humanReview.recommended).toBe(false);
  });

  test("abstract-only support is not treated like full text", async () => {
    const pub = publication("A", { fullTextStatus: "NOT_OPEN_ACCESS" });
    const ev = [
      evidence("A", RESULT, {
        evidenceAvailability: "ABSTRACT",
        evidenceType: "ABSTRACT_FINDING",
      }),
    ];
    const r = await verifyClaim(input([citation(pub)], ev));
    expect(r.verdict).toBe("SUPPORTED");
    expect(r.evidenceSource).toBe("ABSTRACT");
    expect(r.verificationScope).toBe("LIMITED");
    expect(r.confidence).toBeLessThanOrEqual(65);
    expect(r.humanReview.recommended).toBe(true);
    expect(r.humanReview.reasons).toContain("Based on abstract text only.");
    expect(r.limitations.join(" ")).toContain(
      "only the abstract was available (full text: NOT_OPEN_ACCESS)",
    );
    expect(r.supportingEvidence[0]?.pageNumber).toBeNull();
  });

  test("PARTIALLY_SUPPORTED: the source reports an association, the claim an effect", async () => {
    const ev = [
      evidence(
        "A",
        "Higher aerobic exercise levels were associated with lower systolic blood pressure in older adults (p = 0.01).",
      ),
    ];
    const r = await verifyClaim(input([citation(A)], ev));
    expect(r.verdict).toBe("PARTIALLY_SUPPORTED");
    expect(r.reasonCode).toBe("OVERSTATED_CLAIM");
    expect(r.supportingEvidence[0]?.flags).toContain("CAUSAL_OVERSTATEMENT");
    expect(r.explanation).toContain("association");
  });

  test("PARTIALLY_SUPPORTED: same direction, different numbers", async () => {
    const r = await verifyClaim(
      input(
        [citation(A)],
        [evidence("A", RESULT)],
        "Aerobic exercise reduces systolic blood pressure by 20 mmHg in older adults [1].",
      ),
    );
    expect(r.verdict).toBe("PARTIALLY_SUPPORTED");
    expect(r.supportingEvidence[0]?.flags).toContain("NUMBER_MISMATCH");
  });

  test("PARTIALLY_SUPPORTED: absolute wording and animal evidence for a human claim", async () => {
    const mice = publication("M", {
      title: "Aerobic exercise and blood pressure in hypertensive mice",
    });
    const r = await verifyClaim(
      input(
        [citation(mice)],
        [
          evidence(
            "M",
            "Systolic blood pressure decreased after aerobic exercise training (p < 0.01).",
          ),
        ],
        "Aerobic exercise always reduces systolic blood pressure in older adults [1].",
      ),
    );
    expect(r.verdict).toBe("PARTIALLY_SUPPORTED");
    expect(r.supportingEvidence[0]?.flags).toEqual(
      expect.arrayContaining(["OVERGENERALIZATION", "POPULATION_MISMATCH"]),
    );
    expect(r.humanReview.reasons.join(" ")).toContain("different population");
  });

  test("CONTRADICTED: the source reports no significant effect", async () => {
    const ev = [
      METHODS("A"),
      evidence(
        "A",
        "Aerobic exercise did not reduce systolic blood pressure compared with usual care (mean difference 0.4 mmHg; p = 0.62).",
      ),
    ];
    const r = await verifyClaim(input([citation(A)], ev));
    expect(r.verdict).toBe("CONTRADICTED");
    expect(r.supportingEvidence).toEqual([]);
    expect(r.contradictingEvidence).toHaveLength(1);
    expect(r.explanation).toContain("no statistically significant effect");
    expect(r.humanReview.recommended).toBe(true); // serious verdicts always get a human check
  });

  test("CONTRADICTED: the source reports the opposite direction", async () => {
    const r = await verifyClaim(
      input(
        [citation(A)],
        [
          evidence(
            "A",
            "Systolic blood pressure increased by 3.1 mmHg in the aerobic exercise group (p = 0.02).",
          ),
        ],
      ),
    );
    expect(r.verdict).toBe("CONTRADICTED");
    expect(r.contradictingEvidence[0]?.rationale[0]).toContain("increase");
  });

  test("UNSUPPORTED: the full text is on topic but never reports the finding", async () => {
    const ev = [
      METHODS("A"),
      evidence(
        "A",
        "Systolic blood pressure was measured with a validated automated device at baseline and 12 weeks.",
        {
          evidenceType: "METHODOLOGY",
          section: "Methods",
        },
      ),
      evidence(
        "A",
        "Adherence to aerobic exercise sessions was 87% and systolic blood pressure readings were complete for 230 participants.",
        {
          evidenceType: "EXPERIMENTAL_RESULT",
        },
      ),
    ];
    const r = await verifyClaim(input([citation(A)], ev));
    expect(r.verdict).toBe("UNSUPPORTED");
    expect(r.reasonCode).toBe("FINDING_NOT_REPORTED");
    expect(r.supportingEvidence).toEqual([]);
    expect(r.contradictingEvidence).toEqual([]);
    expect(r.contextEvidence.length).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThanOrEqual(65);
  });

  test("NEEDS_HUMAN_REVIEW: missing evidence (no abstract, no full text)", async () => {
    const r = await verifyClaim(
      input(
        [citation(publication("A", { fullTextStatus: "NOT_OPEN_ACCESS" }))],
        [],
      ),
    );
    expect(r).toMatchObject({
      verdict: "NEEDS_HUMAN_REVIEW",
      reasonCode: "NO_EVIDENCE",
      confidence: 0,
      evidenceSource: "NONE",
      verificationScope: "NONE",
    });
    expect(r.publications[0]?.contribution).toBe("NO_EVIDENCE");
    expect(r.humanReview.recommended).toBe(true);
  });

  test("NEEDS_HUMAN_REVIEW: no citation / unresolved citation", async () => {
    const none = await verifyClaim(input([], []));
    expect(none).toMatchObject({
      verdict: "NEEDS_HUMAN_REVIEW",
      reasonCode: "NO_CITATION",
    });

    const unresolved = await verifyClaim(
      input(
        [
          citation(null, {
            referenceId: "ref-1",
            publicationMatchStatus: "AMBIGUOUS",
          }),
        ],
        [],
      ),
    );
    expect(unresolved).toMatchObject({
      verdict: "NEEDS_HUMAN_REVIEW",
      reasonCode: "UNRESOLVED_CITATION",
    });
    expect(unresolved.unresolvedCitations[0]?.reason).toContain("AMBIGUOUS");
  });

  test("MISLEADING_CITATION: the cited publication is about something else", async () => {
    const coffee = publication("C", {
      title: "Coffee consumption and sleep quality in a fictional cohort",
    });
    const ev = [
      evidence(
        "C",
        "Coffee consumption was not associated with sleep quality after adjustment for age (p = 0.41).",
        {
          evidenceType: "ABSTRACT_FINDING",
          evidenceAvailability: "ABSTRACT",
        },
      ),
      evidence(
        "C",
        "Participants who drank more coffee reported shorter sleep duration (p = 0.03).",
        {
          evidenceType: "STATISTICAL_RESULT",
        },
      ),
    ];
    const r = await verifyClaim(input([citation(coffee)], ev));
    expect(r.verdict).toBe("MISLEADING_CITATION");
    expect(r.reasonCode).toBe("CITED_SOURCE_OFF_TOPIC");
    expect(r.publications[0]?.onTopic).toBe(false);
    expect(r.supportingEvidence).toEqual([]);
    expect(r.humanReview.recommended).toBe(true);
  });

  test("NEEDS_HUMAN_REVIEW: conflicting evidence from contemporaneous sources", async () => {
    const B = publication("B", {
      year: 2021,
      title: "A second fictional trial of aerobic exercise and blood pressure",
    });
    const ev = [
      evidence("A", RESULT),
      evidence(
        "B",
        "Systolic blood pressure did not differ between aerobic exercise and control groups (p = 0.48).",
      ),
    ];
    const r = await verifyClaim(input([citation(A), citation(B)], ev));
    expect(r.verdict).toBe("NEEDS_HUMAN_REVIEW");
    expect(r.reasonCode).toBe("CONFLICTING_EVIDENCE");
    expect(r.supportingEvidence).toHaveLength(1);
    expect(r.contradictingEvidence).toHaveLength(1);
    expect(r.publications.map((p) => p.contribution).sort()).toEqual([
      "CONTRADICTING",
      "SUPPORTING",
    ]);
  });

  test("OUTDATED: only older evidence agrees, newer cited evidence disagrees", async () => {
    const old = publication("O", { year: 2008 });
    const recent = publication("R", {
      year: 2022,
      title: "A large fictional trial of aerobic exercise and blood pressure",
    });
    const ev = [
      evidence("O", RESULT),
      evidence(
        "R",
        "Aerobic exercise did not reduce systolic blood pressure in older adults (p = 0.55).",
      ),
    ];
    const r = await verifyClaim(input([citation(old), citation(recent)], ev));
    expect(r.verdict).toBe("OUTDATED");
    expect(r.explanation).toContain("2008");
    expect(r.explanation).toContain("2022");
    expect(r.humanReview.recommended).toBe(true);
  });

  test("NEEDS_HUMAN_REVIEW: abstract-only and on topic, but the finding is not reported", async () => {
    const ev = [
      evidence(
        "A",
        "We studied systolic blood pressure responses to aerobic exercise in 240 older adults.",
        {
          evidenceAvailability: "ABSTRACT",
          evidenceType: "ABSTRACT_FINDING",
        },
      ),
    ];
    const r = await verifyClaim(
      input(
        [citation(publication("A", { fullTextStatus: "NOT_OPEN_ACCESS" }))],
        ev,
      ),
    );
    expect(r.verdict).toBe("NEEDS_HUMAN_REVIEW");
    expect(r.reasonCode).toBe("INSUFFICIENT_EVIDENCE");
    expect(r.explanation).toContain("abstract only");
  });

  test("NEEDS_HUMAN_REVIEW: a claim without a comparable direction", async () => {
    const r = await verifyClaim(
      input(
        [citation(A)],
        [evidence("A", RESULT)],
        "Systolic blood pressure in older adults is a major public health concern [1].",
      ),
    );
    expect(r.verdict).toBe("NEEDS_HUMAN_REVIEW");
    expect(r.reasonCode).toBe("CLAIM_NOT_ANALYSABLE");
  });

  test("uncertain claim–citation links lower confidence and require review", async () => {
    const r = await verifyClaim(
      input(
        [citation(A, { linkStatus: "NEEDS_REVIEW", linkConfidence: 0.6 })],
        [evidence("A", RESULT)],
      ),
    );
    expect(r.verdict).toBe("SUPPORTED");
    expect(r.confidence).toBeLessThan(60);
    expect(r.humanReview.reasons.join(" ")).toContain(
      "claim–citation link is uncertain",
    );
  });

  test("evidence of publications the claim does not cite is ignored", async () => {
    const r = await verifyClaim(input([citation(A)], [evidence("Z", RESULT)]));
    expect(r.reasonCode).toBe("NO_EVIDENCE");
  });

  test("deterministic: same input, same output", async () => {
    const ev = [METHODS("A"), evidence("A", RESULT)];
    const a = await verifyClaim(input([citation(A)], ev));
    const b = await verifyClaim(input([citation(A)], ev));
    expect(a).toEqual(b);
  });
});

describe("AI strategy", () => {
  const ev = () => [
    evidence("A", RESULT),
    evidence("A", CONCLUSION, { evidenceType: "CONCLUSION" }),
  ];

  test("AI stances are validated: invented evidence ids are dropped", async () => {
    const items = ev();
    const provider: VerificationAiProvider = {
      name: "mock",
      assessEvidence: async () => [
        {
          evidenceId: items[0]?.id,
          stance: "AGREES",
          rationale: "same direction",
        },
        { evidenceId: "invented-id", stance: "AGREES" },
        { evidenceId: items[1]?.id, stance: "VERDICT_TRUE" },
      ],
    };
    const r = await verifyClaim(input([citation(A)], items), {
      strategy: createAiStrategy(provider),
    });
    expect(r.method).toBe("AI");
    expect(r.verdict).toBe("SUPPORTED");
    const ids = [
      ...r.supportingEvidence,
      ...r.contradictingEvidence,
      ...r.contextEvidence,
    ].map((e) => e.evidenceId);
    expect(ids).not.toContain("invented-id");
    expect(
      r.supportingEvidence
        .find((e) => e.evidenceId === items[0]?.id)
        ?.rationale.join(" "),
    ).toContain("AI (mock)");
  });

  test("AI and rules in opposite directions: neutral, human review", async () => {
    const items = ev();
    const provider: VerificationAiProvider = {
      name: "contrarian",
      assessEvidence: async ({ passages }) =>
        passages.map((p) => ({
          evidenceId: p.evidenceId,
          stance: "DISAGREES",
        })),
    };
    const r = await verifyClaim(input([citation(A)], items), {
      strategy: createAiStrategy(provider),
    });
    expect(r.verdict).not.toBe("CONTRADICTED");
    expect(
      r.contextEvidence.some((e) => e.flags.includes("AI_RULE_CONFLICT")),
    ).toBe(true);
    expect(r.humanReview.reasons.join(" ")).toContain(
      "AI and rule-based readings disagreed",
    );
  });

  test("provider failures surface as VerificationError", async () => {
    const provider: VerificationAiProvider = {
      name: "down",
      assessEvidence: async () => {
        throw new Error("network");
      },
    };
    expect(
      verifyClaim(input([citation(A)], ev()), {
        strategy: createAiStrategy(provider),
      }),
    ).rejects.toBeInstanceOf(VerificationError);
  });
});
