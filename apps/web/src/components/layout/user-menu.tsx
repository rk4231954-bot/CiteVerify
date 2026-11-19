import { Avatar, cn, Icon } from "@citeverify/ui";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../../lib/auth.tsx";

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
        aria-label={`Account menu for ${user.name}`}
        className="flex items-center rounded-full p-0.5 transition-colors hover:bg-white/[0.06]"
      >
        <Avatar name={user.name} />
      </button>
      {open ? (
        <div
          role="menu"
          className="gloss absolute right-0 z-40 mt-2 w-64 animate-fade-up rounded-[10px] border border-line-strong bg-surface py-1.5 shadow-overlay"
        >
          <div className="border-line border-b px-3.5 pt-1.5 pb-2.5">
            <div className="truncate font-medium text-[13px] text-ink">
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
              "flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-ink-soft hover:bg-white/[0.05] hover:text-ink",
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
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-ink-soft hover:bg-white/[0.05] hover:text-ink"
          >
            <Icon name="logout" size={16} className="text-subtle" /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
