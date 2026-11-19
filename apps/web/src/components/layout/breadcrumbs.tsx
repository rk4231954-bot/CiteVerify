import { Icon } from "@citeverify/ui";
import { Fragment, type ReactNode, useEffect, useRef } from "react";
import { Link, useMatches, useParams } from "react-router";
import { useDocument, usePublication } from "../../lib/hooks.ts";

export interface CrumbHandle {
  crumb: (params: Record<string, string | undefined>) => ReactNode;
}

export function DocumentCrumb({ id }: { id?: string }) {
  const { data } = useDocument(id);
  return <>{data?.title ?? "Document"}</>;
}

export function PublicationCrumb({ id }: { id?: string }) {
  const { data } = usePublication(id);
  const t = data?.publication.title;
  return <>{t ? (t.length > 48 ? `${t.slice(0, 47)}…` : t) : "Publication"}</>;
}

export function Breadcrumbs() {
  const matches = useMatches();
  const params = useParams();
  const navRef = useRef<HTMLElement>(null);
  // Mirror the current crumb into the tab title (crumbs such as document titles load async).
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const sync = () => {
      const current = nav
        .querySelector('[aria-current="page"]')
        ?.textContent?.trim();
      document.title =
        current && current !== "CiteVerify"
          ? `${current} · CiteVerify`
          : "CiteVerify";
    };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(nav, { subtree: true, childList: true, characterData: true });
    return () => mo.disconnect();
  });
  const crumbs = matches.filter(
    (m) => (m.handle as CrumbHandle | undefined)?.crumb,
  );
  if (crumbs.length === 0) return null;
  return (
    <nav ref={navRef} aria-label="Breadcrumb" className="h-11 min-w-0">
      <ol className="flex h-full min-w-0 items-center gap-2 text-[13px]">
        {crumbs.map((m, i) => {
          const last = i === crumbs.length - 1;
          const label = (m.handle as CrumbHandle).crumb(params);
          return (
            <Fragment key={m.id}>
              {i > 0 ? (
                <li aria-hidden="true" className="hidden text-subtle sm:block">
                  <Icon name="chevronRight" size={14} />
                </li>
              ) : null}
              <li
                className={
                  last
                    ? "relative flex h-full min-w-0 items-center font-medium text-ink after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:rounded-full after:bg-ink"
                    : "hidden shrink-0 text-muted sm:block"
                }
              >
                {last ? (
                  <span aria-current="page" className="truncate">
                    {label}
                  </span>
                ) : (
                  <Link to={m.pathname} className="hover:text-ink">
                    {label}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
