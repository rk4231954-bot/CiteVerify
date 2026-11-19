import { cn, Icon } from "@citeverify/ui";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../../lib/auth.tsx";
import { initials } from "../../lib/format.ts";

export function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md py-1 pr-1.5 pl-1 transition-colors hover:bg-navy-50"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy-900 font-semibold text-[11.5px] text-white">
          {initials(user.name)}
        </span>
        <span className="hidden max-w-36 truncate text-[13px] text-ink-soft md:block">
          {user.name}
        </span>
        <Icon
          name="chevronDown"
          size={14}
          className="hidden text-subtle md:block"
        />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-64 animate-fade-up rounded-lg border border-line bg-surface py-1.5 shadow-raised"
        >
          <div className="border-line border-b px-3.5 pt-1.5 pb-2.5">
            <div className="truncate font-medium text-[13.5px] text-ink">
              {user.name}
            </div>
            <div className="truncate text-[12.5px] text-muted">
              {user.email}
            </div>
          </div>
          <Link
            role="menuitem"
            to="/settings"
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-2.5 px-3.5 py-2 text-[13.5px] text-ink-soft hover:bg-paper",
            )}
          >
            <Icon name="settings" size={16} className="text-subtle" /> Account
            settings
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13.5px] text-ink-soft hover:bg-paper"
          >
            <Icon name="logout" size={16} className="text-subtle" /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
