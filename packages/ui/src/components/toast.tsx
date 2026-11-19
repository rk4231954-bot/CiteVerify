import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "../lib/cn.ts";
import { Icon, type IconName } from "./icon.tsx";

export type ToastTone = "success" | "error" | "info" | "warning";

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds; 0 keeps the toast until dismissed. */
  duration?: number;
}

interface ToastItem extends Required<Omit<ToastInput, "description">> {
  id: number;
  description?: string;
}

interface ToastApi {
  toast: (t: ToastInput) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE: Record<ToastTone, { icon: IconName; color: string }> = {
  success: { icon: "checkCircle", color: "text-success-700" },
  error: { icon: "x", color: "text-danger-600" },
  info: { icon: "info", color: "text-primary-500" },
  warning: { icon: "alert", color: "text-warning-500" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (t: ToastInput) => {
      const id = ++seq.current;
      const item: ToastItem = {
        id,
        title: t.title,
        description: t.description,
        tone: t.tone ?? "info",
        duration: t.duration ?? (t.tone === "error" ? 7000 : 4500),
      };
      setItems((list) => [...list.slice(-3), item]);
      if (item.duration > 0) setTimeout(() => dismiss(id), item.duration);
      return id;
    },
    [dismiss],
  );

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section
        aria-label="Notifications"
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex animate-fade-up gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-raised",
            )}
          >
            <Icon
              name={TONE[t.tone].icon}
              size={18}
              className={cn("mt-px shrink-0", TONE[t.tone].color)}
            />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-[13.5px] text-ink">
                {t.title}
              </div>
              {t.description ? (
                <div className="mt-0.5 break-words text-[12.5px] text-muted leading-relaxed">
                  {t.description}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="-mr-1 h-6 w-6 shrink-0 rounded text-subtle hover:bg-paper hover:text-ink"
              aria-label="Dismiss notification"
            >
              <Icon name="close" size={14} className="mx-auto" />
            </button>
          </div>
        ))}
      </section>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
