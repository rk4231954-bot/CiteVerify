import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Icon } from "./icon.tsx";

/** Glossy surface: the base container for every panel in the dashboard. */
export function Card({
  className,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  /** Lift on hover (for cards that act as links). */
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "gloss rounded-[10px] border border-line bg-surface shadow-card",
        interactive &&
          "transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-raised",
        className,
      )}
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
