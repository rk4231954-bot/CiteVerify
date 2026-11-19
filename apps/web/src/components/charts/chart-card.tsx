import { Card, CardHeader, Segmented } from "@citeverify/ui";
import { type ReactNode, useState } from "react";

export interface ChartTable {
  columns: string[];
  rows: Array<Array<string | number>>;
}

/** Chart container with a chart/table toggle so no value is reachable only by hover. */
export function ChartCard({
  title,
  description,
  table,
  children,
  footer,
  className,
  empty,
  actions,
}: {
  title: string;
  description?: ReactNode;
  table: ChartTable;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Rendered instead of chart/table when there is no data. */
  empty?: ReactNode;
  /** Extra header controls, shown before the Chart/Table switch. */
  actions?: ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        description={description}
        actions={
          empty ? null : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {actions}
              <Segmented
                label={`${title} view`}
                value={view}
                onChange={setView}
                items={[
                  { key: "chart", label: "Chart" },
                  { key: "table", label: "Table" },
                ]}
              />
            </div>
          )
        }
      />
      <div className="px-5 pb-5">
        {empty ??
          (view === "chart" ? (
            children
          ) : (
            <div className="scrollbar-thin max-h-64 overflow-auto rounded-md border border-line">
              <table className="w-full text-[13px]">
                <caption className="sr-only">{title}</caption>
                <thead className="sticky top-0 bg-paper text-left text-muted">
                  <tr>
                    {table.columns.map((c, i) => (
                      <th
                        key={c}
                        scope="col"
                        className={
                          i > 0
                            ? "px-3 py-2 text-right font-medium"
                            : "px-3 py-2 font-medium"
                        }
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row) => (
                    <tr key={String(row[0])} className="border-line border-t">
                      {row.map((cell, i) => (
                        <td
                          key={`${row[0]}-${table.columns[i]}`}
                          className={
                            i > 0
                              ? "tabular px-3 py-1.5 text-right text-ink"
                              : "px-3 py-1.5 text-ink-soft"
                          }
                        >
                          {typeof cell === "number"
                            ? cell.toLocaleString()
                            : cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        {footer && !empty ? (
          <div className="mt-3 text-[12px] text-muted">{footer}</div>
        ) : null}
      </div>
    </Card>
  );
}

/** Shared tooltip body: text in ink tokens, identity via a colour key beside it. */
export function TooltipBox({
  title,
  rows,
}: {
  title: ReactNode;
  rows: Array<{
    key: string;
    label: ReactNode;
    value: ReactNode;
    color?: string;
  }>;
}) {
  return (
    <div className="gloss min-w-36 rounded-[8px] border border-line-strong bg-[#1b1b1e] px-3 py-2 text-[12.5px] shadow-overlay">
      <div className="mb-1 font-medium text-ink">{title}</div>
      {rows.map((r) => (
        <div
          key={r.key}
          className="flex items-center justify-between gap-4 text-ink-soft"
        >
          <span className="flex items-center gap-1.5">
            {r.color ? (
              <span
                className="h-2.5 w-2.5 rounded-[3px]"
                style={{ background: r.color }}
                aria-hidden="true"
              />
            ) : null}
            {r.label}
          </span>
          <span className="tabular font-medium text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// Dark chart surface: recessive axes and grid (values match the --color-line / --color-muted tokens).
export const AXIS = {
  stroke: "#2a2a2f",
  tick: {
    fill: "#8a8a93",
    fontSize: 11,
    fontFamily: "Geist Mono, ui-monospace, monospace",
  },
  tickLine: false,
  axisLine: { stroke: "#2a2a2f" },
} as const;

export const GRID_STROKE = "#222226";
/** Card surface colour, used for the 2px gaps between adjacent marks. */
export const SURFACE = "#161618";
/** Categorical slots (validated on the dark surface): blue, orange. */
export const SERIES = ["#2a78d6", "#e0612a"] as const;
