import { ClaimCategory } from "@citeverify/shared";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  Drawer,
  EmptyState,
  Icon,
  Input,
  Select,
  Skeleton,
  Tabs,
} from "@citeverify/ui";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  ConfidenceMeter,
  ErrorState,
  KeyValue,
  PageHeader,
  SectionLabel,
  VerdictBadge,
} from "../components/common.tsx";
import { DataGrid, GridToolbar } from "../components/data-grid/data-grid.tsx";
import { api } from "../lib/api.ts";
import {
  CATEGORY_LABEL,
  categoryLabel,
  MATCH_TONE,
  VERDICT_ORDER,
  VERDICTS,
} from "../lib/domain.ts";
import { humanize, pct, plural, truncate } from "../lib/format.ts";
import {
  useAllPublications,
  useClaimVerification,
  useDocData,
} from "../lib/hooks.ts";
import { useQuery } from "../lib/query.ts";
import {
  type CitationRow,
  type ClaimRow,
  citationRows,
  claimRows,
} from "../lib/workspace.ts";

type Tab = "claims" | "citations" | "publications";

export function ClaimsCitationsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "claims";
  const docFilter = params.get("doc") ?? "";
  const data = useDocData();
  const pubs = useAllPublications();

  const claims = useMemo(
    () => (data.data ? claimRows(data.data) : []),
    [data.data],
  );
  const citations = useMemo(
    () => (data.data ? citationRows(data.data) : []),
    [data.data],
  );
  const documents = data.data?.map((d) => d.document) ?? [];

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  return (
    <>
      <PageHeader
        eyebrow="Data"
        icon="claims"
        title="Claims & Citations"
        description="Every extracted claim, in-text citation and retrieved publication across your documents."
      />
      <Card className="overflow-hidden">
        <div className="px-4 pt-1">
          <Tabs
            idPrefix="cc"
            value={tab}
            onChange={(t) => setParam("tab", t === "claims" ? "" : t)}
            items={[
              {
                key: "claims",
                label: "Claims",
                count: data.data ? claims.length : undefined,
              },
              {
                key: "citations",
                label: "Citations",
                count: data.data ? citations.length : undefined,
              },
              {
                key: "publications",
                label: "Publications",
                count: pubs.data ? pubs.data.length : undefined,
              },
            ]}
            className="border-b-0"
          />
        </div>
        <div className="border-line border-t">
          {tab === "publications" ? (
            <PublicationsGrid query={pubs} />
          ) : data.error && !data.data ? (
            <ErrorState error={data.error} onRetry={data.refetch} />
          ) : tab === "claims" ? (
            <ClaimsGrid
              rows={claims}
              loading={!data.data}
              documents={documents}
              docFilter={docFilter}
              onDoc={(v) => setParam("doc", v)}
            />
          ) : (
            <CitationsGrid
              rows={citations}
              loading={!data.data}
              documents={documents}
              docFilter={docFilter}
              onDoc={(v) => setParam("doc", v)}
            />
          )}
        </div>
      </Card>
    </>
  );
}

export function DocSelect({
  documents,
  value,
  onChange,
}: {
  documents: Array<{ id: string; title: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filter by document"
      className="sm:w-56"
    >
      <option value="">All documents</option>
      {documents.map((d) => (
        <option key={d.id} value={d.id}>
          {truncate(d.title, 48)}
        </option>
      ))}
    </Select>
  );
}

function ClaimsGrid({
  rows,
  loading,
  documents,
  docFilter,
  onDoc,
}: {
  rows: ClaimRow[];
  loading: boolean;
  documents: Array<{ id: string; title: string }>;
  docFilter: string;
  onDoc: (v: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [verdict, setVerdict] = useState("");
  const [selected, setSelected] = useState<ClaimRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!docFilter || r.document.id === docFilter) &&
        (!category || r.category === category) &&
        (!verdict ||
          (verdict === "UNVERIFIED"
            ? r.verdict === null
            : verdict === "REVIEW"
              ? r.needsReview
              : r.verdict === verdict)) &&
        (!q ||
          r.originalText.toLowerCase().includes(q) ||
          (r.section ?? "").toLowerCase().includes(q)),
    );
  }, [rows, query, category, verdict, docFilter]);

  return (
    <>
      <GridToolbar>
        <Input
          icon="search"
          placeholder="Search claim text or section"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search claims"
          className="sm:w-72"
        />
        <DocSelect documents={documents} value={docFilter} onChange={onDoc} />
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
          className="sm:w-48"
        >
          <option value="">All categories</option>
          {Object.values(ClaimCategory).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </Select>
        <Select
          value={verdict}
          onChange={(e) => setVerdict(e.target.value)}
          aria-label="Filter by verdict"
          className="sm:w-48"
        >
          <option value="">Any verification</option>
          <option value="UNVERIFIED">Not verified</option>
          <option value="REVIEW">Human review recommended</option>
          {VERDICT_ORDER.map((v) => (
            <option key={v} value={v}>
              {VERDICTS[v].label}
            </option>
          ))}
        </Select>
      </GridToolbar>
      <DataGrid
        loading={loading}
        rows={filtered}
        noun="claims"
        resetKey={`${query}|${category}|${verdict}|${docFilter}`}
        rowKey={(r) => r.id}
        selectedKey={selected?.id}
        onRowClick={setSelected}
        empty={
          rows.length === 0 ? (
            <EmptyState
              icon="claims"
              title="No claims yet"
              description="Claims appear after a document's text is extracted and claim identification has run."
              action={
                <Link to="/documents" className={buttonClass("secondary")}>
                  Go to documents
                </Link>
              }
            />
          ) : (
            <EmptyState
              compact
              icon="search"
              title="No claims match these filters"
            />
          )
        }
        columns={[
          {
            key: "text",
            header: "Claim",
            sortValue: (r) => r.originalText.toLowerCase(),
            className: "max-w-[28rem]",
            cell: (r) => (
              <div>
                <p className="line-clamp-2 text-[13.5px] text-ink leading-snug">
                  {r.originalText}
                </p>
                <div className="mt-0.5 truncate text-[12px] text-muted">
                  {r.document.title}
                  {r.section ? ` · ${r.section}` : ""}
                  {r.pageNumber ? ` · p. ${r.pageNumber}` : ""}
                </div>
              </div>
            ),
          },
          {
            key: "category",
            header: "Category",
            sortValue: (r) => r.category,
            hideBelow: "lg",
            cell: (r) => (
              <Badge tone="neutral">{categoryLabel(r.category)}</Badge>
            ),
          },
          {
            key: "citations",
            header: "Citations",
            align: "right",
            sortValue: (r) => r.citationCount,
            hideBelow: "xl",
            cell: (r) => <span className="tabular">{r.citationCount}</span>,
          },
          {
            key: "verdict",
            header: "Verdict",
            sortValue: (r) =>
              r.verdict ? VERDICT_ORDER.indexOf(r.verdict) : 99,
            cell: (r) =>
              r.verdict ? (
                <VerdictBadge verdict={r.verdict} size="sm" />
              ) : (
                <span className="text-[12.5px] text-subtle">Not verified</span>
              ),
          },
          {
            key: "confidence",
            header: "Assessment",
            sortValue: (r) => r.verificationConfidence,
            hideBelow: "lg",
            cell: (r) => (
              <div className="flex items-center gap-2">
                <ConfidenceMeter value={r.verificationConfidence} />
                {r.needsReview ? (
                  <Icon
                    name="user"
                    size={14}
                    className="text-warning-500"
                    aria-label="Human review recommended"
                  />
                ) : null}
              </div>
            ),
          },
        ]}
        mobileCard={(r) => (
          <div>
            <p className="line-clamp-3 text-[13.5px] text-ink">
              {r.originalText}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {r.verdict ? (
                <VerdictBadge verdict={r.verdict} size="sm" />
              ) : (
                <Badge>Not verified</Badge>
              )}
              <Badge tone="neutral">{categoryLabel(r.category)}</Badge>
              <span className="text-[12px] text-muted">
                {truncate(r.document.title, 40)}
              </span>
            </div>
          </div>
        )}
      />
      <ClaimDrawer claim={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function ClaimDrawer({
  claim,
  onClose,
}: {
  claim: ClaimRow | null;
  onClose: () => void;
}) {
  const detail = useQuery(claim ? `claimdetail:${claim.id}` : null, () =>
    api.claims.get(claim?.id as string).then((r) => r.claim),
  );
  const verification = useClaimVerification(claim?.id);
  const result = verification.data?.result;
  return (
    <Drawer
      open={claim !== null}
      onClose={onClose}
      title="Claim details"
      subtitle={
        claim
          ? `${claim.document.title}${claim.pageNumber ? ` · page ${claim.pageNumber}` : ""}`
          : undefined
      }
      footer={
        claim ? (
          <>
            <Link
              to={`/documents/${claim.document.id}/workspace?claim=${claim.id}`}
              className={buttonClass("primary", "sm")}
            >
              <Icon name="split" size={15} /> Open in evidence workspace
            </Link>
            <Link
              to={`/documents/${claim.document.id}?tab=claims`}
              className={buttonClass("secondary", "sm")}
            >
              Document
            </Link>
          </>
        ) : null
      }
    >
      {claim ? (
        <div className="space-y-6">
          <blockquote className="border-primary-500 border-l-2 pl-4 font-display text-[17px] text-navy-950 leading-relaxed">
            {claim.originalText}
          </blockquote>
          <KeyValue
            items={[
              { label: "Category", value: categoryLabel(claim.category) },
              { label: "Section", value: claim.section ?? "—" },
              {
                label: "Extraction",
                value: `${humanize(claim.extractionMethod)} · ${pct(claim.confidence)} extraction confidence`,
              },
              {
                label: "Characteristics",
                value: claim.characteristics.length
                  ? claim.characteristics.map(humanize).join(", ")
                  : "—",
              },
            ]}
          />
          {claim.rationale.length ? (
            <div>
              <SectionLabel>Why this was identified as a claim</SectionLabel>
              <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-soft">
                {claim.rationale.map((r, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: rationale lines can repeat, so position disambiguates.
                  <li key={`${i}:${r}`}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <SectionLabel>Linked citations</SectionLabel>
            {!detail.data ? (
              <Skeleton className="h-14 w-full" />
            ) : detail.data.citations.length === 0 ? (
              <p className="text-[13px] text-muted">
                No citation is linked to this claim.
              </p>
            ) : (
              <ul className="space-y-2">
                {detail.data.citations.map((c) => (
                  <li
                    key={c.citationId}
                    className="rounded-md border border-line px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[12.5px] text-ink">
                        {c.citationText}
                      </span>
                      <Badge tone={MATCH_TONE[c.matchStatus] ?? "neutral"}>
                        {humanize(c.matchStatus)}
                      </Badge>
                      <Badge
                        tone={c.linkStatus === "LINKED" ? "primary" : "warning"}
                      >
                        {c.linkStatus === "LINKED"
                          ? "Linked"
                          : "Link needs review"}
                      </Badge>
                    </div>
                    {c.linkReason ? (
                      <p className="mt-1 text-[12px] text-muted">
                        {c.linkReason}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <SectionLabel>Latest verification</SectionLabel>
            {verification.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : result ? (
              <div className="space-y-2 rounded-md border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <VerdictBadge verdict={result.verdict} />
                  <ConfidenceMeter value={result.confidence} showLabel />
                </div>
                <p className="text-[13px] text-ink-soft leading-relaxed">
                  {result.explanation}
                </p>
                <p className="text-[11.5px] text-subtle">{result.disclaimer}</p>
              </div>
            ) : (
              <p className="text-[13px] text-muted">
                This claim has not been verified yet.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}

function CitationsGrid({
  rows,
  loading,
  documents,
  docFilter,
  onDoc,
}: {
  rows: CitationRow[];
  loading: boolean;
  documents: Array<{ id: string; title: string }>;
  docFilter: string;
  onDoc: (v: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<CitationRow | null>(null);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!docFilter || r.document.id === docFilter) &&
        (!status || r.matchStatus === status) &&
        (!q ||
          r.citationText.toLowerCase().includes(q) ||
          (r.reference?.title ?? r.reference?.rawText ?? "")
            .toLowerCase()
            .includes(q)),
    );
  }, [rows, query, status, docFilter]);

  return (
    <>
      <GridToolbar>
        <Input
          icon="search"
          placeholder="Search citation or reference"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search citations"
          className="sm:w-72"
        />
        <DocSelect documents={documents} value={docFilter} onChange={onDoc} />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by match status"
          className="sm:w-48"
        >
          <option value="">Any match status</option>
          <option value="MATCHED">Matched</option>
          <option value="NEEDS_REVIEW">Needs review</option>
          <option value="AMBIGUOUS">Ambiguous</option>
          <option value="UNMATCHED">Unmatched</option>
        </Select>
      </GridToolbar>
      <DataGrid
        loading={loading}
        rows={filtered}
        noun="citations"
        resetKey={`${query}|${status}|${docFilter}`}
        rowKey={(r) => r.id}
        selectedKey={selected?.id}
        onRowClick={setSelected}
        empty={
          rows.length === 0 ? (
            <EmptyState
              icon="quote"
              title="No citations yet"
              description="Citations appear after citation mapping runs on a document."
            />
          ) : (
            <EmptyState
              compact
              icon="search"
              title="No citations match these filters"
            />
          )
        }
        columns={[
          {
            key: "text",
            header: "Citation",
            sortValue: (r) => r.citationText,
            cell: (r) => (
              <div>
                <div className="font-mono text-[12.5px] text-ink">
                  {r.citationText}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-muted">
                  {truncate(r.document.title, 40)}
                  {r.pageNumber ? ` · p. ${r.pageNumber}` : ""}
                </div>
              </div>
            ),
          },
          {
            key: "reference",
            header: "Reference",
            className: "max-w-[24rem]",
            sortValue: (r) => r.reference?.title ?? r.reference?.rawText ?? "",
            cell: (r) =>
              r.reference ? (
                <div className="min-w-0">
                  <div className="line-clamp-1 text-[13px] text-ink">
                    {r.reference.title ?? r.reference.rawText}
                  </div>
                  <div className="truncate text-[12px] text-muted">
                    {r.reference.authors.slice(0, 3).join(", ")}
                    {r.reference.year ? ` · ${r.reference.year}` : ""}
                  </div>
                </div>
              ) : (
                <span className="text-[12.5px] text-subtle">No reference</span>
              ),
          },
          {
            key: "type",
            header: "Type",
            hideBelow: "xl",
            sortValue: (r) => r.citationType,
            cell: (r) => (
              <span className="text-[12.5px] text-muted">
                {humanize(r.citationType)}
              </span>
            ),
          },
          {
            key: "status",
            header: "Match",
            sortValue: (r) => r.matchStatus,
            cell: (r) => (
              <div className="flex items-center gap-2">
                <Badge tone={MATCH_TONE[r.matchStatus] ?? "neutral"} dot>
                  {humanize(r.matchStatus)}
                </Badge>
                {r.matchConfidence !== null ? (
                  <span className="tabular text-[12px] text-subtle">
                    {pct(r.matchConfidence)}
                  </span>
                ) : null}
              </div>
            ),
          },
          {
            key: "claims",
            header: "Claims",
            align: "right",
            hideBelow: "lg",
            sortValue: (r) => r.claims.length,
            cell: (r) => <span className="tabular">{r.claims.length}</span>,
          },
        ]}
        mobileCard={(r) => (
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[13px] text-ink">
                {r.citationText}
              </span>
              <Badge tone={MATCH_TONE[r.matchStatus] ?? "neutral"} dot>
                {humanize(r.matchStatus)}
              </Badge>
            </div>
            <p className="mt-1 line-clamp-2 text-[12.5px] text-muted">
              {r.reference?.title ?? r.reference?.rawText ?? "No reference"}
            </p>
          </div>
        )}
      />
      <CitationDrawer citation={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function CitationDrawer({
  citation,
  onClose,
}: {
  citation: CitationRow | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  return (
    <Drawer
      open={citation !== null}
      onClose={onClose}
      title={
        citation ? (
          <span className="font-mono">{citation.citationText}</span>
        ) : (
          "Citation"
        )
      }
      subtitle={citation?.document.title}
      footer={
        citation ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              navigate(`/documents/${citation.document.id}?tab=citations`)
            }
          >
            Open document
          </Button>
        ) : null
      }
    >
      {citation ? (
        <div className="space-y-6">
          <KeyValue
            items={[
              {
                label: "Match status",
                value: (
                  <Badge tone={MATCH_TONE[citation.matchStatus] ?? "neutral"}>
                    {humanize(citation.matchStatus)}
                  </Badge>
                ),
              },
              {
                label: "Match confidence",
                value: pct(citation.matchConfidence),
              },
              {
                label: "Citation style",
                value: humanize(citation.citationType),
              },
              {
                label: "Location",
                value:
                  [
                    citation.section,
                    citation.pageNumber ? `page ${citation.pageNumber}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—",
              },
            ]}
          />
          <div>
            <SectionLabel>Reference entry</SectionLabel>
            {citation.reference ? (
              <div className="rounded-md border border-line bg-paper px-3.5 py-3 text-[13px] text-ink-soft leading-relaxed">
                {citation.reference.rawText}
                {citation.reference.doi ? (
                  <a
                    href={`https://doi.org/${citation.reference.doi}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 flex items-center gap-1 font-mono text-[12px] text-primary-600 hover:underline"
                  >
                    doi:{citation.reference.doi}{" "}
                    <Icon name="external" size={12} />
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="text-[13px] text-muted">
                The citation could not be matched to an entry in the reference
                list.
              </p>
            )}
          </div>
          <div>
            <SectionLabel>Claims using this citation</SectionLabel>
            {citation.claims.length === 0 ? (
              <p className="text-[13px] text-muted">
                No claim is linked to this citation.
              </p>
            ) : (
              <ul className="space-y-2">
                {citation.claims.map((l) => (
                  <li key={l.claimId}>
                    <Link
                      to={`/documents/${citation.document.id}/workspace?claim=${l.claimId}`}
                      className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-[13px] hover:border-primary-200 hover:bg-primary-50/40"
                    >
                      <span className="text-ink-soft">
                        {l.reason ?? "Linked claim"}
                      </span>
                      <Badge
                        tone={l.status === "LINKED" ? "primary" : "warning"}
                      >
                        {l.status === "LINKED" ? "Linked" : "Needs review"}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}

function PublicationsGrid({
  query: pubs,
}: {
  query: ReturnType<typeof useAllPublications>;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [oa, setOa] = useState("");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (pubs.data ?? []).filter(
      (p) =>
        (!oa || (oa === "oa" ? p.openAccess : !p.openAccess)) &&
        (!q ||
          p.title.toLowerCase().includes(q) ||
          p.authors.join(" ").toLowerCase().includes(q) ||
          (p.journal ?? "").toLowerCase().includes(q)),
    );
  }, [pubs.data, query, oa]);
  if (pubs.error && !pubs.data)
    return <ErrorState error={pubs.error} onRetry={pubs.refetch} />;
  return (
    <>
      <GridToolbar>
        <Input
          icon="search"
          placeholder="Search title, author or journal"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search publications"
          className="sm:w-72"
        />
        <Select
          value={oa}
          onChange={(e) => setOa(e.target.value)}
          aria-label="Filter by access"
          className="sm:w-48"
        >
          <option value="">Any access</option>
          <option value="oa">Open access</option>
          <option value="closed">Not open access</option>
        </Select>
      </GridToolbar>
      <DataGrid
        loading={!pubs.data}
        rows={rows}
        noun="publications"
        resetKey={`${query}|${oa}`}
        rowKey={(p) => p.id}
        onRowClick={(p) => navigate(`/publications/${p.id}`)}
        initialSort={{ key: "year", dir: "desc" }}
        empty={
          (pubs.data ?? []).length === 0 ? (
            <EmptyState
              icon="book"
              title="No publications retrieved yet"
              description="Publications appear after references are looked up in Crossref and OpenAlex."
            />
          ) : (
            <EmptyState compact icon="search" title="No publications match" />
          )
        }
        columns={[
          {
            key: "title",
            header: "Publication",
            className: "max-w-[30rem]",
            sortValue: (p) => p.title.toLowerCase(),
            cell: (p) => (
              <div>
                <div className="line-clamp-2 font-medium text-[13.5px] text-ink group-hover:text-primary-600">
                  {p.title}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-muted">
                  {p.authors.slice(0, 3).join(", ")}
                  {p.authors.length > 3 ? " et al." : ""}
                </div>
              </div>
            ),
          },
          {
            key: "year",
            header: "Year",
            align: "right",
            sortValue: (p) => p.year,
            cell: (p) => <span className="tabular">{p.year ?? "—"}</span>,
          },
          {
            key: "journal",
            header: "Venue",
            hideBelow: "lg",
            sortValue: (p) => p.journal ?? "",
            cell: (p) => (
              <span className="line-clamp-1 text-[12.5px] text-muted">
                {p.journal ?? "—"}
              </span>
            ),
          },
          {
            key: "access",
            header: "Access",
            sortValue: (p) => (p.openAccess ? 1 : 0),
            cell: (p) =>
              p.openAccess ? (
                <Badge tone="success">Open access</Badge>
              ) : (
                <Badge tone="neutral">Metadata / abstract</Badge>
              ),
          },
          {
            key: "docs",
            header: "Cited in",
            hideBelow: "xl",
            sortValue: (p) => p.documents.length,
            cell: (p) => (
              <span className="text-[12.5px] text-muted">
                {plural(p.documents.length, "document")}
              </span>
            ),
          },
        ]}
        mobileCard={(p) => (
          <div>
            <div className="line-clamp-2 font-medium text-[13.5px] text-ink">
              {p.title}
            </div>
            <div className="mt-1 text-[12px] text-muted">
              {p.year ?? "—"} · {p.journal ?? "Unknown venue"}
            </div>
          </div>
        )}
      />
    </>
  );
}
