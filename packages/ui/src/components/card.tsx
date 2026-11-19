import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-surface shadow-card",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 px-5 pt-4 pb-3",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1 font-medium text-[11px] text-subtle uppercase tracking-[0.08em]">
            {eyebrow}
          </div>
        ) : null}
        <h3 className="font-semibold text-[15px] text-ink leading-snug">
          {title}
        </h3>
        {description ? (
          <p className="mt-0.5 text-[13px] text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function CardBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}
