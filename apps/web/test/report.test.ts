import { describe, expect, test } from "bun:test";
import { reportMarkdown, slug } from "../src/lib/report.ts";
import type {
  Citation,
  DocumentDetail,
  DocumentVerification,
  VerificationResult,
} from "../src/lib/types.ts";

const result = {
  id: "r1",
  claimId: "c1",
  claim: {
    originalText: "Exercise lowers blood pressure (Smith, 2020).",
    pageNumber: 1,
    section: null,
  },
  verdict: "SUPPORTED",
  confidence: 62,
  explanation: "One passage reports the same direction.",
  evidenceSource: "ABSTRACT",
  supportingEvidence: [
    {
      publicationId: "p1",
      role: "SUPPORTING",
      sourceText: "Training reduced  systolic\npressure.",
    },
  ],
  contradictingEvidence: [],
  contextEvidence: [],
  publications: [{ id: "p1", title: "Exercise and BP" }],
  limitations: ["Abstract only."],
  humanReview: { recommended: true, reasons: ["Based on abstract text only."] },
} as unknown as VerificationResult;

const verification = {
  job: {
    id: "job1",
    method: "RULE_BASED",
    completedAt: "2026-11-19T10:00:00.000Z",
  },
  summary: {
    claims: 1,
    byVerdict: {
      SUPPORTED: 1,
      PARTIALLY_SUPPORTED: 0,
      UNSUPPORTED: 0,
      CONTRADICTED: 0,
      OUTDATED: 0,
      MISLEADING: 0,
      NEEDS_HUMAN_REVIEW: 0,
    },
    humanReviewRecommended: 1,
    averageConfidence: 62,
  },
  results: [result],
  disclaimer: "Automated assessment.",
} as unknown as DocumentVerification;

describe("reportMarkdown", () => {
  const md = reportMarkdown({
    document: { title: "Doc", originalFilename: "doc.pdf" } as DocumentDetail,
    verification,
    citations: [
      { citationText: "(Smith, 2020)", claims: [{ claimId: "c1" }] },
    ] as unknown as Citation[],
    generatedAt: new Date("2026-11-19T12:00:00.000Z"),
  });
  test("includes the disclaimer, all 7 verdict rows and totals", () => {
    expect(md).toContain("> Automated assessment.");
    expect(md.match(/^\| (?!Verdict|---|\*\*).+ \| \d+ \|$/gm)?.length).toBe(7);
    expect(md).toContain("| **Total** | **1** |");
  });
  test("quotes evidence verbatim (whitespace-normalised) with its publication", () => {
    expect(md).toContain(
      "**Supporting** (Exercise and BP): “Training reduced systolic pressure.”",
    );
    expect(md).toContain("- Citations: (Smith, 2020)");
    expect(md).toContain("recommended — Based on abstract text only.");
    expect(md).toContain("not in the claim");
  });
});

test("slug", () => {
  expect(slug("Lifestyle factors & Health!")).toBe("lifestyle-factors-health");
  expect(slug("***")).toBe("report");
});
