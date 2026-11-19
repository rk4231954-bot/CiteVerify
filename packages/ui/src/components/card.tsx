import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Icon } from "./icon.tsx";
import { trackSpotlight } from "./motion.tsx";

/** Glossy surface: the base container for every panel in the dashboard. */
export function Card({
  className,
  interactive = false,
  onMouseMove,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  /** Lift on hover (for cards that act as links). */
  interactive?: boolean;
}) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mousemove only positions a decorative glow.
    <div
      className={cn(
        "gloss rounded-[10px] border border-line bg-surface shadow-card",
        interactive &&
          "spotlight transition-[border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised motion-reduce:hover:translate-y-0",
        className,
      )}
      onMouseMove={
        interactive
          ? (e) => {
              trackSpotlight(e);
              onMouseMove?.(e);
            }
          : onMouseMove
      }
      {...props}
    />
  );
}

/**
 * Card title row. `chevron` adds the trailing ">" used by the reference
 * design's link cards ("Limits ›", "Models ›").
 */
export function CardHeader({
  title,
  description,
  actions,
  eyebrow,
  chevron = false,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  chevron?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 px-4 pt-3.5 pb-3",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1 font-medium text-[11px] text-subtle uppercase tracking-[0.08em]">
            {eyebrow}
          </div>
        ) : null}
        <h3 className="font-semibold text-[14.5px] text-ink leading-snug tracking-[-0.01em]">
          {title}
        </h3>
        {description ? (
          <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>
        ) : null}
      </div>
      {actions || chevron ? (
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {chevron ? (
            <Icon
              name="chevronRight"
              size={15}
              className="text-subtle transition-transform group-hover:translate-x-0.5"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CardBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 pb-4", className)} {...props} />;
}
