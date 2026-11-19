import {
  Badge,
  Button,
  Callout,
  Card,
  CountUp,
  cn,
  EmptyState,
  Icon,
  type IconName,
  IconTile,
  Skeleton,
} from "@citeverify/ui";
import type { ReactNode } from "react";
import { ApiError, errorMessage } from "../lib/api.ts";
import { confidenceLabel, verdictMeta } from "../lib/domain.ts";
import { furthestStage } from "../lib/pipeline.ts";

export function PageHeader({
  title,
  description,
  eyebrow,
  icon,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  /** Optional glyph shown in a tile beside the title. */
  icon?: IconName;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          {icon ? (
            <span className="mt-0.5 hidden sm:block">
              <IconTile icon={icon} tone="primary" size="lg" />
            </span>
          ) : null}
          <div className="min-w-0">
            {eyebrow ? (
              <div className="mb-2 inline-flex items-center gap-1.5 font-medium text-[11px] text-ink-soft uppercase tracking-[0.12em]">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[linear-gradient(135deg,#8aa9ff,#a993ff)] shadow-[0_0_8px_rgb(138_169_255/0.7)]"
                  aria-hidden="true"
                />
                {eyebrow}
              </div>
            ) : null}
            <h1 className="text-balance font-semibold text-[22px] text-ink leading-tight tracking-[-0.025em] md:text-[26px]">
              {title}
            </h1>
            {description ? (
              <p className="mt-2 max-w-2xl text-pretty text-[13.5px] text-muted leading-relaxed">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </header>
  );
}

export function StatTile({
  label,
  value,
  icon,
  hint,
  accent = "primary",
  loading,
}: {
  label: string;
  value: ReactNode;
  icon: IconName;
  hint?: ReactNode;
  accent?: "primary" | "violet" | "success" | "warning" | "navy";
  loading?: boolean;
}) {
  const tone = (
    {
      primary: "primary",
      violet: "violet",
      success: "success",
      warning: "warning",
      navy: "neutral",
    } as const
  )[accent];
  return (
    <Card interactive className="relative h-full overflow-hidden p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12.5px] text-muted">{label}</div>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-16" />
          ) : (
            <div className="tabular mt-1.5 font-semibold text-[26px] text-ink leading-none tracking-[-0.02em]">
              {typeof value === "number" ? <CountUp value={value} /> : value}
            </div>
          )}
        </div>
        <IconTile icon={icon} tone={tone} size="sm" />
      </div>
      {hint ? (
        <div className="mt-2.5 truncate text-[12px] text-subtle">{hint}</div>
      ) : null}
    </Card>
  );
}

export function VerdictBadge({
  verdict,
  size = "md",
}: {
  verdict: string;
  size?: "sm" | "md";
}) {
  const meta = verdictMeta(verdict);
  return (
    <Badge
      tone={meta.tone}
      title={meta.description}
      className={size === "sm" ? "text-[11px]" : undefined}
    >
      <span className="inline-flex items-center gap-1">
        <Icon name={meta.icon} size={12} strokeWidth={2.2} />
        {meta.label}
      </span>
    </Badge>
  );
}

/** Confidence 0–100 of the automated assessment (not of the claim). */
export function ConfidenceMeter({
  value,
  showLabel = false,
}: {
  value: number | null;
  showLabel?: boolean;
}) {
  if (value === null || value === undefined)
    return <span className="text-subtle">—</span>;
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const fill =
    v >= 75
      ? "bg-[linear-gradient(90deg,#8aa9ff,#e2e2e7)]"
      : v >= 50
        ? "bg-[linear-gradient(90deg,#5b86ff,#8aa9ff)]"
        : v >= 25
          ? "bg-[linear-gradient(90deg,#3a5596,#5b86ff)]"
          : "bg-[#3a5596]";
  return (
    <span
      className="inline-flex items-center gap-2"
      title={`${confidenceLabel(v)} in the automated assessment (${v}/100). Not a guarantee of correctness.`}
    >
      <span
        className="relative h-1.5 w-14 overflow-hidden rounded-full bg-white/[0.09]"
        aria-hidden="true"
      >
        <span
          className={cn(
            "absolute inset-y-0 left-0 origin-left animate-grow-x rounded-full",
            fill,
          )}
          style={{ width: `${v}%` }}
        />
      </span>
      <span className="tabular text-[12.5px] text-ink-soft">
        {v}
        <span className="text-subtle">/100</span>
      </span>
      {showLabel ? (
        <span className="text-[12px] text-muted">{confidenceLabel(v)}</span>
      ) : null}
    </span>
  );
}

/** Error panel that distinguishes network, auth and server failures. */
export function ErrorState({
  error,
  onRetry,
  compact,
}: {
  error: unknown;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const network = error instanceof ApiError && error.isNetwork;
  return (
    <EmptyState
      compact={compact}
      icon={network ? "alert" : "x"}
      title={network ? "The API is unreachable" : "Could not load this data"}
      description={errorMessage(error)}
      action={
        onRetry ? (
          <Button variant="secondary" icon="refresh" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    />
  );
}

export function LoadingRows({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2.5", className)} aria-busy="true">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={`row-${i.toString()}`} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function AutomatedNotice({ text }: { text?: string }) {
  return (
    <Callout
      tone="neutral"
      title="Automated assessment — not an established fact"
    >
      {text ??
        "Verdicts are produced by CiteVerify's verification engine from the text it could access (often abstracts only). Confidence describes the assessment, not the truth of the claim. Review important claims against the full sources."}
    </Callout>
  );
}

export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-2 font-medium text-[11.5px] text-subtle uppercase tracking-[0.08em]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function KeyValue({
  items,
  className,
}: {
  items: Array<{ label: string; value: ReactNode }>;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2",
        className,
      )}
    >
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-[12px] text-subtle">{it.label}</dt>
          <dd className="mt-0.5 break-words text-[13.5px] text-ink">
            {it.value ?? "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function DocStatusBadge({ status }: { status: string }) {
  const tone =
    (
      {
        UPLOADED: "neutral",
        PROCESSING: "primary",
        EXTRACTED: "teal",
        COMPLETED: "success",
        FAILED: "danger",
      } as const
    )[status as "UPLOADED"] ?? "neutral";
  const label =
    (
      {
        UPLOADED: "Uploaded",
        PROCESSING: "Processing",
        EXTRACTED: "Text extracted",
        COMPLETED: "Completed",
        FAILED: "Failed",
      } as Record<string, string>
    )[status] ?? status;
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}

/** Processing state derived from counts + verification (the API's document status stays EXTRACTED). */
export function ProcessingBadge({
  document,
  verified,
}: {
  document: Parameters<typeof furthestStage>[0];
  verified: boolean;
}) {
  const s = furthestStage(document, verified);
  return (
    <Badge tone={s.tone} dot title={`Stage ${s.step} of 7`}>
      {s.label}
    </Badge>
  );
}

/** Toggle chip used for quick filters (aria-pressed). */
export function FilterChip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-[7px] border px-2.5 text-[12.5px] transition-colors",
        active
          ? "border-white/[0.2] bg-[linear-gradient(180deg,#34343a,#28282d)] text-ink shadow-card"
          : "border-line bg-white/[0.03] text-muted hover:border-line-strong hover:text-ink",
      )}
    >
      {color ? (
        <span
          className="h-2 w-2 rounded-[2px]"
          style={{ background: color }}
          aria-hidden="true"
        />
      ) : null}
      {label}
    </button>
  );
}
