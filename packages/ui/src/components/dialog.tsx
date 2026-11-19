import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn.ts";
import { Button } from "./button.tsx";
import { Icon } from "./icon.tsx";

/**
 * Modal built on the native <dialog> element: focus is trapped, Escape closes,
 * and the dialog renders in the top layer.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click mirrors the native Escape-to-close.
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "gloss m-auto w-[calc(100%-2rem)] rounded-[12px] border border-line-strong bg-surface p-0 text-ink shadow-overlay",
        "open:animate-fade-up",
        size === "sm" ? "max-w-md" : size === "md" ? "max-w-lg" : "max-w-3xl",
      )}
    >
      {open ? (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-line border-b px-5 py-4">
            <div>
              <h2 className="font-semibold text-[16px] text-ink leading-tight tracking-[-0.01em]">
                {title}
              </h2>
              {description ? (
                <p className="mt-1 text-[13px] text-muted">{description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-1 rounded-md p-1 text-subtle hover:bg-white/[0.06] hover:text-ink"
              aria-label="Close dialog"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
          {children ? (
            <div className="scrollbar-thin overflow-y-auto px-5 py-4">
              {children}
            </div>
          ) : null}
          {footer ? (
            <div className="flex justify-end gap-2 border-line border-t bg-black/20 px-5 py-3">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}

/** Confirmation for destructive actions. `onConfirm` may be async; the dialog waits for it. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "danger",
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => unknown | Promise<unknown>;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

/** Right-hand detail panel (full-screen sheet on small screens). */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click mirrors the native Escape-to-close.
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "m-0 ml-auto h-dvh max-h-dvh w-full border-line-strong border-l bg-surface p-0 text-ink shadow-overlay",
        "open:animate-slide-in-right",
        width,
      )}
    >
      {open ? (
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-line border-b px-5 py-4">
            <div className="min-w-0">
              <h2 className="font-semibold text-[16px] text-ink leading-snug tracking-[-0.01em]">
                {title}
              </h2>
              {subtitle ? (
                <div className="mt-1 text-[13px] text-muted">{subtitle}</div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-1 shrink-0 rounded-md p-1 text-subtle hover:bg-white/[0.06] hover:text-ink"
              aria-label="Close panel"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">
            {children}
          </div>
          {footer ? (
            <div className="flex gap-2 border-line border-t bg-black/20 px-5 py-3">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
