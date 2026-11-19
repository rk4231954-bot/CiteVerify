import {
  Badge,
  buttonClass,
  Callout,
  Card,
  Drawer,
  EmptyState,
  Input,
} from "@citeverify/ui";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  AutomatedNotice,
  ConfidenceMeter,
  ErrorState,
  FilterChip,
  PageHeader,
  VerdictBadge,
} from "../components/common.tsx";
import { DataGrid, GridToolbar } from "../components/data-grid/data-grid.tsx";
import { ResultDetail } from "../components/verification/result-detail.tsx";
import { SOURCE_LABEL, VERDICT_ORDER, VERDICTS } from "../lib/domain.ts";
import { formatRelative, truncate } from "../lib/format.ts";
import { useWorkspace } from "../lib/hooks.ts";
import { allResults, type ResultWithDoc } from "../lib/workspace.ts";
import { DocSelect } from "./claims.tsx";

export function VerificationPage() {
  const ws = useWorkspace();
  const [params, setParams] = useSearchParams();
  const verdict = params.get("verdict") ?? "";
  const reviewOnly = params.get("review") === "1";
  const docFilter = params.get("doc") ?? "";
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ResultWithDoc | null>(null);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const results = useMemo(
    () => (ws.data ? allResults(ws.data) : []),
    [ws.data],
  );
  const scoped = useMemo(
    () => results.filter((r) => !docFilter || r.document.id === docFilter),
    [results, docFilter],
  );
  const counts = useMemo(() => {
    const c = Object.fromEntries(VERDICT_ORDER.map((v) => [v, 0])) as Record<
      string,
      number
    >;
    for (const r of scoped) c[r.verdict] = (c[r.verdict] ?? 0) + 1;
    return c;
  }, [scoped]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped.filter(
      (r) =>
        (!verdict || r.verdict === verdict) &&
        (!reviewOnly || r.humanReview.recommended) &&
        (!q ||
          r.claim.originalText.toLowerCase().includes(q) ||
          r.explanation.toLowerCase().includes(q) ||
          r.document.title.toLowerCase().includes(q)),
    );
  }, [scoped, verdict, reviewOnly, query]);
  const documents = useMemo(
    () =>
      (ws.data?.docs ?? [])
        .filter((d) => d.verification)
        .map((d) => ({ id: d.document.id, title: d.document.title })),
    [ws.data],
  );
  const reviewCount = scoped.filter((r) => r.humanReview.recommended).length;

  return (
    <>
      <PageHeader
        eyebrow="Verification results"
        icon="verification"
        title="Automated citation assessments"
        description="How well each cited source appears to support the claim it is cited for, based on the text that was available. These are automated assessments to guide review — not established fact."
      />
      <AutomatedNotice />
      {ws.data?.failed.length ? (
        <Callout tone="warning" className="mt-4">
          {ws.data.failed.length} document(s) could not be loaded and are not
          included.
        </Callout>
      ) : null}

      <fieldset className="mt-5 flex flex-wrap gap-1.5 m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">Filter by verdict</legend>
        <FilterChip
          active={!verdict}
          onClick={() => setParam("verdict", "")}
          label={`All verdicts · ${scoped.length}`}
        />
        {VERDICT_ORDER.map((v) => (
          <FilterChip
            key={v}
            active={verdict === v}
            onClick={() => setParam("verdict", verdict === v ? "" : v)}
            label={`${VERDICTS[v].label} · ${counts[v] ?? 0}`}
            color={VERDICTS[v].color}
          />
        ))}
      </fieldset>

      <GridToolbar className="mt-4">
        <Input
          icon="search"
          placeholder="Search claims, explanations or documents"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search verification results"
          className="sm:w-80"
        />
        <DocSelect
          documents={documents}
          value={docFilter}
          onChange={(v) => setParam("doc", v)}
        />
        <FilterChip
          active={reviewOnly}
          onClick={() => setParam("review", reviewOnly ? "" : "1")}
          label={`Needs human review · ${reviewCount}`}
        />
      </GridToolbar>

      {ws.error && !ws.data ? (
        <Card>
          <ErrorState error={ws.error} onRetry={ws.refetch} />
        </Card>
      ) : (
        <DataGrid
          loading={!ws.data}
          rows={filtered}
          noun="results"
          resetKey={`${verdict}|${reviewOnly}|${docFilter}|${query}`}
          rowKey={(r) => r.id}
          selectedKey={selected?.id}
          onRowClick={setSelected}
          initialSort={{ key: "confidence", dir: "asc" }}
          empty={
            results.length === 0 ? (
              <EmptyState
                icon="verification"
                title="No verification results yet"
                description="Upload a document and run the processing journey through verification."
                action={
                  <Link to="/upload" className={buttonClass("primary")}>
                    Upload a document
                  </Link>
                }
              />
            ) : (
              <EmptyState
                compact
                icon="filter"
                title="No results match these filters"
              />
            )
          }
          columns={[
            {
              key: "claim",
              header: "Claim",
              cell: (r) => (
                <span className="line-clamp-2 text-ink">
                  {r.claim.originalText}
                </span>
              ),
              sortValue: (r) => r.claim.originalText,
            },
            {
              key: "verdict",
              header: "Verdict",
              cell: (r) => <VerdictBadge verdict={r.verdict} size="sm" />,
              sortValue: (r) => VERDICT_ORDER.indexOf(r.verdict),
            },
            {
              key: "confidence",
              header: "Assessment confidence",
              cell: (r) => <ConfidenceMeter value={r.confidence} />,
              sortValue: (r) => r.confidence,
            },
            {
              key: "source",
              header: "Evidence",
              hideBelow: "xl",
              cell: (r) => (
                <span className="text-muted">
                  {SOURCE_LABEL[r.evidenceSource] ?? r.evidenceSource}
                </span>
              ),
              sortValue: (r) => r.evidenceSource,
            },
            {
              key: "review",
              header: "Review",
              cell: (r) =>
                r.humanReview.recommended ? (
                  <Badge tone="warning" dot>
                    Recommended
                  </Badge>
                ) : (
                  <span className="text-subtle">—</span>
                ),
              sortValue: (r) => (r.humanReview.recommended ? 1 : 0),
            },
            {
              key: "doc",
              header: "Document",
              hideBelow: "lg",
              cell: (r) => (
                <span className="text-muted">
                  {truncate(r.document.title, 36)}
                </span>
              ),
              sortValue: (r) => r.document.title,
            },
            {
              key: "date",
              header: "Assessed",
              hideBelow: "xl",
              align: "right",
              cell: (r) => (
                <span className="text-muted">
                  {formatRelative(r.createdAt)}
                </span>
              ),
              sortValue: (r) => r.createdAt,
            },
          ]}
          mobileCard={(r) => (
            <div className="space-y-2">
              <p className="line-clamp-3 text-[13.5px] text-ink">
                {r.claim.originalText}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <VerdictBadge verdict={r.verdict} size="sm" />
                <ConfidenceMeter value={r.confidence} />
                {r.humanReview.recommended ? (
                  <Badge tone="warning" dot>
                    Review
                  </Badge>
                ) : null}
              </div>
              <p className="text-[12px] text-muted">
                {truncate(r.document.title, 60)}
              </p>
            </div>
          )}
        />
      )}

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        width="max-w-2xl"
        title="Verification result"
        subtitle={selected ? truncate(selected.document.title, 80) : undefined}
        footer={
          selected ? (
            <Link
              to={`/documents/${selected.document.id}/workspace?claim=${selected.claimId}`}
              className={buttonClass("primary")}
            >
              Open in evidence workspace
            </Link>
          ) : null
        }
      >
        {selected ? <ResultDetail result={selected} /> : null}
      </Drawer>
    </>
  );
}
