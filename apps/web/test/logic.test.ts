import { describe, expect, test } from "bun:test";
import {
  confidenceLabel,
  VERDICT_ORDER,
  verdictMeta,
} from "../src/lib/domain.ts";
import {
  formatBytes,
  highlightParts,
  humanize,
  initials,
  keyTerms,
} from "../src/lib/format.ts";
import type { VerificationResult } from "../src/lib/types.ts";
import { validateFile } from "../src/lib/upload.ts";
import {
  activitySeries,
  confidenceDistribution,
  evidenceAvailability,
  verdictDistribution,
  type Workspace,
  workspaceStats,
} from "../src/lib/workspace.ts";

const upload = {
  maxBytes: 10 * 1024 * 1024,
  extensions: [".pdf", ".docx"],
  mimeTypes: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
};

describe("validateFile (mirrors GET /api/config limits)", () => {
  test("accepts PDF and DOCX within the limit", () => {
    expect(
      validateFile(
        { name: "a.PDF", size: 100, type: "application/pdf" },
        upload,
      ),
    ).toBeNull();
    expect(
      validateFile(
        { name: "b.docx", size: 100, type: upload.mimeTypes[1] as string },
        upload,
      ),
    ).toBeNull();
    expect(
      validateFile({ name: "c.pdf", size: 100, type: "" }, upload),
    ).toBeNull();
  });
  test("rejects other types, empty and oversized files", () => {
    expect(
      validateFile({ name: "notes.txt", size: 10, type: "text/plain" }, upload),
    ).toContain("Unsupported file type (.txt)");
    expect(
      validateFile({ name: "noext", size: 10, type: "" }, upload),
    ).toContain("Unsupported file type");
    expect(
      validateFile({ name: "x.pdf", size: 10, type: "image/png" }, upload),
    ).toContain("image/png");
    expect(
      validateFile({ name: "x.pdf", size: 0, type: "application/pdf" }, upload),
    ).toBe("The file is empty.");
    expect(
      validateFile(
        { name: "x.pdf", size: 11 * 1024 * 1024, type: "application/pdf" },
        upload,
      ),
    ).toContain("limit is 10.0 MB");
  });
});

const result = (over: Partial<VerificationResult>): VerificationResult => ({
  id: "r",
  jobId: "j",
  claimId: "c",
  claim: { originalText: "X reduces Y.", pageNumber: 1, section: null },
  verdict: "SUPPORTED",
  confidence: 50,
  explanation: "",
  reasonCode: null,
  evidenceSummary: null,
  evidenceSource: "ABSTRACT",
  verificationScope: "LIMITED",
  supportingEvidence: [],
  contradictingEvidence: [],
  contextEvidence: [],
  publications: [],
  unresolvedCitations: [],
  limitations: [],
  humanReview: { recommended: false, reasons: [] },
  method: "RULE_BASED",
  strategy: null,
  rulesApplied: [],
  assessmentType: "AUTOMATED",
  disclaimer: "",
  createdAt: "2026-11-19T10:00:00.000Z",
  ...over,
});

describe("workspace aggregation", () => {
  const results = [
    result({ id: "1", verdict: "SUPPORTED", confidence: 81 }),
    result({
      id: "2",
      verdict: "CONTRADICTED",
      confidence: 40,
      humanReview: { recommended: true, reasons: [] },
    }),
    result({
      id: "3",
      verdict: "NEEDS_HUMAN_REVIEW",
      confidence: 10,
      humanReview: { recommended: true, reasons: [] },
    }),
  ];
  const ws: Workspace = {
    total: 2,
    failed: [],
    docs: [
      {
        document: {
          id: "a",
          title: "A",
          originalFilename: "a.pdf",
          fileType: "application/pdf",
          fileSize: 1,
          status: "EXTRACTED",
          createdAt: "2026-11-19T09:00:00.000Z",
          updatedAt: "",
          counts: { claims: 3, citations: 4, references: 2 },
          latestJob: null,
        },
        verification: {
          job: {
            id: "j",
            status: "COMPLETED",
            stage: null,
            method: "RULE_BASED",
            totalClaims: 3,
            processedClaims: 3,
            errorMessage: null,
            startedAt: null,
            completedAt: null,
            createdAt: "",
          },
          summary: {
            claims: 3,
            byVerdict: {} as never,
            humanReviewRecommended: 2,
            averageConfidence: 44,
          },
          results,
          reason: null,
          assessmentType: "AUTOMATED",
          disclaimer: "",
        },
      },
      {
        document: {
          id: "b",
          title: "B",
          originalFilename: "b.pdf",
          fileType: "application/pdf",
          fileSize: 1,
          status: "UPLOADED",
          createdAt: "2026-11-18T09:00:00.000Z",
          updatedAt: "",
          counts: { claims: 0, citations: 0, references: 0 },
          latestJob: null,
        },
        verification: null,
      },
    ],
  };

  test("stats sum counts and verification results", () => {
    expect(workspaceStats(ws)).toEqual({
      documents: 2,
      claims: 3,
      citations: 4,
      references: 2,
      claimsVerified: 3,
      needsReview: 2,
      verifiedDocuments: 1,
      averageConfidence: 44,
    });
  });

  test("verdict distribution lists all seven verdicts in order", () => {
    const d = verdictDistribution(results);
    expect(d.map((x) => x.verdict)).toEqual(VERDICT_ORDER);
    expect(d.find((x) => x.verdict === "SUPPORTED")?.count).toBe(1);
    expect(d.find((x) => x.verdict === "OUTDATED")?.count).toBe(0);
  });

  test("confidence histogram buckets 0–100", () => {
    expect(confidenceDistribution(results).map((b) => b.count)).toEqual([
      1, 0, 1, 0, 1,
    ]);
  });

  test("evidence availability de-duplicates publications and counts passages", () => {
    const pub = (
      id: string,
      evidenceSource: "FULL_TEXT" | "ABSTRACT" | "NONE",
    ) => ({ id, evidenceSource }) as VerificationResult["publications"][number];
    const ev = (availability: "FULL_TEXT" | "ABSTRACT") =>
      ({
        evidenceAvailability: availability,
      }) as VerificationResult["supportingEvidence"][number];
    const rows = evidenceAvailability([
      result({
        publications: [pub("p1", "FULL_TEXT"), pub("p2", "ABSTRACT")],
        supportingEvidence: [ev("FULL_TEXT"), ev("ABSTRACT")],
      }),
      result({
        publications: [pub("p1", "FULL_TEXT"), pub("p3", "NONE")],
        contextEvidence: [ev("FULL_TEXT")],
      }),
    ]);
    expect(rows).toEqual([
      { source: "Full text", publications: 1, passages: 2 },
      { source: "Abstract only", publications: 1, passages: 1 },
      { source: "No content", publications: 1, passages: 0 },
    ]);
  });

  test("activity series counts uploads and verified claims per local day", () => {
    const series = activitySeries(ws, 3, new Date("2026-11-19T12:00:00"));
    expect(series).toHaveLength(3);
    const total = series.reduce((n, d) => n + d.uploads, 0);
    expect(total).toBe(2);
    expect(series.reduce((n, d) => n + d.verified, 0)).toBe(3);
  });
});

describe("formatting & domain", () => {
  test("bytes, humanize, initials", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10.0 MB");
    expect(humanize("NEEDS_HUMAN_REVIEW")).toBe("Needs human review");
    expect(initials("Ada Lovelace King")).toBe("AK");
    expect(initials("  ")).toBe("?");
  });
  test("highlighting only marks real matches and escapes regex characters", () => {
    expect(
      highlightParts("Blood pressure fell (p < 0.05).", [
        "pressure",
        "(p <",
        "ab",
      ]),
    ).toEqual([
      { text: "Blood ", match: false },
      { text: "pressure", match: true },
      { text: " fell ", match: false },
      { text: "(p <", match: true },
      { text: " 0.05).", match: false },
    ]);
    expect(highlightParts("abc", [])).toEqual([{ text: "abc", match: false }]);
  });
  test("key terms drop stop words and citation markers", () => {
    expect(
      keyTerms(
        "Aerobic exercise reduces blood pressure in adults (Smith et al., 2020).",
      ),
    ).toEqual([
      "aerobic",
      "exercise",
      "reduces",
      "blood",
      "pressure",
      "adults",
    ]);
  });
  test("confidence wording never implies certainty", () => {
    expect(confidenceLabel(95)).toBe("Higher confidence");
    expect(confidenceLabel(10)).toBe("Very low confidence");
    expect(verdictMeta("UNKNOWN").label).toBe("Needs human review");
  });
});
