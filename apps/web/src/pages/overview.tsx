import {
  Button,
  buttonClass,
  Callout,
  Card,
  CardBody,
  CardHeader,
  cn,
  EmptyState,
  Icon,
  Skeleton,
} from "@citeverify/ui";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { ChartCard } from "../components/charts/chart-card.tsx";
import {
  ActivityLine,
  CountColumns,
  VerdictDonut,
} from "../components/charts/charts.tsx";
import {
  ConfidenceMeter,
  DocStatusBadge,
  ErrorState,
  PageHeader,
  ProcessingBadge,
  StatTile,
  VerdictBadge,
} from "../components/common.tsx";
import { useAuth } from "../lib/auth.tsx";
import { VERDICTS } from "../lib/domain.ts";
import { formatRelative, plural, truncate } from "../lib/format.ts";
import { useWorkspace } from "../lib/hooks.ts";
import {
  activitySeries,
  allResults,
  confidenceDistribution,
  evidenceAvailability,
  verdictDistribution,
  type Workspace,
  type WorkspaceDoc,
  workspaceStats,
} from "../lib/workspace.ts";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function OverviewPage() {
  const { user } = useAuth();
  const ws = useWorkspace({ refetchInterval: 30_000 });
  const navigate = useNavigate();
  const data = ws.data;

  const derived = useMemo(() => {
    if (!data) return null;
    const results = allResults(data);
    return {
      stats: workspaceStats(data),
      results,
      verdicts: verdictDistribution(results),
      confidence: confidenceDistribution(results),
      evidence: evidenceAvailability(results),
      activity: activitySeries(data, 14),
    };
  }, [data]);

  const firstName = user?.name.split(/\s+/)[0] ?? "";

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
        description="Your verification workspace at a glance. All figures are computed from your documents' stored claims, citations and latest verification runs."
        actions={
          <>
            <Link to="/documents" className={buttonClass("secondary")}>
              View documents
            </Link>
            <Link to="/upload" className={buttonClass("primary")}>
              <span className="-ml-0.5">
                <Icon name="upload" size={16} />
              </span>
              Upload document
            </Link>
          </>
        }
      />

      {ws.error && !data ? (
        <Card>
          <ErrorState error={ws.error} onRetry={ws.refetch} />
        </Card>
      ) : (
        <div className="space-y-5">
          {data && data.failed.length > 0 ? (
            <Callout tone="warning" title="Some documents could not be loaded">
              {plural(data.failed.length, "document")} were skipped in these
              figures. Refresh to retry.
            </Callout>
          ) : null}

          {/* Stat row */}
          <section
            aria-label="Key figures"
            className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5"
          >
            <StatTile
              label="Total documents"
              icon="documents"
              value={derived?.stats.documents ?? 0}
              loading={!derived}
              hint={
                derived
                  ? `${derived.stats.verifiedDocuments} verified`
                  : undefined
              }
            />
            <StatTile
              label="Claims identified"
              icon="claims"
              accent="navy"
              value={derived?.stats.claims ?? 0}
              loading={!derived}
            />
            <StatTile
              label="Citations mapped"
              icon="quote"
              accent="violet"
              value={derived?.stats.citations ?? 0}
              loading={!derived}
              hint={
                derived ? `${derived.stats.references} references` : undefined
              }
            />
            <StatTile
              label="Claims verified"
              icon="verification"
              accent="success"
              value={derived?.stats.claimsVerified ?? 0}
              loading={!derived}
              hint={
                derived?.stats.averageConfidence != null
                  ? `Mean assessment confidence ${derived.stats.averageConfidence}/100`
                  : undefined
              }
            />
            <StatTile
              label="Needing human review"
              icon="user"
              accent="warning"
              value={derived?.stats.needsReview ?? 0}
              loading={!derived}
              hint="Recommended by the verifier"
            />
          </section>

          {data && data.total === 0 ? (
            <Card>
              <EmptyState
                icon="upload"
                title="Your workspace is empty"
                description="Upload a manuscript (PDF or DOCX). CiteVerify will extract its text, identify claims, map citations, retrieve the cited publications and assess each claim against the evidence."
                action={
                  <Button icon="upload" onClick={() => navigate("/upload")}>
                    Upload your first document
                  </Button>
                }
              />
            </Card>
          ) : (
            <>
              {/* Bento: charts */}
              <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                <ChartCard
                  className="lg:col-span-5"
                  title="Verdict distribution"
                  description="Latest verification run of each document"
                  table={{
                    columns: ["Verdict", "Claims"],
                    rows: (derived?.verdicts ?? []).map((v) => [
                      VERDICTS[v.verdict].label,
                      v.count,
                    ]),
                  }}
                  empty={
                    !derived ? (
                      <Skeleton className="h-[180px] w-full" />
                    ) : derived.results.length === 0 ? (
                      <EmptyState
                        compact
                        icon="verification"
                        title="No verified claims yet"
                        description="Run verification on a document to see how its claims are assessed."
                      />
                    ) : undefined
                  }
                  footer="Select a verdict to open the matching results."
                >
                  {derived ? (
                    <VerdictDonut
                      data={derived.verdicts}
                      onSelect={(v) => navigate(`/verification?verdict=${v}`)}
                    />
                  ) : null}
                </ChartCard>

                <ChartCard
                  className="lg:col-span-7"
                  title="Research activity"
                  description="Last 14 days · documents uploaded and claims verified (latest runs)"
                  table={{
                    columns: ["Day", "Uploaded", "Verified"],
                    rows: (derived?.activity ?? []).map((d) => [
                      d.label,
                      d.uploads,
                      d.verified,
                    ]),
                  }}
                  empty={
                    !derived ? (
                      <Skeleton className="h-[220px] w-full" />
                    ) : undefined
                  }
                >
                  {derived ? <ActivityLine data={derived.activity} /> : null}
                </ChartCard>
              </section>

              <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                <ChartCard
                  className="lg:col-span-4"
                  title="Evidence availability"
                  description="Cited publications assessed, by content the verifier could read"
                  table={{
                    columns: ["Source", "Publications", "Passages used"],
                    rows: (derived?.evidence ?? []).map((e) => [
                      e.source,
                      e.publications,
                      e.passages,
                    ]),
                  }}
                  empty={
                    !derived ? (
                      <Skeleton className="h-[200px] w-full" />
                    ) : derived.evidence.every((e) => e.publications === 0) ? (
                      <EmptyState
                        compact
                        icon="book"
                        title="No publications assessed yet"
                        description="Evidence availability appears after verification reads cited publications."
                      />
                    ) : undefined
                  }
                  footer={
                    derived
                      ? `Passages used: ${derived.evidence[0]?.passages ?? 0} from full text, ${derived.evidence[1]?.passages ?? 0} from abstracts.`
                      : undefined
                  }
                >
                  {derived ? (
                    <CountColumns
                      xKey="source"
                      valueLabel="Publications"
                      data={derived.evidence.map((e) => ({
                        source: e.source,
                        count: e.publications,
                      }))}
                    />
                  ) : null}
                </ChartCard>

                <ChartCard
                  className="lg:col-span-4"
                  title="Confidence distribution"
                  description="Confidence in each automated assessment (0–100)"
                  table={{
                    columns: ["Confidence", "Claims"],
                    rows: (derived?.confidence ?? []).map((c) => [
                      c.bucket,
                      c.count,
                    ]),
                  }}
                  empty={
                    !derived ? (
                      <Skeleton className="h-[200px] w-full" />
                    ) : derived.results.length === 0 ? (
                      <EmptyState
                        compact
                        icon="graph"
                        title="No assessments yet"
                        description="Confidence scores appear once claims are verified."
                      />
                    ) : undefined
                  }
                  footer="Confidence reflects evidence coverage and agreement — it is not a probability that the claim is true."
                >
                  {derived ? (
                    <CountColumns
                      xKey="bucket"
                      valueLabel="Claims"
                      color="#16274f"
                      data={derived.confidence}
                    />
                  ) : null}
                </ChartCard>

                <ProcessingStatus className="lg:col-span-4" data={data} />
              </section>

              <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                <RecentDocuments className="lg:col-span-7" data={data} />
                <RecentVerification className="lg:col-span-5" data={data} />
              </section>

              <ReviewQueue data={data} />
            </>
          )}
        </div>
      )}
    </>
  );
}

const CHECKPOINTS = [
  { key: "text", label: "Text" },
  { key: "claims", label: "Claims" },
  { key: "citations", label: "Citations" },
  { key: "verified", label: "Verified" },
] as const;

function checkpoints(
  d: WorkspaceDoc,
): Record<(typeof CHECKPOINTS)[number]["key"], boolean> {
  const doc = d.document;
  const text =
    doc.status === "EXTRACTED" ||
    doc.status === "COMPLETED" ||
    doc.counts.claims > 0;
  return {
    text,
    claims: doc.counts.claims > 0,
    citations: doc.counts.citations > 0 || doc.counts.references > 0,
    verified: Boolean(d.verification?.job),
  };
}

function ProcessingStatus({
  data,
  className,
}: {
  data: Workspace | undefined;
  className?: string;
}) {
  const docs = (data?.docs ?? [])
    .slice()
    .sort((a, b) => b.document.updatedAt.localeCompare(a.document.updatedAt));
  const inFlight = docs.filter((d) => !checkpoints(d).verified);
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        title="Processing status"
        description={
          data
            ? `${inFlight.length} of ${docs.length} documents not yet verified`
            : "Loading…"
        }
      />
      <CardBody className="flex-1">
        {!data ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : docs.length === 0 ? null : inFlight.length === 0 ? (
          <EmptyState
            compact
            icon="checkCircle"
            title="Everything is verified"
            description="Every document has a completed verification run."
          />
        ) : (
          <ul className="space-y-3">
            {inFlight.slice(0, 5).map((d) => {
              const cp = checkpoints(d);
              return (
                <li key={d.document.id}>
                  <Link
                    to={`/documents/${d.document.id}`}
                    className="group block rounded-md p-1.5 -m-1.5 hover:bg-paper"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-[13px] text-ink group-hover:text-primary-600">
                        {d.document.title}
                      </span>
                      {d.document.status === "FAILED" ? (
                        <DocStatusBadge status="FAILED" />
                      ) : null}
                    </div>
                    <div className="mt-1.5 flex gap-1">
                      {CHECKPOINTS.map((c) => (
                        <div key={c.key} className="flex-1">
                          <div
                            className={cn(
                              "h-1.5 rounded-full",
                              cp[c.key] ? "bg-primary-500" : "bg-paper-deep",
                            )}
                          />
                          <div
                            className={cn(
                              "mt-1 text-[10.5px]",
                              cp[c.key] ? "text-ink-soft" : "text-subtle",
                            )}
                          >
                            {cp[c.key] ? "✓ " : ""}
                            {c.label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function RecentDocuments({
  data,
  className,
}: {
  data: Workspace | undefined;
  className?: string;
}) {
  const docs = (data?.docs ?? [])
    .slice()
    .sort((a, b) => b.document.createdAt.localeCompare(a.document.createdAt))
    .slice(0, 6);
  return (
    <Card className={className}>
      <CardHeader
        title="Recent documents"
        actions={
          <Link to="/documents" className={buttonClass("ghost", "sm")}>
            All documents <Icon name="arrowRight" size={14} />
          </Link>
        }
      />
      <div className="px-2 pb-3">
        {!data ? (
          <div className="space-y-2 px-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <ul>
            {docs.map(({ document: d, verification }) => (
              <li key={d.id}>
                <Link
                  to={`/documents/${d.id}`}
                  className="group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-paper"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-paper text-[10px] font-semibold text-navy-600 uppercase">
                    {d.fileType.includes("pdf") ? "PDF" : "DOCX"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-[13.5px] text-ink group-hover:text-primary-600">
                      {d.title}
                    </div>
                    <div className="truncate text-[12px] text-muted">
                      {plural(d.counts.claims, "claim")} ·{" "}
                      {plural(d.counts.citations, "citation")} · uploaded{" "}
                      {formatRelative(d.createdAt)}
                    </div>
                  </div>
                  <ProcessingBadge
                    document={d}
                    verified={Boolean(verification?.job)}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function RecentVerification({
  data,
  className,
}: {
  data: Workspace | undefined;
  className?: string;
}) {
  const runs = (data?.docs ?? [])
    .filter((d) => d.verification?.job)
    .map((d) => ({
      doc: d.document,
      v: d.verification as NonNullable<WorkspaceDoc["verification"]>,
    }))
    .sort((a, b) =>
      (b.v.job?.completedAt ?? "").localeCompare(a.v.job?.completedAt ?? ""),
    )
    .slice(0, 5);
  return (
    <Card className={className}>
      <CardHeader
        title="Recent verification activity"
        description="Latest completed run per document"
      />
      <CardBody>
        {!data ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <EmptyState
            compact
            icon="clock"
            title="No verification runs yet"
            description="Runs appear here as documents are verified."
          />
        ) : (
          <ol className="relative space-y-4 border-line border-l pl-5">
            {runs.map(({ doc, v }) => {
              const top = Object.entries(v.summary.byVerdict).sort(
                (a, b) => b[1] - a[1],
              )[0];
              return (
                <li key={doc.id} className="relative">
                  <span
                    className="absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full border-2 border-surface bg-primary-500"
                    aria-hidden="true"
                  />
                  <Link
                    to={`/documents/${doc.id}?tab=verification`}
                    className="group block"
                  >
                    <div className="truncate font-medium text-[13px] text-ink group-hover:text-primary-600">
                      {doc.title}
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted">
                      {plural(v.summary.claims, "claim")} assessed ·{" "}
                      {v.summary.humanReviewRecommended} for review ·{" "}
                      {formatRelative(v.job?.completedAt)}
                    </div>
                    {top && top[1] > 0 ? (
                      <div className="mt-1.5">
                        <VerdictBadge verdict={top[0]} size="sm" />
                        <span className="ml-1.5 text-[11.5px] text-subtle">
                          most common
                        </span>
                      </div>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

function ReviewQueue({ data }: { data: Workspace | undefined }) {
  const queue = data
    ? allResults(data)
        .filter((r) => r.humanReview.recommended)
        .sort((a, b) => a.confidence - b.confidence)
    : [];
  return (
    <Card>
      <CardHeader
        title="Human review queue"
        description="Claims the verifier recommends a person checks, lowest assessment confidence first"
        actions={
          queue.length > 0 ? (
            <Link
              to="/verification?review=1"
              className={buttonClass("ghost", "sm")}
            >
              Open all {queue.length} <Icon name="arrowRight" size={14} />
            </Link>
          ) : null
        }
      />
      <div className="px-2 pb-3">
        {!data ? (
          <div className="space-y-2 px-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : queue.length === 0 ? (
          <EmptyState
            compact
            icon="checkCircle"
            title="Nothing waiting for review"
            description="Claims flagged by verification will queue here."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-1 md:grid-cols-2">
            {queue.slice(0, 6).map((r) => (
              <li key={r.id} className="min-w-0">
                <Link
                  to={`/documents/${r.document.id}/workspace?claim=${r.claimId}`}
                  className="group flex h-full flex-col gap-2 rounded-md px-3 py-2.5 transition-colors hover:bg-paper"
                >
                  <p className="line-clamp-2 text-[13.5px] text-ink leading-snug group-hover:text-navy-950">
                    {truncate(r.claim.originalText, 200)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <VerdictBadge verdict={r.verdict} size="sm" />
                    <ConfidenceMeter value={r.confidence} />
                    <span className="truncate text-[12px] text-subtle">
                      {r.humanReview.reasons[0]}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
