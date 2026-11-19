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

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-500 text-white shadow-card hover:bg-primary-600 active:bg-primary-700 disabled:bg-primary-300",
  secondary:
    "bg-surface text-ink border border-line-strong shadow-card hover:bg-paper hover:border-navy-200 disabled:text-subtle",
  ghost: "text-ink-soft hover:bg-navy-50 hover:text-ink disabled:text-subtle",
  danger:
    "bg-danger-600 text-white shadow-card hover:bg-danger-700 active:bg-[#7a1717] disabled:opacity-60",
  dark: "bg-navy-900 text-white shadow-card hover:bg-navy-800 disabled:opacity-60",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
  lg: "h-11 px-5 text-[15px] gap-2",
  icon: "h-9 w-9 justify-center",
};

/** Class string for button-styled elements (e.g. router links). */
export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra?: string,
): string {
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md font-medium",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px",
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
  const iconSize = size === "sm" ? 15 : 16;
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
