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
        compact ? "px-4 py-8" : "px-6 py-12",
        className,
      )}
    >
      <div className="gloss-strong mb-3.5 flex h-10 w-10 items-center justify-center rounded-[9px] border border-white/[0.08] bg-paper-deep text-muted shadow-card">
        <Icon name={icon} size={18} />
      </div>
      <h4 className="font-semibold text-[13.5px] text-ink">{title}</h4>
      {description ? (
        <p className="mt-1 max-w-sm text-[12.5px] text-muted leading-relaxed">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-3.5">{action}</div> : null}
    </div>
  );
}

export type CalloutTone = "info" | "warning" | "danger" | "success" | "neutral";

const CALLOUT: Record<CalloutTone, { box: string; icon: IconName }> = {
  info: {
    box: "border-[#4f7cf7]/25 bg-[#4f7cf7]/[0.08] text-[#c7d6ff]",
    icon: "info",
  },
  warning: {
    box: "border-[#e0a526]/25 bg-[#e0a526]/[0.08] text-[#f5d595]",
    icon: "alert",
  },
  danger: {
    box: "border-[#ef5350]/30 bg-[#ef5350]/[0.08] text-[#ffb3b1]",
    icon: "x",
  },
  success: {
    box: "border-[#2fb35c]/25 bg-[#2fb35c]/[0.08] text-[#9fe8b8]",
    icon: "checkCircle",
  },
  neutral: {
    box: "border-line bg-white/[0.03] text-ink-soft",
    icon: "info",
  },
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
        "flex gap-3 rounded-[9px] border px-3.5 py-3 text-[12.5px]",
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
    success: "bg-[#4cc97a]",
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
        "w-full overflow-hidden rounded-full bg-white/[0.08] shadow-[inset_0_1px_1px_rgb(0_0_0/0.4)]",
        size === "sm" ? "h-1.5" : "h-2",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full bg-[linear-gradient(180deg,rgb(255_255_255/0.25),rgb(255_255_255/0))] transition-[width] duration-500 ease-out",
          color,
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-white/[0.08] bg-white/[0.05] px-1 font-mono text-[10.5px] text-muted">
      {children}
    </kbd>
  );
}
