/**
 * Research discovery — a masonry view of the publications retrieved for the
 * reference lists of the user's documents. The API has no related-publication
 * or recommendation endpoint, so nothing beyond those publications is shown.
 */
import {
  Badge,
  buttonClass,
  Callout,
  Card,
  EmptyState,
  Input,
  Select,
  Skeleton,
} from "@citeverify/ui";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ErrorState, FilterChip, PageHeader } from "../components/common.tsx";
import { plural, truncate } from "../lib/format.ts";
import { useAllPublications } from "../lib/hooks.ts";

type Sort = "cited" | "newest" | "oldest" | "title";

export function DiscoveryPage() {
  const pubs = useAllPublications();
  const [query, setQuery] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [abstractOnly, setAbstractOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("cited");

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = (pubs.data ?? []).filter(
      (p) =>
        (!openOnly || p.openAccess) &&
        (!abstractOnly || p.abstract) &&
        (!q ||
          [
            p.title,
            p.abstract ?? "",
            p.journal ?? "",
            p.authors.join(" "),
          ].some((s) => s.toLowerCase().includes(q))),
    );
    const by: Record<
      Sort,
      (a: (typeof rows)[number], b: (typeof rows)[number]) => number
    > = {
      cited: (a, b) =>
        b.referenceCount - a.referenceCount || a.title.localeCompare(b.title),
      newest: (a, b) => (b.year ?? 0) - (a.year ?? 0),
      oldest: (a, b) => (a.year ?? 9999) - (b.year ?? 9999),
      title: (a, b) => a.title.localeCompare(b.title),
    };
    return [...rows].sort(by[sort]);
  }, [pubs.data, query, openOnly, abstractOnly, sort]);

  return (
    <>
      <PageHeader
        eyebrow="Research discovery"
        icon="discovery"
        title="Your cited literature"
        description="Every publication retrieved for the reference lists of your documents, with its abstract and where you cite it."
      />
      <Callout
        tone="info"
        title="Related-publication discovery is not available"
        className="mb-5"
      >
        The CiteVerify API does not provide recommendations or related-work
        search. This view only shows publications already retrieved for your
        documents' references — no suggestions are generated.
      </Callout>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Input
          icon="search"
          placeholder="Search titles, abstracts, authors"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search publications"
          className="w-full sm:w-80"
        />
        <Select
          aria-label="Sort publications"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="sm:w-44"
        >
          <option value="cited">Most cited</option>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="title">Title A–Z</option>
        </Select>
        <FilterChip
          active={openOnly}
          onClick={() => setOpenOnly((v) => !v)}
          label="Open access"
        />
        <FilterChip
          active={abstractOnly}
          onClick={() => setAbstractOnly((v) => !v)}
          label="Has abstract"
        />
        {pubs.data ? (
          <span className="ml-auto text-[12.5px] text-muted">
            {plural(items.length, "publication")}
          </span>
        ) : null}
      </div>

      {pubs.error && !pubs.data ? (
        <Card>
          <ErrorState error={pubs.error} onRetry={pubs.refetch} />
        </Card>
      ) : !pubs.data ? (
        <div className="gap-4 [column-fill:_balance] sm:columns-2 xl:columns-3">
          {["h-44", "h-64", "h-36", "h-56", "h-72", "h-40"].map((h) => (
            <Skeleton
              key={h}
              className={`mb-4 w-full break-inside-avoid ${h}`}
            />
          ))}
        </div>
      ) : pubs.data.length === 0 ? (
        <Card>
          <EmptyState
            icon="discovery"
            title="No publications retrieved yet"
            description="Upload a document and run publication retrieval to populate your literature."
            action={
              <Link to="/upload" className={buttonClass("primary")}>
                Upload a document
              </Link>
            }
          />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            compact
            icon="filter"
            title="No publication matches these filters"
          />
        </Card>
      ) : (
        <div className="gap-4 sm:columns-2 xl:columns-3">
          {items.map((p) => (
            <article
              key={p.id}
              className="mb-4 break-inside-avoid rounded-md border border-line bg-surface p-5 shadow-card transition-shadow hover:shadow-raised"
            >
              <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                {p.year ? <Badge tone="dark">{p.year}</Badge> : null}
                {p.openAccess ? <Badge tone="teal">Open access</Badge> : null}
                <Badge tone="slate">Cited {p.referenceCount}×</Badge>
              </div>
              <h2 className="font-display text-[16.5px] text-navy-950 leading-snug">
                <Link
                  to={`/publications/${p.id}`}
                  className="hover:text-primary-600 focus-visible:underline"
                >
                  {p.title}
                </Link>
              </h2>
              <p className="mt-1.5 text-[12.5px] text-muted">
                {[
                  truncate(
                    p.authors.slice(0, 4).join(", ") +
                      (p.authors.length > 4 ? " et al." : ""),
                    120,
                  ),
                  p.journal,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {p.abstract ? (
                <p className="mt-3 text-[13px] text-ink-soft leading-relaxed">
                  {truncate(p.abstract, 420)}
                </p>
              ) : (
                <p className="mt-3 text-[12.5px] text-subtle italic">
                  No abstract available.
                </p>
              )}
              <div className="mt-4 border-line border-t pt-3">
                <p className="mb-1.5 text-[11px] text-subtle uppercase tracking-[0.08em]">
                  Cited in
                </p>
                <ul className="space-y-1">
                  {p.documents.map((d) => (
                    <li key={d.id}>
                      <Link
                        to={`/documents/${d.id}?tab=publications`}
                        className="text-[12.5px] text-primary-600 hover:underline"
                      >
                        {truncate(d.title, 60)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
