import {
  Badge,
  Button,
  buttonClass,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  cn,
  EmptyState,
  Icon,
  Input,
  Segmented,
  Skeleton,
  TabPanel,
  Tabs,
  useToast,
} from "@citeverify/ui";
import { type ReactNode, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import {
  AutomatedNotice,
  ConfidenceMeter,
  ErrorState,
  FilterChip,
  KeyValue,
  LoadingRows,
  PageHeader,
  ProcessingBadge,
  SectionLabel,
  VerdictBadge,
} from "../components/common.tsx";
import { RelationshipGraph } from "../components/graph/relationship-graph.tsx";
import { ProcessingJourney } from "../components/processing/journey.tsx";
import { Highlighted } from "../components/verification/evidence.tsx";
import { ResultDetail } from "../components/verification/result-detail.tsx";
import { ApiError, api, errorMessage } from "../lib/api.ts";
import {
  categoryLabel,
  MATCH_TONE,
  VERDICT_ORDER,
  VERDICTS,
} from "../lib/domain.ts";
import {
  formatBytes,
  formatDateTime,
  humanize,
  pct,
  plural,
} from "../lib/format.ts";
import {
  invalidateDocument,
  useCitations,
  useClaims,
  useDocument,
  useExtraction,
  usePublications,
  useReferences,
  useVerification,
} from "../lib/hooks.ts";
import type { Claim } from "../lib/types.ts";
import { NotFoundPage } from "./not-found.tsx";

type Tab =
  | "overview"
  | "text"
  | "claims"
  | "citations"
  | "publications"
  | "relationships"
  | "verification";
const PREFIX = "doc";

export function DocumentPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "overview";
  const doc = useDocument(id, { refetchInterval: 15_000 });
  const verification = useVerification(id);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);

  if (doc.error && !doc.data) {
    if (doc.error instanceof ApiError && doc.error.status === 404)
      return (
        <NotFoundPage
          title="Document not found"
          description="It may have been deleted, or it belongs to another account."
        />
      );
    return (
      <Card>
        <ErrorState error={doc.error} onRetry={doc.refetch} />
      </Card>
    );
  }
  const d = doc.data;
  const verified = Boolean(verification.data?.job);

  return (
    <>
      <PageHeader
        eyebrow="Document analysis"
        title={d ? d.title : <Skeleton className="h-9 w-96 max-w-full" />}
        description={
          d ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{d.originalFilename}</span>
              <span className="text-line-strong">·</span>
              <span>{formatBytes(d.fileSize)}</span>
              <span className="text-line-strong">·</span>
              <span>Uploaded {formatDateTime(d.createdAt)}</span>
              <ProcessingBadge document={d} verified={verified} />
            </span>
          ) : undefined
        }
        actions={
          d ? (
            <>
              <Button
                variant="ghost"
                icon="trash"
                onClick={() => setConfirm(true)}
                className="text-muted hover:text-danger-600"
              >
                Delete
              </Button>
              {verified ? (
                <Link
                  to={`/reports/${d.id}`}
                  className={buttonClass("secondary")}
                >
                  <Icon name="reports" size={16} /> Report
                </Link>
              ) : null}
              <Link
                to={`/documents/${d.id}/workspace`}
                className={buttonClass("primary")}
              >
                <Icon name="split" size={16} /> Evidence workspace
              </Link>
            </>
          ) : null
        }
      />

      <Tabs
        idPrefix={PREFIX}
        value={tab}
        onChange={(t) => {
          const next = new URLSearchParams(params);
          if (t === "overview") next.delete("tab");
          else next.set("tab", t);
          setParams(next, { replace: true });
        }}
        items={[
          { key: "overview", label: "Overview" },
          { key: "text", label: "Extracted text" },
          { key: "claims", label: "Claims", count: d?.counts.claims },
          { key: "citations", label: "Citations", count: d?.counts.citations },
          { key: "publications", label: "Publications" },
          { key: "relationships", label: "Relationships" },
          {
            key: "verification",
            label: "Verification",
            count: verification.data?.job
              ? verification.data.results.length
              : undefined,
          },
        ]}
        className="mb-5"
      />

      {id ? (
        <TabPanel tabKey={tab} idPrefix={PREFIX}>
          {tab === "overview" ? <OverviewTab id={id} /> : null}
          {tab === "text" ? <TextTab id={id} /> : null}
          {tab === "claims" ? <ClaimsTab id={id} /> : null}
          {tab === "citations" ? <CitationsTab id={id} /> : null}
          {tab === "publications" ? <PublicationsTab id={id} /> : null}
          {tab === "relationships" ? <RelationshipsTab id={id} /> : null}
          {tab === "verification" ? <VerificationTab id={id} /> : null}
        </TabPanel>
      ) : null}

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete this document?"
        description="This permanently deletes the file and its extraction, claims, citations, references and verification results."
        confirmLabel="Delete document"
        onConfirm={async () => {
          if (!d) return;
          try {
            await api.documents.remove(d.id);
            invalidateDocument(d.id);
            toast({
              tone: "success",
              title: "Document deleted",
              description: d.title,
            });
            navigate("/documents", { replace: true });
          } catch (err) {
            toast({
              tone: "error",
              title: "Could not delete the document",
              description: errorMessage(err),
            });
          }
        }}
      />
    </>
  );
}

/** Expandable section (native <details> for keyboard and screen-reader support). */
function Expandable({
  summary,
  children,
  defaultOpen = false,
  className,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        "group rounded-md border border-line bg-surface open:shadow-card",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <Icon
          name="chevronRight"
          size={15}
          className="shrink-0 text-subtle transition-transform group-open:rotate-90"
        />
        <div className="min-w-0 flex-1">{summary}</div>
      </summary>
      <div className="border-line border-t px-4 py-3">{children}</div>
    </details>
  );
}

function OverviewTab({ id }: { id: string }) {
  const doc = useDocument(id);
  const ex = useExtraction(id);
  const r = ex.data?.extraction?.result;
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <ProcessingJourney documentId={id} />
      <div className="space-y-5">
        <Card>
          <CardHeader title="Document metadata" />
          <CardBody>
            {!doc.data ? (
              <LoadingRows rows={3} />
            ) : (
              <KeyValue
                items={[
                  { label: "File", value: doc.data.originalFilename },
                  {
                    label: "Type",
                    value: doc.data.fileType.includes("pdf") ? "PDF" : "DOCX",
                  },
                  { label: "Size", value: formatBytes(doc.data.fileSize) },
                  {
                    label: "Uploaded",
                    value: formatDateTime(doc.data.createdAt),
                  },
                  {
                    label: "Last updated",
                    value: formatDateTime(doc.data.updatedAt),
                  },
                  {
                    label: "Claims · citations · references",
                    value: `${doc.data.counts.claims} · ${doc.data.counts.citations} · ${doc.data.counts.references}`,
                  },
                ]}
              />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Extracted text"
            description={
              ex.data?.extraction
                ? `Extracted ${formatDateTime(ex.data.extraction.extractedAt)}`
                : undefined
            }
          />
          <CardBody>
            {ex.error ? (
              <ErrorState compact error={ex.error} onRetry={ex.refetch} />
            ) : !ex.data ? (
              <LoadingRows rows={3} />
            ) : !ex.data.extraction ? (
              <p className="text-[13px] text-muted">
                Text has not been extracted yet.
              </p>
            ) : (
              <div className="space-y-4">
                <KeyValue
                  items={[
                    {
                      label: "Extraction status",
                      value: humanize(ex.data.extraction.status),
                    },
                    { label: "Format", value: r?.format?.toUpperCase() ?? "—" },
                    { label: "Pages", value: r?.totalPages ?? "—" },
                    {
                      label: "Paragraphs",
                      value: r?.stats.paragraphCount.toLocaleString() ?? "—",
                    },
                    {
                      label: "Words",
                      value: r?.stats.wordCount.toLocaleString() ?? "—",
                    },
                    { label: "Detected title", value: r?.title ?? "—" },
                    {
                      label: "Detected authors",
                      value: r?.authors.length ? r.authors.join(", ") : "—",
                    },
                    {
                      label: "Parser",
                      value:
                        typeof r?.parser === "string"
                          ? r.parser
                          : r?.parser
                            ? [r.parser.name, r.parser.version]
                                .filter(Boolean)
                                .join(" ")
                            : "—",
                    },
                  ]}
                />
                {ex.data.extraction.errorMessage ? (
                  <Callout tone="danger">
                    {ex.data.extraction.errorMessage}
                  </Callout>
                ) : null}
                {r?.warnings.length ? (
                  <Callout
                    tone="warning"
                    title={plural(r.warnings.length, "parser warning")}
                  >
                    <ul className="list-disc pl-4">
                      {r.warnings.slice(0, 5).map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </Callout>
                ) : null}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function TextTab({ id }: { id: string }) {
  const ex = useExtraction(id);
  const claims = useClaims(id);
  const [query, setQuery] = useState("");
  const paragraphs = ex.data?.extraction?.result?.paragraphs ?? [];
  const claimsByParagraph = useMemo(() => {
    const m = new Map<string, Claim[]>();
    for (const c of claims.data ?? [])
      if (c.paragraphId)
        m.set(c.paragraphId, [...(m.get(c.paragraphId) ?? []), c]);
    return m;
  }, [claims.data]);
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const groups: Array<{ section: string; items: typeof paragraphs }> = [];
    for (const p of paragraphs) {
      if (q && !p.cleanedText.toLowerCase().includes(q)) continue;
      const s = p.section ?? "Untitled section";
      const last = groups.at(-1);
      if (last && last.section === s) last.items.push(p);
      else groups.push({ section: s, items: [p] });
    }
    return groups;
  }, [paragraphs, query]);

  if (ex.error)
    return (
      <Card>
        <ErrorState error={ex.error} onRetry={ex.refetch} />
      </Card>
    );
  if (!ex.data) return <LoadingRows rows={6} />;
  if (!ex.data.extraction?.result)
    return (
      <Card>
        <EmptyState
          icon="file"
          title="No extracted text"
          description="Run text extraction from the Overview tab."
        />
      </Card>
    );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          icon="search"
          placeholder="Search the extracted text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search extracted text"
          className="w-full sm:w-80"
        />
        <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
          <mark className="px-1">highlighted</mark> sentences are identified
          claims
        </span>
      </div>
      {sections.length === 0 ? (
        <Card>
          <EmptyState
            compact
            icon="search"
            title="No paragraph matches your search"
          />
        </Card>
      ) : (
        sections.map((g, gi) => (
          <Expandable
            key={`${g.section}-${gi.toString()}`}
            defaultOpen={gi < 3 || Boolean(query)}
            summary={
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-medium text-[14px] text-ink">
                  {g.section}
                </span>
                <span className="shrink-0 text-[12px] text-muted">
                  {plural(g.items.length, "paragraph")}
                </span>
              </div>
            }
          >
            <div className="space-y-3">
              {g.items.map((p) => {
                const pc = claimsByParagraph.get(p.id) ?? [];
                return (
                  <p
                    key={p.id}
                    className="text-[14px] text-ink-soft leading-[1.75]"
                  >
                    <span className="mr-2 font-mono text-[10.5px] text-subtle">
                      {p.pageNumber ? `p${p.pageNumber}` : ""}
                    </span>
                    <Highlighted
                      text={p.cleanedText}
                      terms={[
                        ...pc.map((c) => c.originalText),
                        ...(query.trim().length >= 3 ? [query.trim()] : []),
                      ]}
                    />
                  </p>
                );
              })}
            </div>
          </Expandable>
        ))
      )}
    </div>
  );
}

function ClaimsTab({ id }: { id: string }) {
  const claims = useClaims(id);
  const citations = useCitations(id);
  const verification = useVerification(id);
  const byClaim = useMemo(
    () =>
      new Map((verification.data?.results ?? []).map((r) => [r.claimId, r])),
    [verification.data],
  );
  const citesByClaim = useMemo(() => {
    const m = new Map<
      string,
      Array<{ text: string; status: string; match: string }>
    >();
    for (const c of citations.data ?? [])
      for (const l of c.claims)
        m.set(l.claimId, [
          ...(m.get(l.claimId) ?? []),
          { text: c.citationText, status: l.status, match: c.matchStatus },
        ]);
    return m;
  }, [citations.data]);

  if (claims.error)
    return (
      <Card>
        <ErrorState error={claims.error} onRetry={claims.refetch} />
      </Card>
    );
  if (!claims.data) return <LoadingRows rows={5} />;
  if (claims.data.length === 0)
    return (
      <Card>
        <EmptyState
          icon="claims"
          title="No claims identified"
          description="Run claim identification from the Overview tab."
        />
      </Card>
    );
  return (
    <div className="space-y-2.5">
      {claims.data.map((c) => {
        const r = byClaim.get(c.id);
        const cites = citesByClaim.get(c.id) ?? [];
        return (
          <Expandable
            key={c.id}
            summary={
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <p className="text-[13.5px] text-ink leading-snug">
                  {c.originalText}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone="neutral">{categoryLabel(c.category)}</Badge>
                  {r ? (
                    <VerdictBadge verdict={r.verdict} size="sm" />
                  ) : (
                    <Badge>Not verified</Badge>
                  )}
                </div>
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <KeyValue
                items={[
                  {
                    label: "Location",
                    value:
                      [c.section, c.pageNumber ? `page ${c.pageNumber}` : null]
                        .filter(Boolean)
                        .join(" · ") || "—",
                  },
                  {
                    label: "Extraction",
                    value: `${humanize(c.extractionMethod)} · ${pct(c.confidence)}`,
                  },
                  {
                    label: "Characteristics",
                    value: c.characteristics.map(humanize).join(", ") || "—",
                  },
                  {
                    label: "Assessment",
                    value: r ? (
                      <ConfidenceMeter value={r.confidence} showLabel />
                    ) : (
                      "Not verified"
                    ),
                  },
                ]}
              />
              <div>
                <SectionLabel>Citations</SectionLabel>
                {cites.length === 0 ? (
                  <p className="text-[13px] text-muted">No citation linked.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {cites.map((x, i) => (
                      <Badge
                        // biome-ignore lint/suspicious/noArrayIndexKey: one marker such as "[3, 4]" yields an entry per reference.
                        key={`${i}:${x.text}`}
                        tone={MATCH_TONE[x.match] ?? "neutral"}
                      >
                        <span className="font-mono">{x.text}</span>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="mt-3">
                  <Link
                    to={`/documents/${id}/workspace?claim=${c.id}`}
                    className={buttonClass("secondary", "sm")}
                  >
                    <Icon name="split" size={14} /> Inspect evidence
                  </Link>
                </div>
              </div>
            </div>
          </Expandable>
        );
      })}
    </div>
  );
}

function CitationsTab({ id }: { id: string }) {
  const citations = useCitations(id);
  const references = useReferences(id);
  const [view, setView] = useState<"citations" | "references">("citations");
  return (
    <div className="space-y-4">
      <Segmented
        label="Citations view"
        value={view}
        onChange={setView}
        items={[
          {
            key: "citations",
            label: `In-text citations${citations.data ? ` (${citations.data.length})` : ""}`,
          },
          {
            key: "references",
            label: `Reference list${references.data ? ` (${references.data.total})` : ""}`,
          },
        ]}
      />
      {view === "citations" ? (
        citations.error ? (
          <Card>
            <ErrorState error={citations.error} onRetry={citations.refetch} />
          </Card>
        ) : !citations.data ? (
          <LoadingRows />
        ) : citations.data.length === 0 ? (
          <Card>
            <EmptyState
              icon="quote"
              title="No citations detected"
              description="Run citation mapping from the Overview tab."
            />
          </Card>
        ) : (
          <div className="space-y-2.5">
            {citations.data.map((c) => (
              <Expandable
                key={c.id}
                summary={
                  <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <span className="font-mono text-[13px] text-ink">
                        {c.citationText}
                      </span>
                      <span className="ml-2 text-[12px] text-muted">
                        {c.reference?.title ??
                          c.reference?.rawText.slice(0, 80) ??
                          "No reference matched"}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={MATCH_TONE[c.matchStatus] ?? "neutral"} dot>
                        {humanize(c.matchStatus)}
                      </Badge>
                      <span className="text-[12px] text-subtle">
                        {plural(c.claims.length, "claim")}
                      </span>
                    </div>
                  </div>
                }
              >
                <KeyValue
                  items={[
                    { label: "Style", value: humanize(c.citationType) },
                    {
                      label: "Match confidence",
                      value: pct(c.matchConfidence),
                    },
                    {
                      label: "Location",
                      value:
                        [
                          c.section,
                          c.pageNumber ? `page ${c.pageNumber}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—",
                    },
                    {
                      label: "Reference entry",
                      value: c.reference?.rawText ?? "—",
                    },
                  ]}
                />
              </Expandable>
            ))}
          </div>
        )
      ) : references.error ? (
        <Card>
          <ErrorState error={references.error} onRetry={references.refetch} />
        </Card>
      ) : !references.data ? (
        <LoadingRows />
      ) : references.data.references.length === 0 ? (
        <Card>
          <EmptyState icon="book" title="No reference list detected" />
        </Card>
      ) : (
        <Card>
          <ol className="divide-y divide-line">
            {references.data.references.map((r, i) => (
              <li key={r.id} className="flex gap-3 px-5 py-3">
                <span className="w-6 shrink-0 font-mono text-[12px] text-subtle">
                  {r.label ?? i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] text-ink leading-relaxed">
                    {r.rawText}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                    {r.doi ? (
                      <a
                        className="font-mono text-primary-600 hover:underline"
                        href={r.doiUrl ?? `https://doi.org/${r.doi}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        doi:{r.doi}
                      </a>
                    ) : null}
                    {r.publicationId ? (
                      <Link
                        to={`/publications/${r.publicationId}`}
                        className="inline-flex items-center gap-1 text-primary-600 hover:underline"
                      >
                        <Icon name="book" size={12} /> Matched publication
                      </Link>
                    ) : (
                      <span>No publication matched</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

function PublicationsTab({ id }: { id: string }) {
  const pubs = usePublications(id);
  if (pubs.error)
    return (
      <Card>
        <ErrorState error={pubs.error} onRetry={pubs.refetch} />
      </Card>
    );
  if (!pubs.data) return <LoadingRows />;
  if (pubs.data.references.length === 0)
    return (
      <Card>
        <EmptyState
          icon="book"
          title="No references to retrieve"
          description="Publications are looked up from the document's reference list."
        />
      </Card>
    );
  return (
    <div className="space-y-3">
      <Callout tone="neutral">{pubs.data.note}</Callout>
      {pubs.data.references.map((row) => (
        <Expandable
          key={row.reference.id}
          summary={
            <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="line-clamp-1 text-[13.5px] text-ink">
                  {row.publication?.title ??
                    row.reference.title ??
                    row.reference.rawText}
                </div>
                <div className="truncate text-[12px] text-muted">
                  {row.reference.rawText}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge
                  tone={MATCH_TONE[row.retrieval.status ?? ""] ?? "neutral"}
                  dot
                >
                  {row.retrieval.status
                    ? humanize(row.retrieval.status)
                    : "Not looked up"}
                </Badge>
                {row.retrieval.confidence !== null && row.retrieval.status ? (
                  <span className="tabular text-[12px] text-subtle">
                    {pct(row.retrieval.confidence)}
                  </span>
                ) : null}
              </div>
            </div>
          }
        >
          {row.publication ? (
            <div className="space-y-3">
              <KeyValue
                items={[
                  {
                    label: "Authors",
                    value:
                      row.publication.authors.slice(0, 6).join(", ") +
                        (row.publication.authors.length > 6 ? " et al." : "") ||
                      "—",
                  },
                  {
                    label: "Year · venue",
                    value:
                      [row.publication.year, row.publication.journal]
                        .filter(Boolean)
                        .join(" · ") || "—",
                  },
                  {
                    label: "DOI",
                    value: row.publication.doi ? (
                      <a
                        className="font-mono text-primary-600 hover:underline"
                        href={
                          row.publication.doiUrl ??
                          `https://doi.org/${row.publication.doi}`
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        {row.publication.doi}
                      </a>
                    ) : (
                      "—"
                    ),
                  },
                  {
                    label: "Access",
                    value: row.publication.openAccess
                      ? `Open access${row.publication.openAccessStatus ? ` (${row.publication.openAccessStatus})` : ""}`
                      : "Not reported as open access",
                  },
                  {
                    label: "Matched by",
                    value: `${humanize(row.retrieval.method)} · ${row.publication.providers.join(", ") || "—"}`,
                  },
                ]}
              />
              {row.publication.abstract ? (
                <p className="line-clamp-4 text-[13px] text-ink-soft leading-relaxed">
                  {row.publication.abstract}
                </p>
              ) : (
                <p className="text-[13px] text-muted">No abstract available.</p>
              )}
              <Link
                to={`/publications/${row.publication.id}`}
                className={buttonClass("secondary", "sm")}
              >
                Publication & evidence <Icon name="arrowRight" size={14} />
              </Link>
            </div>
          ) : (
            <div className="space-y-2 text-[13px] text-muted">
              <p>
                {row.retrieval.status
                  ? "No publication was selected for this reference."
                  : "This reference has not been looked up yet."}
              </p>
              {row.candidates.length ? (
                <p>
                  {plural(row.candidates.length, "candidate")} considered — none
                  confident enough to select automatically.
                </p>
              ) : null}
              {Array.isArray(row.retrieval.errors) &&
              row.retrieval.errors.length ? (
                <ul className="list-disc pl-4 text-danger-600">
                  {(
                    row.retrieval.errors as Array<{
                      provider?: string;
                      message?: string;
                    }>
                  ).map((e, i) => (
                    <li
                      key={`${e.provider}-${i.toString()}`}
                      className="break-words"
                    >
                      {e.provider}: {e.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </Expandable>
      ))}
    </div>
  );
}

function RelationshipsTab({ id }: { id: string }) {
  return <RelationshipGraph documentId={id} />;
}

function VerificationTab({ id }: { id: string }) {
  const v = useVerification(id);
  const [verdict, setVerdict] = useState<string>("");
  if (v.error)
    return (
      <Card>
        <ErrorState error={v.error} onRetry={v.refetch} />
      </Card>
    );
  if (!v.data) return <LoadingRows rows={4} />;
  if (!v.data.job)
    return (
      <Card>
        <EmptyState
          icon="verification"
          title="Not verified yet"
          description="Run verification from the Overview tab once claims are identified."
        />
      </Card>
    );
  const results = v.data.results.filter(
    (r) => !verdict || r.verdict === verdict,
  );
  return (
    <div className="space-y-4">
      <AutomatedNotice text={v.data.disclaimer} />
      <fieldset className="flex flex-wrap gap-1.5 m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">Filter by verdict</legend>
        <FilterChip
          active={!verdict}
          onClick={() => setVerdict("")}
          label={`All · ${v.data.results.length}`}
        />
        {VERDICT_ORDER.filter((k) => v.data?.summary.byVerdict[k]).map((k) => (
          <FilterChip
            key={k}
            active={verdict === k}
            onClick={() => setVerdict(k)}
            label={`${VERDICTS[k].label} · ${v.data?.summary.byVerdict[k]}`}
            color={VERDICTS[k].color}
          />
        ))}
      </fieldset>
      {results.map((r) => (
        <Expandable
          key={r.id}
          summary={
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <p className="text-[13.5px] text-ink leading-snug">
                {r.claim.originalText}
              </p>
              <div className="flex shrink-0 items-center gap-3">
                <VerdictBadge verdict={r.verdict} size="sm" />
                <ConfidenceMeter value={r.confidence} />
              </div>
            </div>
          }
        >
          <ResultDetail result={r} showClaim={false} />
        </Expandable>
      ))}
    </div>
  );
}
