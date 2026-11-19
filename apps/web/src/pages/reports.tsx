import {
  Button,
  buttonClass,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Icon,
  Skeleton,
  useToast,
} from "@citeverify/ui";
import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { VerdictDonut } from "../components/charts/charts.tsx";
import {
  AutomatedNotice,
  ConfidenceMeter,
  ErrorState,
  KeyValue,
  LoadingRows,
  PageHeader,
  VerdictBadge,
} from "../components/common.tsx";
import { DataGrid } from "../components/data-grid/data-grid.tsx";
import { ApiError } from "../lib/api.ts";
import { VERDICT_ORDER, VERDICTS } from "../lib/domain.ts";
import { formatDateTime, formatRelative, plural } from "../lib/format.ts";
import {
  useCitations,
  useConfig,
  useDocument,
  useVerification,
  useWorkspace,
} from "../lib/hooks.ts";
import { downloadText, reportMarkdown, slug } from "../lib/report.ts";
import { NotFoundPage } from "./not-found.tsx";

function ExportNotice() {
  const config = useConfig();
  if (config.data?.features.reportExport) return null;
  return (
    <Callout
      tone="info"
      title="Server-side report export is not available"
      className="no-print mb-5"
    >
      The API does not generate reports or PDFs. Reports here are assembled in
      your browser from the stored verification results; you can download them
      as Markdown or JSON, or use your browser's print dialog to save a PDF.
    </Callout>
  );
}

export function ReportsPage() {
  const ws = useWorkspace();
  const rows = useMemo(
    () => (ws.data?.docs ?? []).map((d) => ({ ...d, id: d.document.id })),
    [ws.data],
  );
  return (
    <>
      <PageHeader
        eyebrow="Reports"
        title="Verification reports"
        description="One report per verified document, built from its latest completed verification run."
      />
      <ExportNotice />
      {ws.error && !ws.data ? (
        <Card>
          <ErrorState error={ws.error} onRetry={ws.refetch} />
        </Card>
      ) : (
        <DataGrid
          loading={!ws.data}
          rows={rows}
          noun="documents"
          rowKey={(r) => r.id}
          initialSort={{ key: "verified", dir: "desc" }}
          empty={
            <EmptyState
              icon="reports"
              title="No documents yet"
              description="Upload a document and verify it to produce a report."
              action={
                <Link to="/upload" className={buttonClass("primary")}>
                  Upload a document
                </Link>
              }
            />
          }
          columns={[
            {
              key: "title",
              header: "Document",
              cell: (r) => (
                <span className="font-medium text-ink">{r.document.title}</span>
              ),
              sortValue: (r) => r.document.title,
            },
            {
              key: "verified",
              header: "Verified",
              cell: (r) =>
                r.verification?.job?.completedAt ? (
                  formatRelative(r.verification.job.completedAt)
                ) : (
                  <span className="text-subtle">Not verified</span>
                ),
              sortValue: (r) => r.verification?.job?.completedAt ?? "",
            },
            {
              key: "claims",
              header: "Claims",
              align: "right",
              cell: (r) => r.verification?.summary.claims ?? "—",
              sortValue: (r) => r.verification?.summary.claims ?? -1,
            },
            {
              key: "review",
              header: "Needs review",
              align: "right",
              hideBelow: "lg",
              cell: (r) =>
                r.verification?.summary.humanReviewRecommended ?? "—",
              sortValue: (r) =>
                r.verification?.summary.humanReviewRecommended ?? -1,
            },
            {
              key: "action",
              header: <span className="sr-only">Action</span>,
              align: "right",
              cell: (r) =>
                r.verification ? (
                  <Link
                    to={`/reports/${r.id}`}
                    className={buttonClass("secondary", "sm")}
                  >
                    View report
                  </Link>
                ) : (
                  <Link
                    to={`/documents/${r.id}`}
                    className="text-[12.5px] text-primary-600 hover:underline"
                  >
                    Verify first
                  </Link>
                ),
            },
          ]}
          mobileCard={(r) => (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-[14px] text-ink">
                  {r.document.title}
                </p>
                <p className="text-[12px] text-muted">
                  {r.verification
                    ? `${plural(r.verification.summary.claims, "claim")} · verified ${formatRelative(r.verification.job?.completedAt ?? r.document.updatedAt)}`
                    : "Not verified"}
                </p>
              </div>
              <Link
                to={r.verification ? `/reports/${r.id}` : `/documents/${r.id}`}
                className={buttonClass("secondary", "sm")}
              >
                {r.verification ? "Report" : "Verify"}
              </Link>
            </div>
          )}
        />
      )}
    </>
  );
}

export function ReportPage() {
  const { id } = useParams();
  const doc = useDocument(id);
  const v = useVerification(id);
  const citations = useCitations(id);
  const { toast } = useToast();

  if (doc.error && !doc.data)
    return doc.error instanceof ApiError && doc.error.status === 404 ? (
      <NotFoundPage title="Document not found" />
    ) : (
      <Card>
        <ErrorState error={doc.error} onRetry={doc.refetch} />
      </Card>
    );
  const ready = Boolean(doc.data && v.data && citations.data);
  const input =
    doc.data && v.data?.job && citations.data
      ? {
          document: doc.data,
          verification: v.data,
          citations: citations.data,
          generatedAt: new Date(),
        }
      : null;
  const name = slug(doc.data?.title ?? "report");

  return (
    <>
      <PageHeader
        eyebrow="Verification report"
        title={
          doc.data ? (
            doc.data.title
          ) : (
            <Skeleton className="h-9 w-96 max-w-full" />
          )
        }
        description={
          v.data?.job?.completedAt
            ? `Latest completed run · ${formatDateTime(v.data.job.completedAt)} · ${v.data.job.method}`
            : undefined
        }
        actions={
          input ? (
            <div className="no-print flex flex-wrap gap-2">
              <Button
                variant="secondary"
                icon="download"
                onClick={() => {
                  downloadText(
                    `${name}.md`,
                    reportMarkdown(input),
                    "text/markdown",
                  );
                  toast({
                    tone: "success",
                    title: "Markdown report downloaded",
                  });
                }}
              >
                Markdown
              </Button>
              <Button
                variant="secondary"
                icon="download"
                onClick={() => {
                  downloadText(
                    `${name}.json`,
                    JSON.stringify(
                      {
                        document: input.document,
                        verification: input.verification,
                        citations: input.citations,
                        assembledAt: input.generatedAt.toISOString(),
                        assembledBy: "CiteVerify web (client-side)",
                      },
                      null,
                      2,
                    ),
                    "application/json",
                  );
                  toast({ tone: "success", title: "JSON data downloaded" });
                }}
              >
                JSON
              </Button>
              <Button icon="printer" onClick={() => window.print()}>
                Print / save PDF
              </Button>
            </div>
          ) : null
        }
      />
      <ExportNotice />
      {v.error ? (
        <Card>
          <ErrorState error={v.error} onRetry={v.refetch} />
        </Card>
      ) : !ready ? (
        <LoadingRows rows={6} />
      ) : !v.data?.job ? (
        <Card>
          <EmptyState
            icon="reports"
            title="This document has not been verified"
            description={
              v.data?.reason ?? "Run verification to produce a report."
            }
            action={
              <Link to={`/documents/${id}`} className={buttonClass("primary")}>
                Open analysis
              </Link>
            }
          />
        </Card>
      ) : (
        <article className="space-y-5">
          <AutomatedNotice text={v.data.disclaimer} />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader title="Verdict distribution" />
              <CardBody>
                <VerdictDonut
                  data={VERDICT_ORDER.map((k) => ({
                    verdict: k,
                    count: v.data?.summary.byVerdict[k] ?? 0,
                  }))}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Summary" />
              <CardBody>
                <KeyValue
                  items={[
                    { label: "File", value: doc.data?.originalFilename },
                    { label: "Claims assessed", value: v.data.summary.claims },
                    {
                      label: "Human review recommended",
                      value: v.data.summary.humanReviewRecommended,
                    },
                    {
                      label: "Average assessment confidence",
                      value:
                        v.data.summary.averageConfidence !== null
                          ? `${Math.round(v.data.summary.averageConfidence)}/100 — not a guarantee`
                          : "—",
                    },
                    {
                      label: "Verification run",
                      value: (
                        <span className="font-mono text-[12px]">
                          {v.data.job.id}
                        </span>
                      ),
                    },
                  ]}
                />
              </CardBody>
            </Card>
          </div>
          <Card>
            <CardHeader
              title="Claims"
              description={plural(v.data.results.length, "assessed claim")}
            />
            <ol className="divide-y divide-line">
              {v.data.results.map((r, i) => (
                <li key={r.id} className="break-inside-avoid px-5 py-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <p className="text-[14px] text-ink leading-relaxed">
                      <span className="mr-2 font-mono text-[12px] text-subtle">
                        {i + 1}.
                      </span>
                      {r.claim.originalText}
                    </p>
                    <div className="flex shrink-0 items-center gap-3">
                      <VerdictBadge verdict={r.verdict} size="sm" />
                      <ConfidenceMeter value={r.confidence} />
                    </div>
                  </div>
                  <p className="mt-2 text-[13px] text-ink-soft leading-relaxed">
                    {r.explanation}
                  </p>
                  {r.humanReview.recommended ? (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-warning-700">
                      <Icon name="user" size={13} /> Human review:{" "}
                      {r.humanReview.reasons.join(" ")}
                    </p>
                  ) : null}
                  {r.limitations.length ? (
                    <p className="mt-1 text-[12px] text-muted">
                      Limitations: {r.limitations.join(" ")}
                    </p>
                  ) : null}
                  <Link
                    to={`/documents/${id}/workspace?claim=${r.claimId}`}
                    className="no-print mt-2 inline-flex items-center gap-1 text-[12.5px] text-primary-600 hover:underline"
                  >
                    Evidence <Icon name="arrowRight" size={12} />
                  </Link>
                </li>
              ))}
            </ol>
          </Card>
          <Card className="break-inside-avoid">
            <CardHeader title="Verdict definitions" />
            <CardBody>
              <dl className="grid gap-x-6 gap-y-3 md:grid-cols-2">
                {VERDICT_ORDER.map((k) => (
                  <div key={k}>
                    <dt className="font-medium text-[13px] text-ink">
                      {VERDICTS[k].label}
                    </dt>
                    <dd className="text-[12.5px] text-muted leading-relaxed">
                      {VERDICTS[k].description}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </article>
      )}
    </>
  );
}
