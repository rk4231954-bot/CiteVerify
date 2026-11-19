import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Icon, type IconName } from "./icon.tsx";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("skeleton rounded-md", className)} aria-hidden="true" />
  );
}

export function EmptyState({
  icon = "layers",
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: IconName;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-4 py-8" : "px-6 py-14",
        className,
      )}
    >
      <div className="relative mb-4">
        <div
          className="absolute inset-0 -m-3 rounded-full bg-primary-50"
          aria-hidden="true"
        />
        <div className="relative flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface text-primary-500 shadow-card">
          <Icon name={icon} size={20} />
        </div>
      </div>
      <h4 className="font-semibold text-[15px] text-ink">{title}</h4>
      {description ? (
        <p className="mt-1 max-w-sm text-[13px] text-muted leading-relaxed">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export type CalloutTone = "info" | "warning" | "danger" | "success" | "neutral";

const CALLOUT: Record<CalloutTone, { box: string; icon: IconName }> = {
  info: {
    box: "border-primary-100 bg-primary-50/60 text-navy-800",
    icon: "info",
  },
  warning: {
    box: "border-[#f0e0b0] bg-[#fdf8ea] text-[#6b4d04]",
    icon: "alert",
  },
  danger: { box: "border-[#f3caca] bg-[#fdf3f3] text-[#8c1a1a]", icon: "x" },
  success: {
    box: "border-[#c9e8d6] bg-[#f1f9f4] text-[#0f5c36]",
    icon: "checkCircle",
  },
  neutral: { box: "border-line bg-paper text-ink-soft", icon: "info" },
};

export function Callout({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const t = CALLOUT[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "note"}
      className={cn(
        "flex gap-3 rounded-md border px-3.5 py-3 text-[13px]",
        t.box,
        className,
      )}
    >
      <Icon name={t.icon} size={16} className="mt-px shrink-0" />
      <div className="min-w-0 flex-1 leading-relaxed">
        {title ? <div className="font-semibold">{title}</div> : null}
        {children ? (
          <div className={title ? "mt-0.5 opacity-90" : undefined}>
            {children}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function ProgressBar({
  value,
  max = 100,
  tone = "primary",
  label,
  className,
  size = "md",
}: {
  value: number;
  max?: number;
  tone?: "primary" | "success" | "warning" | "danger" | "violet";
  label?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const color = {
    primary: "bg-primary-500",
    success: "bg-success-600",
    warning: "bg-warning-500",
    danger: "bg-danger-600",
    violet: "bg-accent-500",
  }[tone];
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-label={label}
      className={cn(
        "w-full overflow-hidden rounded-full bg-paper-deep",
        size === "sm" ? "h-1.5" : "h-2",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          color,
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-surface px-1 font-mono text-[10.5px] text-muted">
      {children}
    </kbd>
  );
}
