/**
 * The 7-stage processing journey, derived only from what the API reports.
 *
 * The backend's Document.status stays EXTRACTED after text extraction, so each
 * later stage is derived from its own endpoint (claims/citations counts,
 * per-reference retrieval status, per-publication evidence extraction, and the
 * verification job status).
 */
import { api } from "./api.ts";
import { mapLimit } from "./concurrency.ts";
import type {
  DocumentDetail,
  DocumentPublications,
  DocumentVerification,
  ExtractionResponse,
  VerificationStatus,
} from "./types.ts";

export type StageKey =
  | "uploaded"
  | "text"
  | "claims"
  | "citations"
  | "publications"
  | "evidence"
  | "verification";

export type StageState =
  | "complete"
  /** Finished, but the result needs a human look (partial extraction, review queue…). */
  | "attention"
  | "ready"
  | "running"
  | "failed"
  /** Waiting for an earlier stage. */
  | "blocked"
  /** Not applicable (e.g. no references → nothing to retrieve). */
  | "skipped";

export interface Stage {
  key: StageKey;
  label: string;
  state: StageState;
  detail: string;
  /** Present when the stage can be (re-)run from the UI. */
  action?: { label: string; rerun: boolean };
}

export const STAGE_LABELS: Record<StageKey, string> = {
  uploaded: "Uploaded",
  text: "Text extracted",
  claims: "Claims identified",
  citations: "Citations mapped",
  publications: "Publications retrieved",
  evidence: "Evidence extracted",
  verification: "Verification completed",
};

export interface EvidenceState {
  publicationId: string;
  evidenceExtractedAt: string | null;
  total: number;
}

export interface PipelineInput {
  document: DocumentDetail;
  extraction: ExtractionResponse["extraction"];
  publications: DocumentPublications | null;
  evidence: EvidenceState[];
  verificationStatus: VerificationStatus | null;
  /** Human-review count of the latest completed verification run. */
  reviewCount: number | null;
  /** Stages run in this browser session whose result is empty (e.g. 0 claims found). */
  ranEmpty?: Partial<Record<StageKey, boolean>>;
  /** Stage currently being run from the UI. */
  running?: StageKey | null;
}

const isDone = (s: Stage | undefined) =>
  s?.state === "complete" || s?.state === "attention";

export function derivePipeline(input: PipelineInput): Stage[] {
  const {
    document: doc,
    extraction,
    publications,
    evidence,
    verificationStatus,
    reviewCount,
  } = input;
  const ranEmpty = input.ranEmpty ?? {};
  const stages: Stage[] = [];
  const push = (s: Omit<Stage, "label">) => {
    const stage = { ...s, label: STAGE_LABELS[s.key] };
    if (input.running === s.key) stage.state = "running";
    stages.push(stage);
    return stage;
  };

  // 1. Uploaded
  push({ key: "uploaded", state: "complete", detail: doc.originalFilename });

  // 2. Text extracted
  const ex = extraction;
  const text = (() => {
    if (doc.status === "PROCESSING")
      return push({
        key: "text",
        state: "running",
        detail: "Parsing the document…",
      });
    if (!ex)
      return push({
        key: "text",
        state: "ready",
        detail: "Text has not been extracted yet.",
        action: { label: "Extract text", rerun: false },
      });
    const words = ex.result?.stats.wordCount ?? 0;
    const pages = ex.result?.totalPages;
    const summary = `${words.toLocaleString()} words${pages ? ` · ${pages} pages` : ""}`;
    if (ex.status === "COMPLETED")
      return push({
        key: "text",
        state: "complete",
        detail: summary,
        action: { label: "Re-extract", rerun: true },
      });
    if (ex.status === "PARTIAL")
      return push({
        key: "text",
        state: "attention",
        detail: `Partial extraction — ${summary}. Some pages had no extractable text.`,
        action: { label: "Re-extract", rerun: true },
      });
    return push({
      key: "text",
      state: "failed",
      detail:
        ex.errorMessage ??
        (ex.status === "EMPTY"
          ? "No extractable text (scanned documents need OCR, which is not supported)."
          : "Text extraction failed."),
      action: { label: "Retry extraction", rerun: true },
    });
  })();

  // 3. Claims identified
  const claims = (() => {
    if (!isDone(text))
      return push({
        key: "claims",
        state: "blocked",
        detail: "Waiting for text extraction.",
      });
    const n = doc.counts.claims;
    if (n > 0)
      return push({
        key: "claims",
        state: "complete",
        detail: `${n.toLocaleString()} claim${n === 1 ? "" : "s"} identified`,
        action: { label: "Re-run", rerun: true },
      });
    if (ranEmpty.claims)
      return push({
        key: "claims",
        state: "attention",
        detail: "No verifiable claims were found in the text.",
        action: { label: "Re-run", rerun: true },
      });
    return push({
      key: "claims",
      state: "ready",
      detail: "Identify the scientific claims in the text.",
      action: { label: "Identify claims", rerun: false },
    });
  })();

  // 4. Citations mapped (needs extracted text; claims are linked when present)
  const refs = doc.counts.references;
  const citations = (() => {
    if (!isDone(text))
      return push({
        key: "citations",
        state: "blocked",
        detail: "Waiting for text extraction.",
      });
    const c = doc.counts.citations;
    if (c > 0 || refs > 0)
      return push({
        key: "citations",
        state: refs === 0 ? "attention" : "complete",
        detail:
          refs === 0
            ? `${c} in-text citation${c === 1 ? "" : "s"}, but no reference list was detected.`
            : `${c.toLocaleString()} citation${c === 1 ? "" : "s"} · ${refs.toLocaleString()} reference${refs === 1 ? "" : "s"}`,
        action: { label: "Re-run", rerun: true },
      });
    if (ranEmpty.citations)
      return push({
        key: "citations",
        state: "attention",
        detail: "No citations or reference list were detected.",
        action: { label: "Re-run", rerun: true },
      });
    return push({
      key: "citations",
      state: "ready",
      detail: "Detect in-text citations and map them to the reference list.",
      action: { label: "Map citations", rerun: false },
    });
  })();

  // 5. Publications retrieved
  const rows = publications?.references ?? [];
  const pubCount = publications?.publications.length ?? 0;
  const pubs = (() => {
    if (!isDone(citations))
      return push({
        key: "publications",
        state: "blocked",
        detail: "Waiting for citation mapping.",
      });
    if (refs === 0)
      return push({
        key: "publications",
        state: "skipped",
        detail: "No references to look up.",
      });
    const attempted = rows.filter((r) => r.retrieval.status !== null);
    const failed = rows.filter((r) => r.retrieval.status === "FAILED").length;
    if (attempted.length === 0)
      return push({
        key: "publications",
        state: "ready",
        detail: `Look up ${refs} reference${refs === 1 ? "" : "s"} in Crossref and OpenAlex.`,
        action: { label: "Retrieve publications", rerun: false },
      });
    const summary = `${pubCount} of ${rows.length} reference${rows.length === 1 ? "" : "s"} matched to a publication`;
    if (failed > 0)
      return push({
        key: "publications",
        state: "attention",
        detail: `${summary}; ${failed} lookup${failed === 1 ? "" : "s"} failed (providers unreachable) — safe to retry.`,
        action: { label: "Retry failed", rerun: false },
      });
    if (attempted.length < rows.length)
      return push({
        key: "publications",
        state: "ready",
        detail: `${summary}; ${rows.length - attempted.length} not yet looked up.`,
        action: { label: "Retrieve remaining", rerun: false },
      });
    return push({
      key: "publications",
      state: pubCount === 0 ? "attention" : "complete",
      detail:
        pubCount === 0
          ? "No reference could be matched to a publication."
          : summary,
      action: { label: "Re-run all", rerun: true },
    });
  })();

  // 6. Evidence extracted
  (() => {
    if (!isDone(pubs) && pubs.state !== "skipped")
      return push({
        key: "evidence",
        state: "blocked",
        detail: "Waiting for publication retrieval.",
      });
    if (pubCount === 0)
      return push({
        key: "evidence",
        state: "skipped",
        detail: "No matched publications to read.",
      });
    const done = evidence.filter((e) => e.evidenceExtractedAt !== null);
    const passages = done.reduce((n, e) => n + e.total, 0);
    if (done.length === 0)
      return push({
        key: "evidence",
        state: "ready",
        detail: `Extract evidence passages from ${pubCount} publication${pubCount === 1 ? "" : "s"}.`,
        action: { label: "Extract evidence", rerun: false },
      });
    if (done.length < pubCount)
      return push({
        key: "evidence",
        state: "ready",
        detail: `${done.length} of ${pubCount} publications processed · ${passages} passages.`,
        action: { label: "Extract remaining", rerun: false },
      });
    return push({
      key: "evidence",
      state: passages === 0 ? "attention" : "complete",
      detail:
        passages === 0
          ? "No evidence passages could be extracted (no abstract or open-access full text)."
          : `${passages.toLocaleString()} passage${passages === 1 ? "" : "s"} from ${pubCount} publication${pubCount === 1 ? "" : "s"}`,
      action: { label: "Re-extract", rerun: true },
    });
  })();

  // 7. Verification completed
  (() => {
    if (!isDone(claims) || doc.counts.claims === 0)
      return push({
        key: "verification",
        state: "blocked",
        detail: "Waiting for claims.",
      });
    const job = verificationStatus?.latestJob ?? null;
    if (
      job &&
      (job.status === "RUNNING" || job.status === "PENDING") &&
      !job.stale
    )
      return push({
        key: "verification",
        state: "running",
        detail: `Verifying claims… ${job.processedClaims}/${job.totalClaims}`,
      });
    if (job?.status === "FAILED" || job?.stale)
      return push({
        key: "verification",
        state: "failed",
        detail: job.errorMessage ?? "The last verification run did not finish.",
        action: { label: "Retry verification", rerun: true },
      });
    if (!verificationStatus?.verified)
      return push({
        key: "verification",
        state: "ready",
        detail: "Assess each claim against its cited evidence.",
        action: { label: "Verify claims", rerun: false },
      });
    const review = reviewCount ?? 0;
    return push({
      key: "verification",
      state: review > 0 ? "attention" : "complete",
      detail:
        review > 0
          ? `${review} claim${review === 1 ? "" : "s"} recommended for human review`
          : "All claims assessed; none flagged for review.",
      action: { label: "Re-verify", rerun: true },
    });
  })();

  return stages;
}

/** Index of the first stage the user should act on (or -1 when nothing is pending). */
export function nextStageIndex(stages: Stage[]): number {
  return stages.findIndex((s) => s.state === "ready" || s.state === "failed");
}

export function progressOf(stages: Stage[]): { done: number; total: number } {
  const applicable = stages.filter((s) => s.state !== "skipped");
  return { done: applicable.filter(isDone).length, total: applicable.length };
}

export interface PipelineData
  extends Omit<PipelineInput, "ranEmpty" | "running"> {
  verification: DocumentVerification | null;
}

/** Loads every input of the pipeline for one document. */
export async function loadPipeline(documentId: string): Promise<PipelineData> {
  const [{ document }, extraction, verificationStatus] = await Promise.all([
    api.documents.get(documentId),
    api.documents.extraction(documentId).then((r) => r.extraction),
    api.documents.verificationStatus(documentId),
  ]);
  const publications =
    document.counts.references > 0
      ? await api.documents.publications(documentId)
      : null;
  const evidence = await mapLimit(
    publications?.publications ?? [],
    4,
    async (p) => {
      const r = await api.publications.evidence(p.id);
      return {
        publicationId: p.id,
        evidenceExtractedAt: r.publication.evidenceExtractedAt,
        total: r.total,
      };
    },
  );
  const verification = verificationStatus.verified
    ? await api.documents.verification(documentId)
    : null;
  return {
    document,
    extraction,
    publications,
    evidence,
    verificationStatus,
    verification,
    reviewCount: verification?.summary.humanReviewRecommended ?? null,
  };
}

/**
 * Furthest stage reached, from list-level data only (document status, counts,
 * verification). Used by lists where loading the full pipeline per row would be costly.
 */
export function furthestStage(
  doc: Pick<DocumentDetail, "status" | "counts">,
  verified: boolean,
): {
  label: string;
  tone: "neutral" | "primary" | "teal" | "success" | "danger";
  step: number;
} {
  if (doc.status === "FAILED")
    return { label: "Extraction failed", tone: "danger", step: 1 };
  if (doc.status === "PROCESSING")
    return { label: "Extracting text…", tone: "primary", step: 1 };
  if (verified) return { label: "Verified", tone: "success", step: 7 };
  if (doc.counts.references > 0 || doc.counts.citations > 0)
    return { label: "Citations mapped", tone: "teal", step: 4 };
  if (doc.counts.claims > 0)
    return { label: "Claims identified", tone: "teal", step: 3 };
  if (doc.status === "EXTRACTED" || doc.status === "COMPLETED")
    return { label: "Text extracted", tone: "teal", step: 2 };
  return { label: "Uploaded", tone: "neutral", step: 1 };
}
