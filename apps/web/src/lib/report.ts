/**
 * Client-side report assembly. The API has no report generation or export
 * endpoint (`features.reportExport: false`), so a report is built in the
 * browser from stored verification results — nothing is added or inferred.
 */
import { VERDICT_ORDER, VERDICTS } from "./domain.ts";
import type {
  Citation,
  DocumentDetail,
  DocumentVerification,
} from "./types.ts";

export interface ReportInput {
  document: DocumentDetail;
  verification: DocumentVerification;
  citations: Citation[];
  generatedAt: Date;
}

const quote = (s: string) => s.replace(/\s+/g, " ").trim();

export function reportMarkdown({
  document,
  verification,
  citations,
  generatedAt,
}: ReportInput): string {
  const { job, summary, results } = verification;
  const citesByClaim = new Map<string, string[]>();
  for (const c of citations)
    for (const l of c.claims)
      citesByClaim.set(l.claimId, [
        ...(citesByClaim.get(l.claimId) ?? []),
        c.citationText,
      ]);
  const lines: string[] = [
    `# Citation verification report — ${document.title}`,
    "",
    `- File: ${document.originalFilename}`,
    `- Verification run: ${job?.id ?? "—"} (${job?.method ?? "—"}), completed ${job?.completedAt ?? "—"}`,
    `- Report assembled: ${generatedAt.toISOString()} (in the browser, from stored results)`,
    "",
    `> ${quote(verification.disclaimer)}`,
    "",
    "## Summary",
    "",
    "| Verdict | Claims |",
    "| --- | ---: |",
    ...VERDICT_ORDER.map(
      (v) => `| ${VERDICTS[v].label} | ${summary.byVerdict[v] ?? 0} |`,
    ),
    `| **Total** | **${summary.claims}** |`,
    "",
    `Human review recommended for ${summary.humanReviewRecommended} of ${summary.claims} claims.` +
      (summary.averageConfidence !== null
        ? ` Average assessment confidence: ${Math.round(summary.averageConfidence)}/100 (confidence in the automated assessment, not in the claim).`
        : ""),
    "",
    "## Claims",
  ];
  results.forEach((r, i) => {
    lines.push(
      "",
      `### ${i + 1}. ${VERDICTS[r.verdict].label}`,
      "",
      `> ${quote(r.claim.originalText)}`,
      "",
      `- Citations: ${(citesByClaim.get(r.claimId) ?? []).join("; ") || "none linked"}`,
      `- Assessment confidence: ${r.confidence}/100`,
      `- Evidence source: ${r.evidenceSource}`,
      `- Human review: ${r.humanReview.recommended ? `recommended — ${r.humanReview.reasons.join(" ")}` : "not flagged"}`,
      "",
      r.explanation,
    );
    const passages = [
      ...r.supportingEvidence.map((e) => ["Supporting", e] as const),
      ...r.contradictingEvidence.map((e) => ["Contradicting", e] as const),
    ];
    if (passages.length) {
      lines.push("", "Evidence passages (verbatim):");
      for (const [role, e] of passages) {
        const title = r.publications.find(
          (p) => p.id === e.publicationId,
        )?.title;
        lines.push(
          `- **${role}**${title ? ` (${title})` : ""}: “${quote(e.sourceText)}”`,
        );
      }
    }
    if (r.limitations.length)
      lines.push("", "Limitations:", ...r.limitations.map((l) => `- ${l}`));
  });
  return `${lines.join("\n")}\n`;
}

export function downloadText(
  filename: string,
  text: string,
  type: string,
): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "report"
  );
}
