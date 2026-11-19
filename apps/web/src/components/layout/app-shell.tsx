import { cn, Icon, LogoMark, Spinner } from "@citeverify/ui";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { useAuth } from "../../lib/auth.tsx";
import { BackendStatusPill } from "../system/backend-status.tsx";
import { Breadcrumbs } from "./breadcrumbs.tsx";
import { CommandPalette } from "./command-palette.tsx";
import { Sidebar } from "./sidebar.tsx";
import { UserMenu } from "./user-menu.tsx";

const COLLAPSE_KEY = "citeverify.sidebar.collapsed";

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function AppShell() {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        // ignore
      }
      return !c;
    });
  }, []);

  // Close the mobile menu on navigation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on path change.
  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const workspace = user?.name
    ? `${user.name.split(/\s+/)[0]}'s workspace`
    : "Workspace";

  return (
    <div className="flex min-h-dvh flex-col bg-frame">
      <a
        href="#main"
        className="fixed top-2 left-2 z-[70] -translate-y-20 rounded-md bg-ink px-3 py-2 text-paper text-sm focus:translate-y-0"
      >
        Skip to content
      </a>

      {/* Top bar (sits on the frame, outside the window) */}
      <header className="no-print flex h-12 shrink-0 items-center gap-2 px-3 md:px-4">
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-[7px] text-ink-soft hover:bg-white/[0.06] hover:text-ink lg:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
        >
          <Icon name="menu" size={18} />
        </button>
        <Link
          to="/"
          className="flex items-center rounded-[7px] p-0.5 hover:bg-white/[0.05]"
          aria-label="CiteVerify home"
        >
          <LogoMark size={22} />
        </Link>
        <span
          className="flex h-7 min-w-0 items-center gap-2 rounded-[7px] border border-white/[0.07] bg-white/[0.04] px-2 text-[13px] text-ink shadow-card"
          title="Current workspace"
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] bg-white/[0.1] font-semibold text-[9.5px] text-ink-soft uppercase">
            {workspace.charAt(0)}
          </span>
          <span className="truncate">{workspace}</span>
        </span>

        <div className="ml-auto flex items-center gap-1.5 md:gap-2">
          <BackendStatusPill />
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-[12.5px] text-ink-soft transition-colors hover:bg-white/[0.06] hover:text-ink"
            aria-label="Search documents and pages"
            aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
          >
            <Icon name="search" size={15} />
            <span className="hidden font-mono text-[11.5px] sm:inline">
              {isMac ? "⌘K" : "Ctrl K"}
            </span>
          </button>
          <UserMenu />
        </div>
      </header>

      {/* The window */}
      <div className="app-window relative mx-0 mb-0 flex min-h-0 flex-1 flex-col overflow-clip border-line border-t shadow-[0_0_0_1px_rgb(255_255_255/0.02),0_30px_80px_-20px_rgb(0_0_0/0.9)] md:mx-2 md:mb-2 md:rounded-[12px] md:border print:m-0 print:border-0">
        {/* Context strip: breadcrumb trail, styled like the reference's tab row */}
        <div className="no-print flex h-11 shrink-0 items-center border-line border-b px-4 md:px-6">
          <div className="min-w-0 flex-1">
            <Breadcrumbs />
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Left navigation rail (desktop) */}
          <aside
            className={cn(
              "no-print hidden shrink-0 border-line border-r transition-[width] duration-200 ease-out lg:block",
              collapsed ? "w-[68px]" : "w-[292px]",
            )}
          >
            <div className="sticky top-0 h-[calc(100dvh-3.25rem)]">
              <Sidebar collapsed={collapsed} onToggle={toggle} />
            </div>
          </aside>

          <main id="main" className="min-w-0 flex-1">
            <div className="mx-auto w-full max-w-[1240px] px-4 py-6 md:px-8 md:py-10">
              <div key={location.pathname} className="animate-fade-up">
                <Suspense
                  fallback={
                    <div className="flex min-h-[40vh] items-center justify-center">
                      <Spinner size={20} className="text-muted" />
                      <span className="sr-only">Loading page…</span>
                    </div>
                  }
                >
                  <Outlet />
                </Suspense>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Mobile navigation drawer (from the left) */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
          />
          <div className="app-window absolute inset-y-0 left-0 w-[300px] max-w-[85vw] animate-slide-in-left border-line-strong border-r shadow-overlay">
            <Sidebar
              collapsed={false}
              onClose={() => setMobileOpen(false)}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
