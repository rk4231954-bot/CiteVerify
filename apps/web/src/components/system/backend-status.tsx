import { Button, Callout, cn } from "@citeverify/ui";
import { type BackendState, useBackendStatus } from "../../lib/backend.ts";

const DOT: Record<BackendState, string> = {
  online: "bg-[#4cc97a] shadow-[0_0_6px_rgb(76_201_122/0.8)]",
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

/** Compact top-bar pill showing the API connection (like the reference's usage pill). */
export function BackendStatusPill({ className }: { className?: string }) {
  const s = useBackendStatus();
  return (
    <span
      role="status"
      title={s.message}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-[12.5px] text-ink-soft",
        s.state !== "online" &&
          s.state !== "checking" &&
          "border border-white/[0.08] bg-white/[0.04]",
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
