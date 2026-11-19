import { Button, Callout, cn } from "@citeverify/ui";
import { type BackendState, useBackendStatus } from "../../lib/backend.ts";

const DOT: Record<BackendState, string> = {
  online: "bg-success-600",
  checking: "bg-navy-300",
  degraded: "bg-warning-500",
  offline: "bg-danger-600",
  "not-configured": "bg-warning-500",
};
const LABEL: Record<BackendState, string> = {
  online: "API connected",
  checking: "Checking API…",
  degraded: "API degraded",
  offline: "API offline",
  "not-configured": "No API configured",
};

/** Compact pill for the top bar; hidden while everything is fine. */
export function BackendStatusPill({ className }: { className?: string }) {
  const s = useBackendStatus();
  if (s.state === "online" || s.state === "checking") return null;
  return (
    <span
      role="status"
      title={s.message}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 text-[12px] text-ink-soft",
        className,
      )}
    >
      <span
        className={cn("h-2 w-2 rounded-full", DOT[s.state])}
        aria-hidden="true"
      />
      <span className="hidden sm:inline">{LABEL[s.state]}</span>
      <span className="sr-only sm:hidden">{LABEL[s.state]}</span>
    </span>
  );
}

/** Full notice: shown on auth pages, the shell banner and settings. */
export function BackendStatusNotice({
  showWhenOnline = false,
  className,
}: {
  showWhenOnline?: boolean;
  className?: string;
}) {
  const s = useBackendStatus();
  if (!showWhenOnline && (s.state === "online" || s.state === "checking"))
    return null;
  const tone =
    s.state === "online"
      ? "success"
      : s.state === "checking"
        ? "neutral"
        : s.state === "offline"
          ? "danger"
          : "warning";
  return (
    <Callout
      tone={tone}
      title={LABEL[s.state]}
      className={className}
      action={
        s.state === "offline" || s.state === "degraded" ? (
          <Button
            size="sm"
            variant="secondary"
            icon="refresh"
            onClick={s.recheck}
          >
            Retry
          </Button>
        ) : undefined
      }
    >
      <p>{s.message}</p>
      <p className="mt-1 break-all font-mono text-[11.5px] opacity-80">
        API: {s.target}
      </p>
    </Callout>
  );
}
