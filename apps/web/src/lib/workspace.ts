/**
 * Cross-document aggregation. The API has no aggregate/dashboard endpoint, so
 * the workspace view is assembled from per-document requests (document detail
 * and latest verification run). Every number shown is computed from these
 * real responses.
 */

import type { Verdict } from "@citeverify/shared";
import { api } from "./api.ts";
import { mapLimit } from "./concurrency.ts";
import { CONFIDENCE_BUCKETS, VERDICT_ORDER } from "./domain.ts";
import type {
  Citation,
  Claim,
  DocumentDetail,
  DocumentSummary,
  DocumentVerification,
  Publication,
  VerificationResult,
} from "./types.ts";

export interface WorkspaceDoc {
  document: DocumentDetail;
  verification: DocumentVerification | null;
}

export interface Workspace {
  docs: WorkspaceDoc[];
  total: number;
  /** Documents whose details could not be loaded (shown as a warning). */
  failed: DocumentSummary[];
}

const PAGE = 100;
const MAX_DOCS = 500;

export async function listAllDocuments(): Promise<{
  items: DocumentSummary[];
  total: number;
}> {
  const first = await api.documents.list(1, PAGE);
  const items = [...first.items];
  let page = 1;
  while (items.length < Math.min(first.total, MAX_DOCS)) {
    page += 1;
    const next = await api.documents.list(page, PAGE);
    if (next.items.length === 0) break;
    items.push(...next.items);
  }
  return { items, total: first.total };
}

export async function loadWorkspace(): Promise<Workspace> {
  const { items, total } = await listAllDocuments();
  const failed: DocumentSummary[] = [];
  const loaded = await mapLimit(items, 4, async (summary) => {
    try {
      const { document } = await api.documents.get(summary.id);
      const verification =
        document.counts.claims > 0
          ? await api.documents.verification(summary.id)
          : null;
      return {
        document,
        verification: verification?.job ? verification : null,
      };
    } catch {
      failed.push(summary);
      return null;
    }
  });
  return {
    docs: loaded.filter((d): d is WorkspaceDoc => d !== null),
    total,
    failed,
  };
}

export interface WorkspaceStats {
  documents: number;
  claims: number;
  citations: number;
  references: number;
  claimsVerified: number;
  needsReview: number;
  verifiedDocuments: number;
  averageConfidence: number | null;
}

export function workspaceStats(ws: Workspace): WorkspaceStats {
  let claims = 0;
  let citations = 0;
  let references = 0;
  let claimsVerified = 0;
  let needsReview = 0;
  let verifiedDocuments = 0;
  let confSum = 0;
  for (const { document, verification } of ws.docs) {
    claims += document.counts.claims;
    citations += document.counts.citations;
    references += document.counts.references;
    if (verification?.job) {
      verifiedDocuments += 1;
      claimsVerified += verification.results.length;
      needsReview += verification.summary.humanReviewRecommended;
      for (const r of verification.results) confSum += r.confidence;
    }
  }
  return {
    documents: ws.total,
    claims,
    citations,
    references,
    claimsVerified,
    needsReview,
    verifiedDocuments,
    averageConfidence:
      claimsVerified > 0 ? Math.round(confSum / claimsVerified) : null,
  };
}

export interface ResultWithDoc extends VerificationResult {
  document: { id: string; title: string };
}

export function allResults(ws: Workspace): ResultWithDoc[] {
  return ws.docs.flatMap(({ document, verification }) =>
    (verification?.results ?? []).map((r) => ({
      ...r,
      document: { id: document.id, title: document.title },
    })),
  );
}

export function verdictDistribution(
  results: VerificationResult[],
): Array<{ verdict: Verdict; count: number }> {
  const counts = new Map<Verdict, number>(VERDICT_ORDER.map((v) => [v, 0]));
  for (const r of results)
    counts.set(r.verdict, (counts.get(r.verdict) ?? 0) + 1);
  return VERDICT_ORDER.map((verdict) => ({
    verdict,
    count: counts.get(verdict) ?? 0,
  }));
}

export function confidenceDistribution(
  results: VerificationResult[],
): Array<{ bucket: string; count: number }> {
  return CONFIDENCE_BUCKETS.map((b) => ({
    bucket: b.key,
    count: results.filter((r) => r.confidence >= b.min && r.confidence <= b.max)
      .length,
  }));
}

/**
 * Evidence availability: for each publication assessed in the latest runs
 * (de-duplicated), what content the verifier could read.
 */
export function evidenceAvailability(
  results: VerificationResult[],
): Array<{ source: string; publications: number; passages: number }> {
  const pubSource = new Map<string, string>();
  const passages = { FULL_TEXT: 0, ABSTRACT: 0 } as Record<string, number>;
  for (const r of results) {
    for (const p of r.publications) {
      const prev = pubSource.get(p.id);
      if (
        !prev ||
        prev === "NONE" ||
        (prev === "ABSTRACT" && p.evidenceSource !== "NONE")
      )
        pubSource.set(p.id, p.evidenceSource);
    }
    for (const e of [
      ...r.supportingEvidence,
      ...r.contradictingEvidence,
      ...r.contextEvidence,
    ]) {
      if (e.evidenceAvailability === "FULL_TEXT")
        passages.FULL_TEXT = (passages.FULL_TEXT ?? 0) + 1;
      else if (e.evidenceAvailability === "ABSTRACT")
        passages.ABSTRACT = (passages.ABSTRACT ?? 0) + 1;
    }
  }
  const byPub = { FULL_TEXT: 0, ABSTRACT: 0, MIXED: 0, NONE: 0 } as Record<
    string,
    number
  >;
  for (const s of pubSource.values()) byPub[s] = (byPub[s] ?? 0) + 1;
  return [
    {
      source: "Full text",
      publications: (byPub.FULL_TEXT ?? 0) + (byPub.MIXED ?? 0),
      passages: passages.FULL_TEXT ?? 0,
    },
    {
      source: "Abstract only",
      publications: byPub.ABSTRACT ?? 0,
      passages: passages.ABSTRACT ?? 0,
    },
    { source: "No content", publications: byPub.NONE ?? 0, passages: 0 },
  ];
}

/** Day key in the user's local time zone (YYYY-MM-DD). */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Research activity per day over the last `days` days: documents uploaded and
 * claims verified (results of the latest runs, by result creation time).
 */
export function activitySeries(
  ws: Workspace,
  days = 14,
  now = new Date(),
): Array<{ day: string; label: string; uploads: number; verified: number }> {
  const series: Array<{
    day: string;
    label: string;
    uploads: number;
    verified: number;
  }> = [];
  const index = new Map<string, number>();
  const labelFmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = dayKey(d.toISOString());
    index.set(key, series.length);
    series.push({
      day: key,
      label: labelFmt.format(d),
      uploads: 0,
      verified: 0,
    });
  }
  for (const { document, verification } of ws.docs) {
    const u = index.get(dayKey(document.createdAt));
    if (u !== undefined && series[u]) series[u].uploads += 1;
    for (const r of verification?.results ?? []) {
      const v = index.get(dayKey(r.createdAt));
      if (v !== undefined && series[v]) series[v].verified += 1;
    }
  }
  return series;
}

// ── cross-document grids ─────────────────────────────────────────────────────

export interface ClaimRow extends Claim {
  document: { id: string; title: string };
  verdict: Verdict | null;
  verificationConfidence: number | null;
  needsReview: boolean;
  citationCount: number;
}

export interface CitationRow extends Citation {
  document: { id: string; title: string };
}

export interface DocData {
  document: DocumentSummary;
  claims: Claim[];
  citations: Citation[];
  verification: DocumentVerification | null;
}

/** Claims, citations and the latest verification of the given documents. */
export async function loadDocData(docs: DocumentSummary[]): Promise<DocData[]> {
  return mapLimit(docs, 4, async (document) => {
    const [claims, citations, verification] = await Promise.all([
      api.documents.claims(document.id).then((r) => r.claims),
      api.documents.citations(document.id).then((r) => r.citations),
      api.documents.verification(document.id).then((v) => (v.job ? v : null)),
    ]);
    return { document, claims, citations, verification };
  });
}

export function claimRows(data: DocData[]): ClaimRow[] {
  return data.flatMap(({ document, claims, citations, verification }) => {
    const byClaim = new Map(
      verification?.results.map((r) => [r.claimId, r]) ?? [],
    );
    const citeCount = new Map<string, number>();
    for (const c of citations)
      for (const l of c.claims)
        citeCount.set(l.claimId, (citeCount.get(l.claimId) ?? 0) + 1);
    return claims.map((c) => {
      const r = byClaim.get(c.id);
      return {
        ...c,
        document: { id: document.id, title: document.title },
        verdict: r?.verdict ?? null,
        verificationConfidence: r?.confidence ?? null,
        needsReview: r?.humanReview.recommended ?? false,
        citationCount: citeCount.get(c.id) ?? 0,
      };
    });
  });
}

export function citationRows(data: DocData[]): CitationRow[] {
  return data.flatMap(({ document, citations }) =>
    citations.map((c) => ({
      ...c,
      document: { id: document.id, title: document.title },
    })),
  );
}

export interface PublicationRow extends Publication {
  documents: Array<{ id: string; title: string }>;
  referenceCount: number;
}

/** Retrieved publications across documents (de-duplicated by publication id). */
export async function loadPublications(
  docs: DocumentSummary[],
): Promise<PublicationRow[]> {
  const perDoc = await mapLimit(docs, 4, async (d) => ({
    d,
    res: await api.documents.publications(d.id),
  }));
  const byId = new Map<string, PublicationRow>();
  for (const { d, res } of perDoc) {
    for (const row of res.references) {
      const p = row.publication;
      if (!p) continue;
      const existing = byId.get(p.id);
      if (existing) {
        existing.referenceCount += 1;
        if (!existing.documents.some((x) => x.id === d.id))
          existing.documents.push({ id: d.id, title: d.title });
      } else {
        byId.set(p.id, {
          ...p,
          documents: [{ id: d.id, title: d.title }],
          referenceCount: 1,
        });
      }
    }
  }
  return [...byId.values()];
}
