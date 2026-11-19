import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from "react";
import { cn } from "../lib/cn.ts";
import { Icon, type IconName } from "./icon.tsx";

const CONTROL =
  "w-full rounded-md border border-line-strong bg-surface text-sm text-ink placeholder:text-subtle shadow-card " +
  "transition-[border-color,box-shadow] duration-150 hover:border-navy-200 " +
  "focus:border-primary-500 focus:outline-none focus:ring-3 focus:ring-primary-500/15 " +
  "disabled:cursor-not-allowed disabled:bg-paper disabled:text-subtle aria-invalid:border-danger-600";

export function Input({
  className,
  icon,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { icon?: IconName }) {
  if (!icon)
    return <input className={cn(CONTROL, "h-9 px-3", className)} {...props} />;
  return (
    <div className={cn("relative", className)}>
      <Icon
        name={icon}
        size={16}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle"
      />
      <input className={cn(CONTROL, "h-9 pr-3 pl-9")} {...props} />
    </div>
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(CONTROL, "min-h-20 px-3 py-2", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn("relative", className)}>
      <select
        className={cn(CONTROL, "h-9 appearance-none pr-8 pl-3")}
        {...props}
      >
        {children}
      </select>
      <Icon
        name="chevronDown"
        size={15}
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-subtle"
      />
    </div>
  );
}

/** Label + control + hint/error, wired with ids for assistive tech. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: (ids: {
    id: string;
    describedBy?: string;
    invalid: boolean;
  }) => ReactNode;
}) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={id}
        className="block font-medium text-[13px] text-ink-soft"
      >
        {label}
      </label>
      {children({
        id,
        describedBy: error || hint ? msgId : undefined,
        invalid: Boolean(error),
      })}
      {error ? (
        <p
          id={msgId}
          className="flex items-center gap-1 text-[12.5px] text-danger-600"
        >
          <Icon name="alert" size={13} />
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="text-[12.5px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
