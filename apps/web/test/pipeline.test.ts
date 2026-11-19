import { describe, expect, test } from "bun:test";
import {
  derivePipeline,
  furthestStage,
  nextStageIndex,
  type PipelineInput,
  progressOf,
} from "../src/lib/pipeline.ts";
import type {
  DocumentDetail,
  DocumentPublications,
  ExtractionResponse,
  VerificationStatus,
} from "../src/lib/types.ts";

const doc = (over: Partial<DocumentDetail> = {}): DocumentDetail => ({
  id: "d1",
  title: "Paper",
  originalFilename: "paper.pdf",
  fileType: "application/pdf",
  fileSize: 1000,
  status: "EXTRACTED",
  createdAt: "2026-11-19T10:00:00.000Z",
  updatedAt: "2026-11-19T10:00:00.000Z",
  counts: { claims: 0, citations: 0, references: 0 },
  latestJob: null,
  ...over,
});

const extraction = (
  status: "COMPLETED" | "PARTIAL" | "EMPTY" | "FAILED",
  errorMessage: string | null = null,
): ExtractionResponse["extraction"] => ({
  status,
  errorCode: null,
  errorMessage,
  extractedAt: "2026-11-19T10:00:00.000Z",
  result:
    status === "FAILED"
      ? null
      : {
          format: "pdf",
          title: null,
          authors: [],
          abstract: null,
          totalPages: 2,
          pages: [],
          paragraphs: [],
          warnings: [],
          stats: { paragraphCount: 2, wordCount: 120, characterCount: 700 },
        },
});

const pubs = (
  rows: Array<{ status: string | null; pub: boolean }>,
): DocumentPublications => {
  const publications = rows
    .map((r, i) => (r.pub ? { id: `p${i}`, title: `Pub ${i}` } : null))
    .filter(
      (p): p is { id: string; title: string } => p !== null,
    ) as unknown as DocumentPublications["publications"];
  return {
    references: rows.map((r, i) => ({
      reference: {
        id: `r${i}`,
      } as DocumentPublications["references"][number]["reference"],
      retrieval: {
        status: r.status as never,
        confidence: null,
        method: null,
        retrievedAt: null,
        errors: [],
      },
      publication: r.pub
        ? ({ id: `p${i}` } as DocumentPublications["publications"][number])
        : null,
      candidates: [],
    })),
    publications,
    total: rows.length,
    note: "",
  };
};

const status = (
  over: Partial<VerificationStatus> = {},
): VerificationStatus => ({
  documentId: "d1",
  verified: false,
  latestJob: null,
  latestCompletedJobId: null,
  lastVerifiedAt: null,
  ...over,
});

const base = (over: Partial<PipelineInput> = {}): PipelineInput => ({
  document: doc(),
  extraction: null,
  publications: null,
  evidence: [],
  verificationStatus: status(),
  reviewCount: null,
  ...over,
});

const states = (input: PipelineInput) =>
  Object.fromEntries(derivePipeline(input).map((s) => [s.key, s.state]));

describe("derivePipeline", () => {
  test("returns the seven stages in order", () => {
    expect(derivePipeline(base()).map((s) => s.label)).toEqual([
      "Uploaded",
      "Text extracted",
      "Claims identified",
      "Citations mapped",
      "Publications retrieved",
      "Evidence extracted",
      "Verification completed",
    ]);
  });

  test("a fresh upload is ready for text extraction and everything else waits", () => {
    const s = states(base({ document: doc({ status: "UPLOADED" }) }));
    expect(s).toMatchObject({
      uploaded: "complete",
      text: "ready",
      claims: "blocked",
      citations: "blocked",
      verification: "blocked",
    });
    expect(
      nextStageIndex(
        derivePipeline(base({ document: doc({ status: "UPLOADED" }) })),
      ),
    ).toBe(1);
  });

  test("failed and empty extractions are failures with the server message", () => {
    const failed = derivePipeline(
      base({
        document: doc({ status: "FAILED" }),
        extraction: extraction("FAILED", "Encrypted PDF"),
      }),
    );
    expect(failed[1]?.state).toBe("failed");
    expect(failed[1]?.detail).toBe("Encrypted PDF");
    expect(failed[2]?.state).toBe("blocked");
    const empty = derivePipeline(base({ extraction: extraction("EMPTY") }));
    expect(empty[1]?.state).toBe("failed");
    expect(empty[1]?.detail).toContain("OCR");
  });

  test("partial extraction is usable but needs attention", () => {
    const s = states(base({ extraction: extraction("PARTIAL") }));
    expect(s.text).toBe("attention");
    expect(s.claims).toBe("ready");
  });

  test("claims stage is complete when the API reports claims; empty runs are only known in-session", () => {
    expect(
      states(
        base({
          extraction: extraction("COMPLETED"),
          document: doc({ counts: { claims: 3, citations: 0, references: 0 } }),
        }),
      ).claims,
    ).toBe("complete");
    expect(states(base({ extraction: extraction("COMPLETED") })).claims).toBe(
      "ready",
    );
    expect(
      states(
        base({
          extraction: extraction("COMPLETED"),
          ranEmpty: { claims: true },
        }),
      ).claims,
    ).toBe("attention");
  });

  test("no references → publication retrieval and evidence are not applicable", () => {
    const s = states(
      base({
        extraction: extraction("COMPLETED"),
        document: doc({ counts: { claims: 2, citations: 2, references: 0 } }),
      }),
    );
    expect(s.citations).toBe("attention");
    expect(s.publications).toBe("skipped");
    expect(s.evidence).toBe("skipped");
    expect(s.verification).toBe("ready");
  });

  test("publication retrieval tracks per-reference status and failed lookups", () => {
    const d = doc({ counts: { claims: 2, citations: 2, references: 2 } });
    const ready = derivePipeline(
      base({
        extraction: extraction("COMPLETED"),
        document: d,
        publications: pubs([
          { status: null, pub: false },
          { status: null, pub: false },
        ]),
      }),
    );
    expect(ready[4]?.state).toBe("ready");
    const failed = derivePipeline(
      base({
        extraction: extraction("COMPLETED"),
        document: d,
        publications: pubs([
          { status: "MATCHED", pub: true },
          { status: "FAILED", pub: false },
        ]),
      }),
    );
    expect(failed[4]?.state).toBe("attention");
    expect(failed[4]?.detail).toContain("1 lookup failed");
    const done = derivePipeline(
      base({
        extraction: extraction("COMPLETED"),
        document: d,
        publications: pubs([
          { status: "MATCHED", pub: true },
          { status: "NOT_FOUND", pub: false },
        ]),
      }),
    );
    expect(done[4]?.state).toBe("complete");
    expect(done[4]?.detail).toBe("1 of 2 references matched to a publication");
  });

  test("evidence stage counts publications with evidenceExtractedAt", () => {
    const d = doc({ counts: { claims: 2, citations: 2, references: 2 } });
    const p = pubs([
      { status: "MATCHED", pub: true },
      { status: "MATCHED", pub: true },
    ]);
    const partial = derivePipeline(
      base({
        extraction: extraction("COMPLETED"),
        document: d,
        publications: p,
        evidence: [
          { publicationId: "p0", evidenceExtractedAt: "x", total: 4 },
          { publicationId: "p1", evidenceExtractedAt: null, total: 0 },
        ],
      }),
    );
    expect(partial[5]?.state).toBe("ready");
    expect(partial[5]?.detail).toContain("1 of 2");
    const done = derivePipeline(
      base({
        extraction: extraction("COMPLETED"),
        document: d,
        publications: p,
        evidence: [
          { publicationId: "p0", evidenceExtractedAt: "x", total: 4 },
          { publicationId: "p1", evidenceExtractedAt: "y", total: 2 },
        ],
      }),
    );
    expect(done[5]?.state).toBe("complete");
    expect(done[5]?.detail).toBe("6 passages from 2 publications");
  });

  test("verification reflects the job status and the review queue", () => {
    const d = doc({ counts: { claims: 2, citations: 0, references: 0 } });
    const job = {
      id: "j",
      status: "RUNNING" as const,
      stage: "VERIFYING" as const,
      method: "RULE_BASED",
      totalClaims: 2,
      processedClaims: 1,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: "",
      stale: false,
    };
    expect(
      states(
        base({
          extraction: extraction("COMPLETED"),
          document: d,
          verificationStatus: status({ latestJob: job }),
        }),
      ).verification,
    ).toBe("running");
    const failed = derivePipeline(
      base({
        extraction: extraction("COMPLETED"),
        document: d,
        verificationStatus: status({
          latestJob: { ...job, status: "FAILED", errorMessage: "boom" },
        }),
      }),
    );
    expect(failed[6]?.state).toBe("failed");
    expect(failed[6]?.detail).toBe("boom");
    const stale = derivePipeline(
      base({
        extraction: extraction("COMPLETED"),
        document: d,
        verificationStatus: status({ latestJob: { ...job, stale: true } }),
      }),
    );
    expect(stale[6]?.state).toBe("failed");
    const review = derivePipeline(
      base({
        extraction: extraction("COMPLETED"),
        document: d,
        verificationStatus: status({
          verified: true,
          latestJob: { ...job, status: "COMPLETED" },
        }),
        reviewCount: 2,
      }),
    );
    expect(review[6]?.state).toBe("attention");
    expect(review[6]?.detail).toBe("2 claims recommended for human review");
    const clean = derivePipeline(
      base({
        extraction: extraction("COMPLETED"),
        document: d,
        verificationStatus: status({
          verified: true,
          latestJob: { ...job, status: "COMPLETED" },
        }),
        reviewCount: 0,
      }),
    );
    expect(clean[6]?.state).toBe("complete");
  });

  test("a stage running from the UI is shown as running", () => {
    expect(
      states(base({ extraction: extraction("COMPLETED"), running: "claims" }))
        .claims,
    ).toBe("running");
  });

  test("progress ignores non-applicable stages", () => {
    const stages = derivePipeline(
      base({
        extraction: extraction("COMPLETED"),
        document: doc({ counts: { claims: 2, citations: 2, references: 0 } }),
      }),
    );
    expect(progressOf(stages)).toEqual({ done: 4, total: 5 });
  });
});

describe("furthestStage", () => {
  test("derives the list label from counts because the API status stays EXTRACTED", () => {
    expect(furthestStage(doc(), false).label).toBe("Text extracted");
    expect(
      furthestStage(
        doc({ counts: { claims: 1, citations: 0, references: 0 } }),
        false,
      ).label,
    ).toBe("Claims identified");
    expect(
      furthestStage(
        doc({ counts: { claims: 1, citations: 1, references: 1 } }),
        false,
      ).label,
    ).toBe("Citations mapped");
    expect(
      furthestStage(
        doc({ counts: { claims: 1, citations: 1, references: 1 } }),
        true,
      ).label,
    ).toBe("Verified");
    expect(furthestStage(doc({ status: "FAILED" }), false).tone).toBe("danger");
    expect(furthestStage(doc({ status: "UPLOADED" }), false).label).toBe(
      "Uploaded",
    );
  });
});
