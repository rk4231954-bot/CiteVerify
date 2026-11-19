/**
 * Workspace entry point to the citation relationship network. It only picks
 * a document; the network itself is the same RelationshipGraph shown on a
 * document's "Citation network" tab.
 */
import {
  buttonClass,
  Card,
  cn,
  EmptyState,
  Icon,
  InsetBox,
  Reveal,
  Skeleton,
  StatusChip,
} from "@citeverify/ui";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { ErrorState, PageHeader } from "../components/common.tsx";
import { RelationshipGraph } from "../components/graph/relationship-graph.tsx";
import { formatRelative, plural } from "../lib/format.ts";
import { useWorkspace } from "../lib/hooks.ts";

export function NetworkPage() {
  const ws = useWorkspace();
  const [params, setParams] = useSearchParams();

  // Most recently verified first, then most recently uploaded.
  const docs = useMemo(
    () =>
      (ws.data?.docs ?? []).slice().sort((a, b) => {
        const av = a.verification?.job?.completedAt ?? "";
        const bv = b.verification?.job?.completedAt ?? "";
        if (av !== bv) return bv.localeCompare(av);
        return b.document.createdAt.localeCompare(a.document.createdAt);
      }),
    [ws.data],
  );
  const requested = params.get("doc");
  const current =
    docs.find((d) => d.document.id === requested) ??
    docs.find((d) => d.document.counts.claims > 0) ??
    docs[0];

  const select = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("doc", id);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        eyebrow="Analysis"
        icon="graph"
        title="Citation network"
        description="Trace every claim through its citations to the cited publications, the evidence passages read from them and the resulting verdict."
        actions={
          current ? (
            <Link
              to={`/documents/${current.document.id}`}
              className={buttonClass("secondary")}
            >
              Document analysis <Icon name="chevronRight" size={14} />
            </Link>
          ) : null
        }
      />

      {ws.error && !ws.data ? (
        <Card>
          <ErrorState error={ws.error} onRetry={ws.refetch} />
        </Card>
      ) : !ws.data ? (
        <div className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-[420px] w-full" />
        </div>
      ) : docs.length === 0 ? (
        <InsetBox>
          <EmptyState
            icon="graph"
            title="No documents to map yet"
            description="Upload a manuscript and run its processing journey; its claims, citations, publications and verdicts will appear here as a connected network."
            action={
              <Link to="/upload" className={buttonClass("primary")}>
                <Icon name="upload" size={15} /> Upload a document
              </Link>
            }
          />
        </InsetBox>
      ) : (
        <div className="space-y-5">
          <fieldset aria-label="Document" className="min-w-0">
            <legend className="mb-2 font-medium text-[11.5px] text-subtle uppercase tracking-[0.08em]">
              Document · {docs.length}
            </legend>
            <div className="scrollbar-thin -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
              {docs.map(({ document: d, verification }, i) => {
                const on = d.id === current?.document.id;
                return (
                  <Reveal key={d.id} index={i} step={40} className="shrink-0">
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => select(d.id)}
                      className={cn(
                        "spotlight group flex w-[250px] items-start gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow] duration-200",
                        on
                          ? "border-[#5b86ff]/60 bg-[#5b86ff]/[0.08] shadow-[0_0_0_3px_rgb(91_134_255/0.12)]"
                          : "border-line bg-surface hover:border-line-strong hover:bg-white/[0.03]",
                      )}
                    >
                      <StatusChip
                        tone={verification?.job ? "success" : "neutral"}
                      >
                        {d.fileType.includes("pdf") ? "PDF" : "DOC"}
                      </StatusChip>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-[13px] text-ink">
                          {d.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                          {plural(d.counts.claims, "claim")} ·{" "}
                          {plural(d.counts.citations, "citation")}
                          {verification?.job?.completedAt
                            ? ` · verified ${formatRelative(verification.job.completedAt)}`
                            : " · not verified"}
                        </span>
                      </span>
                      {on ? (
                        <span
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#8aa9ff] shadow-[0_0_8px_rgb(138_169_255/0.8)]"
                          aria-hidden="true"
                        />
                      ) : null}
                    </button>
                  </Reveal>
                );
              })}
            </div>
          </fieldset>

          {current ? (
            <RelationshipGraph
              key={current.document.id}
              documentId={current.document.id}
            />
          ) : null}
        </div>
      )}
    </>
  );
}
