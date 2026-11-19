import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Icon, type IconName } from "./icon.tsx";
import { Spinner } from "./spinner.tsx";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "dark";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

// Glossy buttons: a top-lit gradient plus a 1px inner highlight (see the reference design).
const VARIANTS: Record<ButtonVariant, string> = {
  /** Bright, high-emphasis action (one per view). */
  primary:
    "bg-[linear-gradient(180deg,#ffffff_0%,#dcdce2_100%)] text-[#0b0b0d] shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_1px_2px_rgb(0_0_0/0.5),0_0_0_1px_rgb(255_255_255/0.12)] hover:brightness-[1.04] active:brightness-95 disabled:opacity-50",
  /** The neutral grey button used throughout the reference design ("Add policy", "Details"). */
  secondary:
    "border border-white/[0.07] bg-[linear-gradient(180deg,#2c2c31_0%,#222226_100%)] text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.07),0_1px_2px_rgb(0_0_0/0.45)] hover:bg-[linear-gradient(180deg,#333338_0%,#28282d_100%)] disabled:text-subtle",
  ghost:
    "text-ink-soft hover:bg-white/[0.06] hover:text-ink disabled:text-subtle",
  danger:
    "bg-[linear-gradient(180deg,#f0605d_0%,#d43f3c_100%)] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_1px_2px_rgb(0_0_0/0.5)] hover:brightness-110 disabled:opacity-60",
  /** Inverted emphasis, kept for API compatibility; same look as primary. */
  dark: "bg-[linear-gradient(180deg,#ffffff_0%,#dcdce2_100%)] text-[#0b0b0d] shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_1px_2px_rgb(0_0_0/0.5)] hover:brightness-[1.04] disabled:opacity-50",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-[12.5px] gap-1.5",
  md: "h-8 px-3 text-[13px] gap-1.5",
  lg: "h-10 px-4 text-[14px] gap-2",
  icon: "h-8 w-8 justify-center",
};

/** Class string for button-styled elements (e.g. router links). */
export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra?: string,
): string {
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-[7px] font-medium",
    "transition-[background-color,border-color,color,box-shadow,transform,filter] duration-150 active:translate-y-px",
    "disabled:pointer-events-none",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: IconName;
  iconRight?: IconName;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  iconRight,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  const iconSize = size === "sm" ? 14 : 15;
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Spinner size={iconSize} />
      ) : icon ? (
        <Icon name={icon} size={iconSize} />
      ) : null}
      {children}
      {iconRight && !loading ? <Icon name={iconRight} size={iconSize} /> : null}
    </button>
  );
}
