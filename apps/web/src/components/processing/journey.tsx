import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  cn,
  Icon,
  type IconName,
  ProgressBar,
  Select,
  Spinner,
  useToast,
} from "@citeverify/ui";
import { useCallback, useMemo, useRef, useState } from "react";
import { api, errorMessage, type Method } from "../../lib/api.ts";
import { mapLimit } from "../../lib/concurrency.ts";
import { invalidateDocument, useConfig, usePipeline } from "../../lib/hooks.ts";
import {
  derivePipeline,
  loadPipeline,
  nextStageIndex,
  progressOf,
  type Stage,
  type StageKey,
} from "../../lib/pipeline.ts";
import { setQueryData } from "../../lib/query.ts";

const STATE_STYLE: Record<
  Stage["state"],
  {
    icon: IconName;
    dot: string;
    label: string;
    tone: Parameters<typeof Badge>[0]["tone"];
  }
> = {
  complete: {
    icon: "check",
    dot: "bg-primary-500 text-white border-primary-500 shadow-[0_0_10px_rgb(79_124_247/0.5)]",
    label: "Complete",
    tone: "success",
  },
  attention: {
    icon: "alert",
    dot: "bg-warning-50 text-warning-700 border-warning-500",
    label: "Needs attention",
    tone: "warning",
  },
  ready: {
    icon: "play",
    dot: "bg-surface text-primary-600 border-primary-300",
    label: "Ready",
    tone: "primary",
  },
  running: {
    icon: "refresh",
    dot: "bg-primary-50 text-primary-600 border-primary-400",
    label: "Running",
    tone: "primary",
  },
  failed: {
    icon: "x",
    dot: "bg-danger-50 text-danger-600 border-danger-600",
    label: "Failed",
    tone: "danger",
  },
  blocked: {
    icon: "clock",
    dot: "bg-paper text-subtle border-line-strong",
    label: "Waiting",
    tone: "neutral",
  },
  skipped: {
    icon: "minus",
    dot: "bg-paper text-subtle border-line-strong",
    label: "Not applicable",
    tone: "neutral",
  },
};

/**
 * The 7-stage processing journey for one document. States come from the API
 * (see lib/pipeline.ts); each action calls the existing backend endpoint.
 */
export function ProcessingJourney({
  documentId,
  compact = false,
}: {
  documentId: string;
  compact?: boolean;
}) {
  const { toast } = useToast();
  const config = useConfig();
  const [running, setRunning] = useState<StageKey | null>(null);
  const [autoRun, setAutoRun] = useState(false);
  const [ranEmpty, setRanEmpty] = useState<Partial<Record<StageKey, boolean>>>(
    {},
  );
  const [errors, setErrors] = useState<Partial<Record<StageKey, string>>>({});
  const [method, setMethod] = useState<Method>("RULE_BASED");
  const cancelRef = useRef(false);

  const serverRunning = (s: Stage[] | null) =>
    s?.some((x) => x.state === "running") ?? false;
  const pipeline = usePipeline(documentId, {
    refetchInterval: running ? false : 8000,
  });

  const stages = useMemo(
    () =>
      pipeline.data
        ? derivePipeline({ ...pipeline.data, ranEmpty, running }).map((s) =>
            errors[s.key] && s.state !== "running" && s.state !== "complete"
              ? {
                  ...s,
                  state: "failed" as const,
                  detail: errors[s.key] as string,
                }
              : s,
          )
        : null,
    [pipeline.data, ranEmpty, running, errors],
  );

  const features = config.data?.features;
  const aiAvailable = Boolean(
    features?.aiClaimExtraction || features?.aiVerification,
  );

  const runStage = useCallback(
    async (
      stage: Stage,
      data = pipeline.data,
      /** Batch mode: skip intermediate success toasts (the journey shows each result); errors and the final verdict summary still toast. */
      quiet = false,
    ): Promise<boolean> => {
      if (!data) return false;
      const notify = (t: Parameters<typeof toast>[0]) => {
        if (quiet && t.tone === "success" && stage.key !== "verification")
          return;
        toast(t);
      };
      const rerun = stage.action?.rerun ?? false;
      setRunning(stage.key);
      setErrors((e) => ({ ...e, [stage.key]: undefined }));
      try {
        switch (stage.key) {
          case "text":
            await api.documents.extract(documentId);
            break;
          case "claims": {
            const m =
              method === "AI" && features?.aiClaimExtraction
                ? "AI"
                : "RULE_BASED";
            const r = await api.documents.extractClaims(documentId, {
              method: m,
              replace: rerun,
            });
            setRanEmpty((x) => ({
              ...x,
              claims: r.claims.length === 0 && r.created === 0,
            }));
            notify({
              tone: "success",
              title: "Claims identified",
              description: `${r.created} new claim(s), ${r.skippedDuplicates} duplicate(s) skipped.`,
            });
            break;
          }
          case "citations": {
            const r = await api.documents.detectCitations(documentId);
            const n = (r.stats.citations ?? 0) + (r.stats.references ?? 0);
            setRanEmpty((x) => ({ ...x, citations: n === 0 }));
            notify({
              tone: "success",
              title: "Citations mapped",
              description: `${r.stats.matched} matched · ${r.stats.needsReview + r.stats.ambiguous} need review · ${r.stats.unmatched} unmatched`,
            });
            break;
          }
          case "publications": {
            const r = await api.documents.retrievePublications(documentId, {
              force: rerun,
            });
            notify({
              tone: "success",
              title: "Publication lookup finished",
              description: `${r.stats.processed} reference(s) looked up · ${r.stats.publicationsCreated} new publication record(s).`,
            });
            break;
          }
          case "evidence": {
            const pending = (data.publications?.publications ?? []).filter(
              (p) =>
                rerun ||
                !data.evidence.find((e) => e.publicationId === p.id)
                  ?.evidenceExtractedAt,
            );
            const results = await mapLimit(pending, 2, (p) =>
              api.publications.extractEvidence(p.id, {
                fullText: features?.openAccessFullText ?? true,
                replace: rerun,
                method:
                  method === "AI" && features?.aiEvidenceExtraction
                    ? "AI"
                    : "RULE_BASED",
              }),
            );
            const passages = results.reduce((n, r) => n + r.created, 0);
            const full = results.filter(
              (r) => r.fullText.status === "AVAILABLE",
            ).length;
            notify({
              tone: "success",
              title: "Evidence extracted",
              description: `${passages} passage(s) from ${results.length} publication(s); open-access full text for ${full}.`,
            });
            break;
          }
          case "verification": {
            const m =
              method === "AI" && features?.aiVerification ? "AI" : "RULE_BASED";
            const r = await api.documents.verify(documentId, {
              method: m,
              extractMissingEvidence: true,
            });
            notify({
              tone:
                r.summary.humanReviewRecommended > 0 ? "warning" : "success",
              title: "Verification completed",
              description: `${r.summary.claims} claim(s) assessed · ${r.summary.humanReviewRecommended} recommended for human review.`,
            });
            break;
          }
          default:
            break;
        }
        return true;
      } catch (err) {
        const msg = errorMessage(err);
        setErrors((e) => ({ ...e, [stage.key]: msg }));
        toast({
          tone: "error",
          title: `${stage.label} failed`,
          description: msg,
        });
        return false;
      } finally {
        setRunning(null);
        invalidateDocument(documentId);
      }
    },
    [documentId, pipeline.data, method, features, toast],
  );

  /** Runs every remaining stage in order, re-reading backend state between steps. */
  const runAll = useCallback(async () => {
    cancelRef.current = false;
    setAutoRun(true);
    let localEmpty = { ...ranEmpty };
    try {
      for (let guard = 0; guard < 8 && !cancelRef.current; guard++) {
        const data = await loadPipeline(documentId);
        setQueryData(`pipeline:${documentId}`, data);
        const current = derivePipeline({ ...data, ranEmpty: localEmpty });
        const i = current.findIndex((s) => s.state === "ready");
        const stage = current[i];
        if (!stage) break;
        const ok = await runStage(stage, data, true);
        if (!ok) break;
        if (stage.key === "claims" || stage.key === "citations") {
          const after = await loadPipeline(documentId);
          setQueryData(`pipeline:${documentId}`, after);
          const count =
            stage.key === "claims"
              ? after.document.counts.claims
              : after.document.counts.citations +
                after.document.counts.references;
          if (count === 0) localEmpty = { ...localEmpty, [stage.key]: true };
        }
      }
    } finally {
      setAutoRun(false);
    }
  }, [documentId, ranEmpty, runStage]);

  if (pipeline.error && !pipeline.data)
    return (
      <Callout
        tone="danger"
        title="Could not load the processing status"
        action={
          <Button size="sm" variant="secondary" onClick={pipeline.refetch}>
            Retry
          </Button>
        }
      >
        {errorMessage(pipeline.error)}
      </Callout>
    );

  if (!stages)
    return (
      <Card className="p-5">
        <div className="flex items-center gap-3 text-[13px] text-muted">
          <Spinner className="text-primary-500" /> Reading processing status
          from the API…
        </div>
      </Card>
    );

  const progress = progressOf(stages);
  const next = nextStageIndex(stages);
  const busy = running !== null || autoRun || serverRunning(stages);
  const allDone = next === -1 && !busy;

  return (
    <Card>
      <CardHeader
        eyebrow="Processing journey"
        title={
          allDone
            ? "Processing complete"
            : busy
              ? "Processing…"
              : "Continue processing"
        }
        description={`${progress.done} of ${progress.total} applicable stages complete · states are read from the API`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {aiAvailable ? (
              <Select
                aria-label="Method"
                value={method}
                onChange={(e) => setMethod(e.target.value as Method)}
                className="w-36"
                disabled={busy}
              >
                <option value="RULE_BASED">Rule-based</option>
                <option value="AI">AI-assisted</option>
              </Select>
            ) : null}
            {autoRun ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => (cancelRef.current = true)}
              >
                Stop after this step
              </Button>
            ) : next >= 0 ? (
              <Button size="sm" icon="play" onClick={runAll} disabled={busy}>
                Run remaining steps
              </Button>
            ) : null}
          </div>
        }
      />
      <div className="px-5">
        <ProgressBar
          value={progress.done}
          max={progress.total}
          label="Processing progress"
          size="sm"
        />
      </div>
      <ol className={cn("px-5 py-4", compact ? "space-y-1" : "space-y-1.5")}>
        {stages.map((s, i) => {
          const st = STATE_STYLE[s.state];
          const last = i === stages.length - 1;
          const isNext = i === next;
          return (
            <li key={s.key} className="relative flex gap-3.5">
              {!last ? (
                <span
                  className={cn(
                    "absolute top-8 bottom-[-6px] left-[13px] w-px",
                    s.state === "complete" || s.state === "attention"
                      ? "bg-primary-300"
                      : "bg-line",
                  )}
                  aria-hidden="true"
                />
              ) : null}
              <span
                className={cn(
                  "relative z-[1] mt-1 flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full border",
                  st.dot,
                )}
              >
                {s.state === "running" ? (
                  <Spinner size={14} />
                ) : (
                  <Icon name={st.icon} size={14} strokeWidth={2.2} />
                )}
              </span>
              <div
                className={cn(
                  "flex min-w-0 flex-1 flex-col gap-2 rounded-md px-3 py-2 sm:flex-row sm:items-center sm:justify-between",
                  isNext && !busy && "bg-primary-50/60",
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-subtle">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={cn(
                        "font-medium text-[13.5px]",
                        s.state === "blocked" || s.state === "skipped"
                          ? "text-muted"
                          : "text-ink",
                      )}
                    >
                      {s.label}
                    </span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <p
                    className={cn(
                      "mt-0.5 text-[12.5px] leading-relaxed",
                      s.state === "failed" ? "text-danger-600" : "text-muted",
                    )}
                  >
                    {s.detail}
                  </p>
                </div>
                {s.action && s.state !== "running" && s.state !== "blocked" ? (
                  <Button
                    size="sm"
                    variant={isNext ? "primary" : "ghost"}
                    onClick={() => runStage(s)}
                    disabled={busy}
                    className="self-start sm:self-auto"
                  >
                    {s.action.label}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {stages.some(
        (s) =>
          s.key === "publications" &&
          (s.state === "ready" || s.state === "attention"),
      ) ? (
        <div className="px-5 pb-5">
          <Callout tone="info">
            Publication retrieval queries Crossref and OpenAlex over the network
            and can take a while for long reference lists.
          </Callout>
        </div>
      ) : null}
    </Card>
  );
}
