import type { Verdict } from "@citeverify/shared";
import { Icon } from "@citeverify/ui";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useReducedMotion } from "../../hooks/use-media.ts";
import { VERDICTS } from "../../lib/domain.ts";
import {
  AXIS,
  GRID_STROKE,
  SERIES,
  SURFACE,
  TooltipBox,
} from "./chart-card.tsx";

// Recharts passes these to custom tooltip content.
interface TipProps<P> {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: P; value?: unknown }>;
  label?: string | number;
}

/** Verdict distribution donut with a legend that always carries the counts. */
export function VerdictDonut({
  data,
  onSelect,
}: {
  data: Array<{ verdict: Verdict; count: number }>;
  onSelect?: (verdict: Verdict) => void;
}) {
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<Verdict | null>(null);
  const total = data.reduce((n, d) => n + d.count, 0);
  const visible = data.filter((d) => d.count > 0);
  const focus = hover ? data.find((d) => d.verdict === hover) : null;

  return (
    <div className="grid items-center gap-5 sm:grid-cols-[180px_minmax(0,1fr)]">
      <div className="relative mx-auto h-[180px] w-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={visible}
              dataKey="count"
              nameKey="verdict"
              innerRadius={58}
              outerRadius={84}
              paddingAngle={visible.length > 1 ? 1.5 : 0}
              stroke={SURFACE}
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={!reduced}
              animationDuration={700}
              onMouseEnter={(d) =>
                setHover(
                  (d.payload as { verdict?: Verdict } | undefined)?.verdict ??
                    null,
                )
              }
              onMouseLeave={() => setHover(null)}
              onClick={(d) => {
                const v = (d.payload as { verdict?: Verdict } | undefined)
                  ?.verdict;
                if (v) onSelect?.(v);
              }}
              cursor={onSelect ? "pointer" : undefined}
            >
              {visible.map((d) => (
                <Cell
                  key={d.verdict}
                  fill={VERDICTS[d.verdict].color}
                  opacity={hover && hover !== d.verdict ? 0.35 : 1}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="font-semibold text-[26px] text-navy-950 leading-none">
            {focus ? focus.count : total}
          </div>
          <div className="mt-1 max-w-24 text-[11.5px] text-muted leading-tight">
            {focus
              ? VERDICTS[focus.verdict].label
              : total === 1
                ? "claim assessed"
                : "claims assessed"}
          </div>
        </div>
      </div>
      <ul className="min-w-0 space-y-0.5">
        {data.map((d) => {
          const meta = VERDICTS[d.verdict];
          const share = total > 0 ? Math.round((d.count / total) * 100) : 0;
          return (
            <li key={d.verdict}>
              <button
                type="button"
                onMouseEnter={() => setHover(d.verdict)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(d.verdict)}
                onBlur={() => setHover(null)}
                onClick={() => onSelect?.(d.verdict)}
                disabled={!onSelect}
                className="group flex w-full items-center gap-2.5 rounded-md px-2 py-1 text-left text-[13px] transition-colors hover:bg-paper disabled:cursor-default"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                  style={{ background: meta.color }}
                  aria-hidden="true"
                />
                <Icon
                  name={meta.icon}
                  size={14}
                  className="shrink-0 text-subtle"
                />
                <span className="flex-1 truncate text-ink-soft">
                  {meta.label}
                </span>
                <span className="tabular font-medium text-ink">{d.count}</span>
                <span className="tabular w-9 text-right text-[12px] text-subtle">
                  {share}%
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Research activity per day (two count series on one shared axis). */
export function ActivityLine({
  data,
}: {
  data: Array<{ label: string; uploads: number; verified: number }>;
}) {
  const reduced = useReducedMotion();
  const series = [
    { key: "uploads", label: "Documents uploaded", color: SERIES[0] },
    { key: "verified", label: "Claims verified", color: SERIES[1] },
  ] as const;
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-[12.5px] text-ink-soft">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span
              className="h-0.5 w-4 rounded-full"
              style={{ background: s.color }}
              aria-hidden="true"
            />
            {s.label}
          </span>
        ))}
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 12, bottom: 0, left: -20 }}
          >
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="label"
              {...AXIS}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis {...AXIS} allowDecimals={false} width={44} />
            <Tooltip
              cursor={{ stroke: "#4a4a52", strokeWidth: 1 }}
              content={({
                active,
                payload,
                label,
              }: TipProps<{ uploads: number; verified: number }>) =>
                active && payload?.[0] ? (
                  <TooltipBox
                    title={label as string}
                    rows={series.map((s) => ({
                      key: s.key,
                      label: s.label,
                      value: payload[0]?.payload?.[s.key] ?? 0,
                      color: s.color,
                    }))}
                  />
                ) : null
              }
            />
            {series.map((s) => (
              <Line
                key={s.key}
                type="linear"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{
                  r: 5,
                  stroke: SURFACE,
                  strokeWidth: 2,
                  fill: s.color,
                }}
                isAnimationActive={!reduced}
                animationDuration={800}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Single-series column chart (counts per category). */
export function CountColumns({
  data,
  xKey,
  valueLabel,
  color = SERIES[0],
  height = 200,
}: {
  data: Array<Record<string, string | number>>;
  xKey: string;
  valueLabel: string;
  color?: string;
  height?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 18, right: 8, bottom: 0, left: -20 }}
        >
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey={xKey} {...AXIS} interval={0} />
          <YAxis {...AXIS} allowDecimals={false} width={44} />
          <Tooltip
            cursor={{ fill: "rgb(255 255 255 / 0.04)" }}
            content={({
              active,
              payload,
              label,
            }: TipProps<Record<string, number>>) =>
              active && payload?.[0] ? (
                <TooltipBox
                  title={label as string}
                  rows={[
                    {
                      key: "v",
                      label: valueLabel,
                      value: Number(payload[0].value ?? 0),
                      color,
                    },
                  ]}
                />
              ) : null
            }
          />
          <Bar
            dataKey="count"
            fill={color}
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
            isAnimationActive={!reduced}
            animationDuration={700}
            label={{ position: "top", fill: "#c8c8ce", fontSize: 11.5 }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
