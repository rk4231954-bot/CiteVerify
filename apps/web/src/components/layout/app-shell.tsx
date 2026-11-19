import { cn, Icon, Kbd, Spinner } from "@citeverify/ui";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { BackendStatusPill } from "../system/backend-status.tsx";
import { Breadcrumbs } from "./breadcrumbs.tsx";
import { CommandPalette } from "./command-palette.tsx";
import { Sidebar } from "./sidebar.tsx";
import { UserMenu } from "./user-menu.tsx";

const COLLAPSE_KEY = "citeverify.sidebar.collapsed";

export function AppShell() {
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

  return (
    <div className="min-h-dvh bg-paper">
      <a
        href="#main"
        className="fixed top-2 left-2 z-[70] -translate-y-20 rounded-md bg-navy-900 px-3 py-2 text-sm text-white focus:translate-y-0"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "no-print fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 ease-out lg:block",
          collapsed ? "w-[68px]" : "w-60",
        )}
      >
        <Sidebar collapsed={collapsed} onToggle={toggle} />
      </aside>

      {/* Mobile navigation */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 animate-fade-in bg-navy-950/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 animate-slide-in-right shadow-overlay">
            <Sidebar
              collapsed={false}
              mobile
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "transition-[padding] duration-200 ease-out print:pl-0!",
          collapsed ? "lg:pl-[68px]" : "lg:pl-60",
        )}
      >
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-line border-b bg-paper/85 px-4 backdrop-blur-md md:px-6">
          <button
            type="button"
            className="-ml-1 rounded-md p-1.5 text-ink-soft hover:bg-navy-50 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
          >
            <Icon name="menu" size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <Breadcrumbs />
          </div>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-9 items-center gap-2 rounded-md border border-line-strong bg-surface px-2.5 text-[13px] text-subtle shadow-card transition-colors hover:border-navy-200 hover:text-ink-soft md:w-64"
            aria-label="Search documents and pages"
          >
            <Icon name="search" size={16} />
            <span className="hidden flex-1 text-left md:block">Search…</span>
            <span className="hidden md:flex">
              <Kbd>Ctrl K</Kbd>
            </span>
          </button>
          <BackendStatusPill />
          <UserMenu />
        </header>

        <main
          id="main"
          className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8"
        >
          <div key={location.pathname} className="animate-fade-up">
            <Suspense
              fallback={
                <div className="flex min-h-[40vh] items-center justify-center">
                  <Spinner size={20} className="text-primary-500" />
                  <span className="sr-only">Loading page…</span>
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
