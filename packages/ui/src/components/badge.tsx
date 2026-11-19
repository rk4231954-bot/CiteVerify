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
  | "pink"
  | "slate"
  | "dark";

// Translucent tints so badges sit on any dark surface; text steps are the light ends of each hue.
const TONES: Record<BadgeTone, string> = {
  neutral: "bg-white/[0.06] text-ink-soft border-white/[0.08]",
  primary: "bg-[#4f7cf7]/[0.14] text-[#a9c0ff] border-[#4f7cf7]/[0.28]",
  success: "bg-[#2fb35c]/[0.14] text-[#7fe0a2] border-[#2fb35c]/[0.28]",
  teal: "bg-[#1baf7a]/[0.14] text-[#6fe0c0] border-[#1baf7a]/[0.28]",
  warning: "bg-[#e0a526]/[0.14] text-[#f2c66a] border-[#e0a526]/[0.28]",
  danger: "bg-[#ef5350]/[0.14] text-[#ff9c99] border-[#ef5350]/[0.3]",
  violet: "bg-[#8b6cff]/[0.15] text-[#c4b5ff] border-[#8b6cff]/[0.3]",
  orange: "bg-[#e0612a]/[0.15] text-[#ffab84] border-[#e0612a]/[0.3]",
  pink: "bg-[#c94f9e]/[0.15] text-[#f29bd0] border-[#c94f9e]/[0.32]",
  slate: "bg-white/[0.05] text-muted border-white/[0.07]",
  dark: "bg-ink text-paper border-ink",
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
        "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-[5px] border px-1.5 py-px font-medium text-[11.5px] leading-[18px] tracking-normal",
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
