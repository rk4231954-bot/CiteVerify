/**
 * Motion primitives for the dashboard. Every one of them honours the
 * operating system's "reduce motion" setting: numbers jump straight to their
 * value and entrance animations are skipped (the global CSS rule in the app
 * also collapses animation durations).
 */
import {
  type CSSProperties,
  type ElementType,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { cn } from "../lib/cn.ts";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(cb: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** True when the user asked the OS for reduced motion. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof window !== "undefined" && !!window.matchMedia?.(QUERY).matches,
    () => false,
  );
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Animates a number from its previous value to `value` (from 0 on first
 * mount). Screen readers get the final value only, never the intermediate
 * frames.
 */
export function CountUp({
  value,
  duration = 900,
  format = (n) => Math.round(n).toLocaleString(),
  className,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const fromRef = useRef(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      fromRef.current = value;
      setShown(value);
      return;
    }
    const from = fromRef.current;
    if (from === value) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const v = from + (value - from) * easeOutCubic(t);
      fromRef.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduced]);

  return (
    <span className={cn("tabular", className)}>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}

/**
 * Fades and lifts its children in. Pass increasing `index` values to
 * stagger siblings (each step adds `step` ms of delay).
 */
export function Reveal({
  children,
  index = 0,
  step = 55,
  as: Tag = "div",
  className,
  style,
}: {
  children: ReactNode;
  index?: number;
  step?: number;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Tag
      className={cn("animate-fade-up", className)}
      style={{ animationDelay: `${index * step}ms`, ...style }}
    >
      {children}
    </Tag>
  );
}

/**
 * Mouse handler that feeds the `.spotlight` CSS glow: it records the cursor
 * position on the element as --mx / --my custom properties.
 */
export function trackSpotlight(e: MouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - r.left}px`);
  el.style.setProperty("--my", `${e.clientY - r.top}px`);
}

/** Small "live" indicator dot with a soft pulse ring. */
export function LiveDot({
  active = true,
  className,
}: {
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("relative inline-flex h-2 w-2", className)}
      aria-hidden="true"
    >
      {active ? (
        <span className="absolute inset-0 animate-ping-soft rounded-full bg-[#4cc97a]" />
      ) : null}
      <span
        className={cn(
          "relative h-2 w-2 rounded-full",
          active ? "bg-[#4cc97a]" : "bg-[#6f6f78]",
        )}
      />
    </span>
  );
}
