import {
  type KeyboardEvent,
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "../lib/cn.ts";

export interface TabItem<K extends string> {
  key: K;
  label: ReactNode;
  count?: number;
}

/** Accessible tab list (roving focus, arrow keys). Panels are rendered by the caller. */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  className,
  idPrefix,
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
  idPrefix?: string;
}) {
  const autoId = useId();
  const prefix = idPrefix ?? autoId;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKey(e: KeyboardEvent, index: number) {
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % items.length;
    if (e.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = items.length - 1;
    const item = items[next];
    if (next >= 0 && item) {
      e.preventDefault();
      onChange(item.key);
      refs.current[next]?.focus();
    }
  }

  return (
    <div
      role="tablist"
      className={cn(
        "scrollbar-thin flex gap-5 overflow-x-auto border-line border-b",
        className,
      )}
    >
      {items.map((item, i) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${prefix}-tab-${item.key}`}
            aria-selected={active}
            aria-controls={`${prefix}-panel-${item.key}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "relative -mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-1 py-2.5 font-medium text-[13px] transition-colors",
              active
                ? "border-ink text-ink"
                : "border-transparent text-muted hover:text-ink",
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span
                className={cn(
                  "tabular rounded px-1.5 text-[11px] leading-[18px]",
                  active
                    ? "bg-white/[0.1] text-ink"
                    : "bg-white/[0.05] text-muted",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  tabKey,
  idPrefix,
  children,
  className,
}: {
  tabKey: string;
  idPrefix: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${tabKey}`}
      aria-labelledby={`${idPrefix}-tab-${tabKey}`}
      className={cn("animate-fade-in", className)}
    >
      {children}
    </div>
  );
}

/** Compact pill-style segmented control for filters. */
export function Segmented<K extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: Array<{ key: K; label: ReactNode }>;
  value: K;
  onChange: (key: K) => void;
  label: string;
  className?: string;
}) {
  // The active pill is one element that slides between options.
  const refs = useRef(new Map<K, HTMLButtonElement>());
  const [pill, setPill] = useState<{ left: number; width: number } | null>(
    null,
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when options change.
  useLayoutEffect(() => {
    const el = refs.current.get(value);
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, items.length]);

  return (
    <fieldset
      aria-label={label}
      className={cn(
        "relative inline-flex rounded-[8px] border border-line bg-[#121214] p-0.5 shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)]",
        className,
      )}
    >
      {pill ? (
        <span
          aria-hidden="true"
          className="absolute top-0.5 bottom-0.5 rounded-[6px] bg-[linear-gradient(180deg,#2e2e33,#242428)] shadow-card transition-[left,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ left: pill.left, width: pill.width }}
        />
      ) : null}
      {items.map((item) => (
        <button
          key={item.key}
          ref={(el) => {
            if (el) refs.current.set(item.key, el);
            else refs.current.delete(item.key);
          }}
          type="button"
          aria-pressed={item.key === value}
          onClick={() => onChange(item.key)}
          className={cn(
            "relative h-7 rounded-[6px] px-2.5 font-medium text-[12.5px] transition-colors duration-200",
            item.key === value
              ? cn(
                  "text-ink",
                  !pill &&
                    "bg-[linear-gradient(180deg,#2e2e33,#242428)] shadow-card",
                )
              : "text-muted hover:text-ink",
          )}
        >
          {item.label}
        </button>
      ))}
    </fieldset>
  );
}
