import { cn, EmptyState, Icon, Pagination, Skeleton } from "@citeverify/ui";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Enables sorting on this column. */
  sortValue?: (row: T) => string | number | null;
  className?: string;
  headerClassName?: string;
  align?: "left" | "right";
  /** Hide on narrower table layouts (the mobile card view is separate). */
  hideBelow?: "lg" | "xl";
}

export type SortState = { key: string; dir: "asc" | "desc" } | null;

/**
 * Sortable, paginated table with clickable rows. Below the `md` breakpoint
 * rows render as cards via `mobileCard`, so wide tables never scroll sideways on phones.
 */
export function DataGrid<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  mobileCard,
  loading,
  pageSize = 15,
  initialSort = null,
  empty,
  noun = "rows",
  selectedKey,
  resetKey,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  mobileCard: (row: T) => ReactNode;
  loading?: boolean;
  pageSize?: number;
  initialSort?: SortState;
  empty?: ReactNode;
  noun?: string;
  selectedKey?: string | null;
  /** Changing this value returns to page 1 (e.g. when filters change). */
  resetKey?: string;
}) {
  const [sort, setSort] = useState<SortState>(initialSort);
  const [page, setPage] = useState(1);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset pagination when the filter key changes.
  useEffect(() => setPage(1), [resetKey]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va === vb) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return (va < vb ? -1 : 1) * factor;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages);
  const visible = sorted.slice((current - 1) * pageSize, current * pageSize);

  function toggleSort(key: string) {
    setSort((s) =>
      s?.key !== key
        ? { key, dir: "asc" }
        : s.dir === "asc"
          ? { key, dir: "desc" }
          : null,
    );
  }

  function onRowKey(e: KeyboardEvent, row: T) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRowClick?.(row);
    }
  }

  if (loading)
    return (
      <div className="space-y-2 p-4" aria-busy="true">
        <span className="sr-only">Loading…</span>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={`sk-${i.toString()}`} className="h-11 w-full" />
        ))}
      </div>
    );

  if (rows.length === 0)
    return <>{empty ?? <EmptyState compact title={`No ${noun}`} />}</>;

  const hide = (c: Column<T>) =>
    c.hideBelow === "lg"
      ? "hidden lg:table-cell"
      : c.hideBelow === "xl"
        ? "hidden xl:table-cell"
        : "";

  return (
    <div>
      {/* Table (md and up) */}
      <div className="hidden md:block">
        <table className="w-full border-separate border-spacing-0 text-[13.5px]">
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={
                      active
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    className={cn(
                      "sticky top-0 z-[1] border-line border-b bg-paper/95 px-4 py-2.5 font-medium text-[12px] text-muted backdrop-blur",
                      c.align === "right" ? "text-right" : "text-left",
                      hide(c),
                      c.headerClassName,
                    )}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded hover:text-ink",
                          active && "text-ink",
                          c.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {c.header}
                        <Icon
                          name={
                            active
                              ? sort.dir === "asc"
                                ? "chevronUp"
                                : "chevronDown"
                              : "sort"
                          }
                          size={13}
                          className={
                            active ? "text-primary-500" : "text-line-strong"
                          }
                        />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const key = rowKey(row);
              return (
                <tr
                  key={key}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e) => onRowKey(e, row) : undefined}
                  aria-selected={selectedKey === key || undefined}
                  className={cn(
                    "group transition-colors",
                    onRowClick &&
                      "cursor-pointer hover:bg-primary-50/40 focus-visible:bg-primary-50/60 focus-visible:outline-none",
                    selectedKey === key && "bg-primary-50/70",
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "border-line border-b px-4 py-3 align-middle text-ink",
                        c.align === "right" && "text-right",
                        hide(c),
                        c.className,
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cards (mobile) */}
      <ul className="divide-y divide-line md:hidden">
        {visible.map((row) => (
          <li key={rowKey(row)}>
            {onRowClick ? (
              <button
                type="button"
                onClick={() => onRowClick(row)}
                className="block w-full px-4 py-3 text-left hover:bg-paper"
              >
                {mobileCard(row)}
              </button>
            ) : (
              <div className="px-4 py-3">{mobileCard(row)}</div>
            )}
          </li>
        ))}
      </ul>

      {sorted.length > pageSize ? (
        <div className="border-line border-t px-4 py-3">
          <Pagination
            page={current}
            pageSize={pageSize}
            total={sorted.length}
            onPage={setPage}
            noun={noun}
          />
        </div>
      ) : (
        <div className="border-line border-t px-4 py-2.5 text-[12.5px] text-muted">
          {sorted.length.toLocaleString()}{" "}
          {sorted.length === 1 ? noun.replace(/s$/, "") : noun}
        </div>
      )}
    </div>
  );
}

/** Filter/search bar placed above a grid. */
export function GridToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 border-line border-b px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center",
        className,
      )}
    >
      {children}
    </div>
  );
}
