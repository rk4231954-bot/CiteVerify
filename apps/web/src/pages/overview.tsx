import {
  BigNumber,
  Button,
  buttonClass,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  HeroStat,
  Icon,
  IconTile,
  InlineNotice,
  InsetBox,
  ListItemContent,
  listItemClass,
  MetaLine,
  MeterRow,
  MiniBars,
  Panel,
  Skeleton,
  StatList,
  StatRow,
  StatusChip,
  Timeline,
  TimelineItem,
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
  ErrorState,
  StatTile,
  VerdictBadge,
} from "../components/common.tsx";
import { useAuth } from "../lib/auth.tsx";
import { VERDICTS } from "../lib/domain.ts";
import { formatDate, formatRelative, plural, truncate } from "../lib/format.ts";
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

const percent = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

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
  const stats = derived?.stats;
  const verifiedShare = stats
    ? percent(stats.verifiedDocuments, stats.documents)
    : 0;

  if (ws.error && !data)
    return (
      <Card>
        <ErrorState error={ws.error} onRetry={ws.refetch} />
      </Card>
    );

  return (
    <div className="space-y-8">
      {data && data.failed.length > 0 ? (
        <Callout tone="warning" title="Some documents could not be loaded">
          {plural(data.failed.length, "document")} were skipped in these
          figures. Refresh to retry.
        </Callout>
      ) : null}

      {/* Hero row: headline metric + activity chart | recent documents + verification timeline */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <HeroStat
            title={
              stats ? (
                <>
                  {verifiedShare}% verified
                  <span className="ml-2 hidden font-normal text-[15px] text-muted sm:inline">
                    {greeting()}
                    {firstName ? `, ${firstName}` : ""}
                  </span>
                </>
              ) : (
                <Skeleton className="h-7 w-48" />
              )
            }
            subtitle={
              stats ? (
                <MetaLine
                  items={[
                    "Workspace",
                    plural(stats.documents, "document"),
                    `${stats.verifiedDocuments} verified`,
                    stats.needsReview > 0
                      ? `${stats.needsReview} claims need review`
                      : null,
                  ]}
                />
              ) : (
                "Loading your workspace…"
              )
            }
            actions={
              <>
                <Link
                  to="/documents"
                  className={buttonClass(
                    "secondary",
                    "md",
                    "hidden sm:inline-flex",
                  )}
                >
                  My documents <Icon name="chevronRight" size={14} />
                </Link>
                <Link to="/upload" className={buttonClass("primary")}>
                  <Icon name="upload" size={15} />
                  Upload
                </Link>
              </>
            }
          />

          {data && data.total === 0 ? (
            <InsetBox>
              <EmptyState
                icon="upload"
                title="No documents yet"
                description="Upload a manuscript (PDF or DOCX). CiteVerify extracts its claims, maps citations, retrieves the cited publications and assesses each claim against the evidence."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => navigate("/upload")}
                  >
                    Upload a document
                  </Button>
                }
              />
            </InsetBox>
          ) : (
            <ChartCard
              title="Research activity"
              description="Last 14 days · documents uploaded and claims verified"
              table={{
                columns: ["Day", "Uploaded", "Verified"],
                rows: (derived?.activity ?? []).map((d) => [
                  d.label,
                  d.uploads,
                  d.verified,
                ]),
              }}
              empty={
                !derived ? <Skeleton className="h-[220px] w-full" /> : undefined
              }
              footer={
                stats?.averageConfidence != null
                  ? `Averaging ${stats.averageConfidence}/100 assessment confidence`
                  : undefined
              }
            >
              {derived ? <ActivityLine data={derived.activity} /> : null}
            </ChartCard>
          )}

          {/* Three link cards, as in the reference's Limits / Models / Extra usage row */}
          <section
            aria-label="Workspace summary"
            className="grid grid-cols-1 gap-4 md:grid-cols-3"
          >
            <PipelineCard data={data} />
            <VerdictsCard derived={derived} />
            <ReviewCard needsReview={stats?.needsReview} loading={!stats} />
          </section>
        </div>

        <aside className="min-w-0 space-y-7" aria-label="Recent activity">
          <RecentDocuments data={data} activity={derived?.activity} />
          <div className="border-line border-t" />
          <RecentVerification data={data} />
        </aside>
      </div>

      {/* Key figures */}
      <section
        aria-label="Key figures"
        className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5"
      >
        <StatTile
          label="Total documents"
          icon="documents"
          value={stats?.documents ?? 0}
          loading={!stats}
          hint={stats ? `${stats.verifiedDocuments} verified` : undefined}
        />
        <StatTile
          label="Claims identified"
          icon="claims"
          accent="navy"
          value={stats?.claims ?? 0}
          loading={!stats}
        />
        <StatTile
          label="Citations mapped"
          icon="quote"
          accent="violet"
          value={stats?.citations ?? 0}
          loading={!stats}
          hint={stats ? `${stats.references} references` : undefined}
        />
        <StatTile
          label="Claims verified"
          icon="verification"
          accent="success"
          value={stats?.claimsVerified ?? 0}
          loading={!stats}
          hint={
            stats?.averageConfidence != null
              ? `Mean confidence ${stats.averageConfidence}/100`
              : undefined
          }
        />
        <StatTile
          label="Needing human review"
          icon="user"
          accent="warning"
          value={stats?.needsReview ?? 0}
          loading={!stats}
          hint="Recommended by the verifier"
        />
      </section>

      {data && data.total > 0 ? (
        <>
          <Panel
            title="Assessment breakdown"
            description="How the latest verification run of each document assessed its claims."
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <ChartCard
                title="Verdict distribution"
                description="Select a verdict to open its results"
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
              >
                {derived ? (
                  <VerdictDonut
                    data={derived.verdicts}
                    onSelect={(v) => navigate(`/verification?verdict=${v}`)}
                  />
                ) : null}
              </ChartCard>

              <ChartCard
                title="Evidence availability"
                description="Cited publications, by content the verifier could read"
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
                footer="Confidence reflects evidence coverage and agreement, not the probability that a claim is true."
              >
                {derived ? (
                  <CountColumns
                    xKey="bucket"
                    valueLabel="Claims"
                    color="#2a78d6"
                    data={derived.confidence}
                  />
                ) : null}
              </ChartCard>
            </div>
          </Panel>

          <ReviewQueue data={data} />
        </>
      ) : null}
    </div>
  );
}

// ─── Summary cards ─────────────────────────────────────────────────────────

const CHECKPOINTS = [
  { key: "text", label: "Text extracted" },
  { key: "claims", label: "Claims found" },
  { key: "citations", label: "Citations mapped" },
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

/** Pipeline coverage: share of documents that reached each stage ("Limits"). */
function PipelineCard({ data }: { data: Workspace | undefined }) {
  const docs = data?.docs ?? [];
  const reached = CHECKPOINTS.map((c) => ({
    ...c,
    count: docs.filter((d) => checkpoints(d)[c.key]).length,
  }));
  return (
    <Link to="/documents" className="group block">
      <Card interactive className="flex h-full flex-col">
        <CardHeader
          title="Pipeline"
          description="Documents through each stage"
          chevron
        />
        <CardBody className="flex-1 space-y-3.5">
          {!data ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            reached.map((c) => (
              <MeterRow
                key={c.key}
                label={c.label}
                value={`${c.count}/${docs.length}`}
                percent={percent(c.count, docs.length)}
                tone={c.key === "verified" ? "success" : "primary"}
              />
            ))
          )}
        </CardBody>
      </Card>
    </Link>
  );
}

/** Most common verdicts, then claim totals ("Models"). */
function VerdictsCard({
  derived,
}: {
  derived: {
    stats: ReturnType<typeof workspaceStats>;
    verdicts: ReturnType<typeof verdictDistribution>;
    results: unknown[];
  } | null;
}) {
  const total = derived?.results.length ?? 0;
  const top = (derived?.verdicts ?? [])
    .filter((v) => v.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  return (
    <Link to="/verification" className="group block">
      <Card interactive className="flex h-full flex-col">
        <CardHeader
          title="Verdicts"
          description="Most common this period"
          chevron
        />
        <CardBody className="flex flex-1 flex-col">
          {!derived ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <>
              <StatList>
                {top.length === 0 ? (
                  <div className="py-2.5 text-[12.5px] text-muted">
                    No verdicts yet
                  </div>
                ) : (
                  top.map((v) => (
                    <StatRow
                      key={v.verdict}
                      leading={
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                          style={{ background: VERDICTS[v.verdict].color }}
                          aria-hidden="true"
                        />
                      }
                      label={VERDICTS[v.verdict].label}
                      value={`${percent(v.count, total)}%`}
                    />
                  ))
                )}
              </StatList>
              <StatList className="mt-auto border-white/[0.06] border-t pt-1">
                <StatRow label="Claims" value={derived.stats.claims} />
                <StatRow label="Citations" value={derived.stats.citations} />
              </StatList>
            </>
          )}
        </CardBody>
      </Card>
    </Link>
  );
}

/** Review queue size ("Extra usage"). */
function ReviewCard({
  needsReview,
  loading,
}: {
  needsReview: number | undefined;
  loading: boolean;
}) {
  return (
    <Link to="/verification?review=1" className="group block">
      <Card interactive className="flex h-full flex-col">
        <CardHeader
          title="Human review"
          description={
            needsReview ? "Flagged by the verifier" : "Nothing flagged"
          }
          chevron
        />
        <CardBody className="flex flex-1 flex-col justify-end gap-3">
          {loading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <>
              <BigNumber label="Claims waiting" value={needsReview ?? 0} />
              <InlineNotice
                action={
                  <span className="text-ink underline decoration-white/30 underline-offset-2">
                    Open queue
                  </span>
                }
              >
                Lowest confidence first
              </InlineNotice>
            </>
          )}
        </CardBody>
      </Card>
    </Link>
  );
}

// ─── Side column ───────────────────────────────────────────────────────────

/** Latest uploads, shown like the reference's request log. */
function RecentDocuments({
  data,
  activity,
}: {
  data: Workspace | undefined;
  activity: Array<{ uploads: number; verified: number }> | undefined;
}) {
  const docs = (data?.docs ?? [])
    .slice()
    .sort((a, b) => b.document.createdAt.localeCompare(a.document.createdAt))
    .slice(0, 5);
  return (
    <Panel
      title="Documents"
      description={data ? `Latest ${docs.length} of ${data.total}` : "Loading…"}
      actions={
        <Link to="/documents" className={buttonClass("secondary", "sm")}>
          Details <Icon name="chevronRight" size={13} />
        </Link>
      }
    >
      {activity ? (
        <MiniBars
          className="mb-4"
          values={activity.map((d) => d.uploads + d.verified)}
          highlightLast={1}
          label="Uploads and verifications per day, last 14 days"
        />
      ) : null}
      {!data ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <p className="text-[12.5px] text-muted">No documents yet.</p>
      ) : (
        <ul className="space-y-1">
          {docs.map(({ document: d, verification }) => (
            <li key={d.id}>
              <Link
                to={`/documents/${d.id}`}
                className="group -mx-1.5 flex items-center gap-2.5 rounded-[6px] px-1.5 py-1.5 transition-colors hover:bg-white/[0.04]"
                title={d.title}
              >
                <StatusChip tone={verification?.job ? "success" : "neutral"}>
                  {d.fileType.includes("pdf") ? "PDF" : "DOC"}
                </StatusChip>
                <span className="min-w-0 flex-1 truncate text-[12.5px]">
                  <span className="font-medium text-ink">{d.title}</span>
                  <span className="text-muted">
                    {" "}
                    · {plural(d.counts.claims, "claim")}
                  </span>
                </span>
                <span className="tabular shrink-0 text-[12px] text-muted">
                  {formatDate(d.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Completed verification runs as an audit timeline. */
function RecentVerification({ data }: { data: Workspace | undefined }) {
  const runs = (data?.docs ?? [])
    .filter((d) => d.verification?.job)
    .map((d) => ({
      doc: d.document,
      v: d.verification as NonNullable<WorkspaceDoc["verification"]>,
    }))
    .sort((a, b) =>
      (b.v.job?.completedAt ?? "").localeCompare(a.v.job?.completedAt ?? ""),
    )
    .slice(0, 4);
  return (
    <Panel
      title="Verification runs"
      description={data ? `${plural(runs.length, "recent run")}` : "Loading…"}
      actions={
        <Link to="/verification" className={buttonClass("secondary", "sm")}>
          Details <Icon name="chevronRight" size={13} />
        </Link>
      }
    >
      {!data ? (
        <Skeleton className="h-24 w-full" />
      ) : runs.length === 0 ? (
        <p className="text-[12.5px] text-muted">
          Runs appear here as documents are verified.
        </p>
      ) : (
        <Timeline>
          {runs.map(({ doc, v }, i) => {
            const review = v.summary.humanReviewRecommended;
            return (
              <TimelineItem
                key={doc.id}
                last={i === runs.length - 1}
                tone={review > 0 ? "danger" : "success"}
                title={
                  <Link
                    to={`/documents/${doc.id}?tab=verification`}
                    className="hover:underline"
                  >
                    {doc.title}
                  </Link>
                }
                date={formatDate(v.job?.completedAt)}
                meta={
                  <MetaLine
                    items={[
                      plural(v.summary.claims, "claim"),
                      review > 0 ? `${review} for review` : "none for review",
                      formatRelative(v.job?.completedAt),
                    ]}
                  />
                }
              />
            );
          })}
        </Timeline>
      )}
    </Panel>
  );
}

// ─── Review queue ──────────────────────────────────────────────────────────

/** Claims flagged for a person, as policy-style rows. */
function ReviewQueue({ data }: { data: Workspace | undefined }) {
  const queue = data
    ? allResults(data)
        .filter((r) => r.humanReview.recommended)
        .sort((a, b) => a.confidence - b.confidence)
    : [];
  return (
    <Panel
      title="Human review queue"
      description="Claims the verifier recommends a person checks, lowest assessment confidence first."
      actions={
        queue.length > 0 ? (
          <Link
            to="/verification?review=1"
            className={buttonClass("secondary")}
          >
            <Icon name="verification" size={14} />
            Open all {queue.length}
          </Link>
        ) : null
      }
    >
      {!data ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : queue.length === 0 ? (
        <InsetBox>
          <EmptyState
            compact
            icon="checkCircle"
            title="Nothing waiting for review"
            description="Claims flagged by verification will queue here."
          />
        </InsetBox>
      ) : (
        <ul className="space-y-2">
          {queue.slice(0, 5).map((r) => (
            <li key={r.id}>
              <Link
                to={`/documents/${r.document.id}/workspace?claim=${r.claimId}`}
                className={listItemClass()}
              >
                <ListItemContent
                  leading={
                    <IconTile
                      icon={VERDICTS[r.verdict].icon}
                      tone={
                        r.verdict === "CONTRADICTED"
                          ? "danger"
                          : r.verdict === "SUPPORTED"
                            ? "success"
                            : "warning"
                      }
                    />
                  }
                  title={truncate(r.claim.originalText, 160)}
                  subtitle={
                    <MetaLine
                      items={[r.document.title, r.humanReview.reasons[0]]}
                    />
                  }
                  trailing={
                    <span className="hidden items-center gap-3 md:flex">
                      <VerdictBadge verdict={r.verdict} size="sm" />
                      <ConfidenceMeter value={r.confidence} />
                    </span>
                  }
                  menu
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
