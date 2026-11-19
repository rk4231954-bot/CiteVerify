/**
 * Dashboard building blocks, modelled on the reference console design:
 * section panels, icon-tile list rows, usage meters, stat rows, an audit
 * timeline, status chips, request mini-bars and the hero metric header.
 *
 * All of them are presentational: no data fetching, no routing. Rows that act
 * as links take their element from the caller (use `listItemClass()` on a
 * router <Link>), so this package stays free of a router dependency.
 */
import { type HTMLAttributes, type ReactNode, useState } from "react";
import { cn } from "../lib/cn.ts";
import { Icon, type IconName } from "./icon.tsx";

// ─── Section panel ─────────────────────────────────────────────────────────

/** A titled section without a frame ("Reservations", "Policies"). */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={cn("min-w-0", className)} aria-labelledby={id}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2
            id={id}
            className="font-semibold text-[15px] text-ink tracking-[-0.01em]"
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Recessed box for empty or placeholder content ("No reservations yet"). */
export function InsetBox({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[10px] border border-line bg-[#131315] shadow-[inset_0_1px_3px_rgb(0_0_0/0.35)]",
        className,
      )}
      {...props}
    />
  );
}

// ─── Icon tile + list rows ─────────────────────────────────────────────────

export type TileTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "violet";

const TILE_TONE: Record<TileTone, string> = {
  neutral: "text-ink-soft",
  primary: "text-[#8aa9ff]",
  success: "text-[#6bd892]",
  warning: "text-[#f2c66a]",
  danger: "text-[#ff8f8c]",
  violet: "text-[#b29dff]",
};

/** Glossy square holding an icon or a short label (file type, initials). */
export function IconTile({
  icon,
  label,
  tone = "neutral",
  size = "md",
  className,
}: {
  icon?: IconName;
  label?: ReactNode;
  tone?: TileTone;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box = { sm: "h-7 w-7", md: "h-9 w-9", lg: "h-11 w-11" }[size];
  const iconSize = { sm: 14, md: 17, lg: 19 }[size];
  return (
    <span
      className={cn(
        "gloss-strong relative flex shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-white/[0.08] bg-[#222226] shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_1px_2px_rgb(0_0_0/0.5)]",
        box,
        TILE_TONE[tone],
        className,
      )}
      aria-hidden="true"
    >
      {icon ? (
        <Icon name={icon} size={iconSize} />
      ) : (
        <span className="font-mono font-medium text-[9.5px] uppercase tracking-wide">
          {label}
        </span>
      )}
    </span>
  );
}

/** Class for a list row rendered by another element (e.g. a router Link). */
export function listItemClass(extra?: string): string {
  return cn(
    "gloss group flex w-full items-center gap-3 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-left shadow-card",
    "transition-[border-color,background-color,box-shadow] duration-150 hover:border-line-strong hover:bg-[#19191c] hover:shadow-raised",
    extra,
  );
}

/** Inner layout of a list row: leading tile, title, subtitle, trailing slot. */
export function ListItemContent({
  leading,
  title,
  subtitle,
  trailing,
  menu = false,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  /** Show the "⋯" affordance (decorative; the whole row is the target). */
  menu?: boolean;
}) {
  return (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-[13px] text-ink">
          {title}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-[12px] text-muted">
            {subtitle}
          </span>
        ) : null}
      </span>
      {trailing ? (
        <span className="flex shrink-0 items-center gap-2">{trailing}</span>
      ) : null}
      {menu ? (
        <Icon
          name="more"
          size={16}
          strokeWidth={2.6}
          className="shrink-0 text-subtle transition-colors group-hover:text-ink-soft"
        />
      ) : null}
    </>
  );
}

/** A non-link list row (policies, templates). */
export function ListItem({
  className,
  ...content
}: Parameters<typeof ListItemContent>[0] & { className?: string }) {
  return (
    <div className={listItemClass(className)}>
      <ListItemContent {...content} />
    </div>
  );
}

/** Joins metadata with " · " separators, skipping empty parts. */
export function MetaLine({
  items,
  className,
}: {
  items: ReactNode[];
  className?: string;
}) {
  const parts = items.filter(
    (i) => i !== null && i !== undefined && i !== false && i !== "",
  );
  return (
    <span className={cn("text-[12px] text-muted", className)}>
      {parts.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static ordered parts.
        <span key={i}>
          {i > 0 ? <span className="px-1.5 text-subtle">·</span> : null}
          {p}
        </span>
      ))}
    </span>
  );
}

// ─── Meters and stats ──────────────────────────────────────────────────────

const METER_FILL: Record<TileTone, string> = {
  neutral: "bg-ink-soft",
  primary: "bg-[#5b86ff]",
  success: "bg-[#4cc97a]",
  warning: "bg-[#e0a526]",
  danger: "bg-[#ef5350]",
  violet: "bg-[#8b6cff]",
};

/** "Weekly · Resets in 3d · 14% used" row with a bar beneath. */
export function MeterRow({
  label,
  hint,
  value,
  percent,
  tone = "success",
}: {
  label: ReactNode;
  hint?: ReactNode;
  value?: ReactNode;
  /** 0–100 */
  percent: number;
  tone?: TileTone;
}) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
        <span className="min-w-0 truncate">
          <span className="font-medium text-ink">{label}</span>
          {hint ? <span className="ml-2 text-muted">{hint}</span> : null}
        </span>
        {value !== undefined ? (
          <span className="tabular shrink-0 text-ink-soft">{value}</span>
        ) : null}
      </div>
      <div
        className="mt-1.5 h-[7px] w-full overflow-hidden rounded-full bg-white/[0.09] shadow-[inset_0_1px_1px_rgb(0_0_0/0.45)]"
        role="presentation"
      >
        <div
          className={cn(
            "h-full origin-left animate-grow-x rounded-full bg-[linear-gradient(180deg,rgb(255_255_255/0.28),rgb(255_255_255/0))] transition-[width] duration-500 ease-out",
            METER_FILL[tone],
          )}
          style={{ width: `${pct}%`, minWidth: pct > 0 ? 6 : 0 }}
        />
      </div>
    </div>
  );
}

/** Label on the left, value on the right ("Requests 936"). Use inside StatList. */
export function StatRow({
  label,
  value,
  leading,
}: {
  label: ReactNode;
  value: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-[12.5px]">
      <span className="flex min-w-0 items-center gap-2.5 text-ink-soft">
        {leading}
        <span className="truncate">{label}</span>
      </span>
      <span className="tabular shrink-0 font-medium text-ink">{value}</span>
    </div>
  );
}

export function StatList({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("divide-y divide-white/[0.06]", className)} {...props} />
  );
}

/** Large headline metric with a subtitle ("Monthly 7% used"). */
export function HeroStat({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="font-semibold text-[22px] text-ink leading-tight tracking-[-0.02em]">
          {title}
        </h1>
        {subtitle ? (
          <div className="mt-1 text-[12.5px] text-muted">{subtitle}</div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

/** Big number with a caption ("Available credit $0.00"). */
export function BigNumber({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <span className="text-[12.5px] text-ink-soft">{label}</span>
      <span className="tabular font-semibold text-[22px] text-ink leading-none tracking-[-0.02em]">
        {value}
      </span>
    </div>
  );
}

/** Footer strip inside a card ("Keep working past a limit · Turn on"). */
export function InlineNotice({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-[8px] border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-[12.5px] text-ink-soft",
        className,
      )}
    >
      <span className="min-w-0">{children}</span>
      {action ? <span className="shrink-0">{action}</span> : null}
    </div>
  );
}

// ─── Chips, bars, timeline ─────────────────────────────────────────────────

/** Monospace status box ("200", "PDF", "v2"). */
export function StatusChip({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: TileTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-[4px] border border-white/[0.08] bg-white/[0.07] px-1.5 font-mono text-[10.5px] leading-none",
        TILE_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Dense bar strip (the "Last 40 requests" graphic). Bars grow in on mount;
 * with `titles`, hovering a bar shows its label in the readout line below.
 */
export function MiniBars({
  values,
  label,
  className,
  highlightLast = 0,
  titles,
}: {
  values: number[];
  label: string;
  className?: string;
  /** Number of trailing bars drawn brighter (e.g. today). */
  highlightLast?: number;
  /** Per-bar description shown on hover (e.g. "Nov 12 · 2 uploads"). */
  titles?: string[];
}) {
  const max = Math.max(1, ...values);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className={className}>
      <div
        role="img"
        aria-label={label}
        className="flex h-7 items-end gap-[3px]"
        onMouseLeave={() => setHover(null)}
      >
        {values.map((v, i) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: hover readout is decorative; the strip has an aria-label.
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: positional bars.
            key={i}
            onMouseEnter={() => setHover(i)}
            className={cn(
              "flex-1 origin-bottom animate-grow-y rounded-[1.5px] transition-[background-color,filter] duration-150",
              hover === i
                ? "bg-[#8aa9ff]"
                : i >= values.length - highlightLast
                  ? "bg-ink-soft"
                  : v > 0
                    ? "bg-white/[0.22]"
                    : "bg-white/[0.07]",
            )}
            style={{
              height: `${Math.max(14, (v / max) * 100)}%`,
              animationDelay: `${i * 22}ms`,
            }}
          />
        ))}
      </div>
      {titles ? (
        <div
          className="mt-1.5 h-4 truncate text-[11.5px] text-muted transition-opacity duration-150"
          style={{ opacity: hover === null ? 0 : 1 }}
          aria-hidden="true"
        >
          {hover === null ? "\u00a0" : titles[hover]}
        </div>
      ) : null}
    </div>
  );
}

/** Vertical audit timeline. */
export function Timeline({
  className,
  ...props
}: HTMLAttributes<HTMLOListElement>) {
  return <ol className={cn("relative space-y-4", className)} {...props} />;
}

const DOT: Record<TileTone, string> = {
  neutral: "bg-[#6f6f78] shadow-[0_0_0_3px_rgb(111_111_120/0.2)]",
  primary: "bg-[#5b86ff] shadow-[0_0_0_3px_rgb(91_134_255/0.22)]",
  success: "bg-[#4cc97a] shadow-[0_0_0_3px_rgb(76_201_122/0.22)]",
  warning: "bg-[#e0a526] shadow-[0_0_0_3px_rgb(224_165_38/0.22)]",
  danger: "bg-[#f06a3c] shadow-[0_0_0_3px_rgb(240_106_60/0.25)]",
  violet: "bg-[#8b6cff] shadow-[0_0_0_3px_rgb(139_108_255/0.22)]",
};

export function TimelineItem({
  title,
  meta,
  date,
  tone = "neutral",
  last = false,
  pulse = false,
  index = 0,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  date?: ReactNode;
  tone?: TileTone;
  last?: boolean;
  /** Pulse the dot (marks the newest entry). */
  pulse?: boolean;
  /** Position, for a staggered entrance. */
  index?: number;
  children?: ReactNode;
}) {
  return (
    <li
      className="relative animate-fade-up pl-6"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      {last ? null : (
        <span
          className="absolute top-4 bottom-[-18px] left-[4.5px] w-px bg-white/[0.1]"
          aria-hidden="true"
        />
      )}
      {pulse ? (
        <span
          className={cn(
            "absolute top-[5px] left-0 h-2.5 w-2.5 animate-ping-soft rounded-full",
            DOT[tone],
          )}
          aria-hidden="true"
        />
      ) : null}
      <span
        className={cn(
          "absolute top-[5px] left-0 h-2.5 w-2.5 rounded-full",
          DOT[tone],
        )}
        aria-hidden="true"
      />
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 truncate font-medium text-[13px] text-ink">
          {title}
        </div>
        {date ? (
          <div className="tabular shrink-0 text-[12px] text-muted">{date}</div>
        ) : null}
      </div>
      {meta ? <div className="mt-1 text-[12px] text-muted">{meta}</div> : null}
      {children}
    </li>
  );
}

/** Initial-letter avatar. */
export function Avatar({
  name,
  size = "sm",
  className,
}: {
  name: string;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const box = {
    xs: "h-[18px] w-[18px] text-[9.5px]",
    sm: "h-6 w-6 text-[11px]",
    md: "h-8 w-8 text-[12.5px]",
  }[size];
  return (
    <span
      className={cn(
        "gloss-strong inline-flex shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-[#2a2a30] font-semibold text-ink-soft uppercase",
        box,
        className,
      )}
      aria-hidden="true"
    >
      {name.trim().charAt(0) || "?"}
    </span>
  );
}

/** Small heading inside the right rail ("Reservations", "Policies"). */
export function RailHeading({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-2 font-semibold text-[12.5px] text-ink-soft tracking-[-0.005em]",
        className,
      )}
    >
      {children}
    </div>
  );
}
