import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "success"
  | "teal"
  | "warning"
  | "danger"
  | "violet"
  | "orange"
  | "slate"
  | "dark";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-paper-deep text-ink-soft border-line",
  primary: "bg-primary-50 text-primary-700 border-primary-100",
  success: "bg-[#e8f5ee] text-success-700 border-[#c9e8d6]",
  teal: "bg-[#e6f4f2] text-[#0b6b63] border-[#c4e5e0]",
  warning: "bg-[#fbf3dc] text-[#7d5a04] border-[#f0e0b0]",
  danger: "bg-[#fbeaea] text-danger-600 border-[#f3caca]",
  violet: "bg-accent-50 text-accent-600 border-accent-100",
  orange: "bg-[#fdf0e6] text-[#a8410f] border-[#f7d8c0]",
  slate: "bg-[#f0f2f5] text-[#475467] border-[#dde1e7]",
  dark: "bg-navy-900 text-white border-navy-900",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
  title,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-[5px] border px-1.5 py-px font-medium text-[11.5px] leading-[18px]",
        TONES[tone],
        className,
      )}
    >
      {dot ? (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
          aria-hidden="true"
        />
      ) : null}
      <span className="truncate">{children}</span>
    </span>
  );
}
