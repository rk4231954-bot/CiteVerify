import {
  Badge,
  Button,
  buttonClass,
  Card,
  ConfirmDialog,
  EmptyState,
  Icon,
  Input,
  Select,
  useToast,
} from "@citeverify/ui";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  ErrorState,
  PageHeader,
  ProcessingBadge,
} from "../components/common.tsx";
import { DataGrid, GridToolbar } from "../components/data-grid/data-grid.tsx";
import { api, errorMessage } from "../lib/api.ts";
import {
  formatBytes,
  formatDate,
  formatRelative,
  plural,
} from "../lib/format.ts";
import { invalidateDocument, useWorkspace } from "../lib/hooks.ts";
import { furthestStage } from "../lib/pipeline.ts";
import type { WorkspaceDoc } from "../lib/workspace.ts";

type Filter = "all" | "verified" | "unverified" | "failed";

export function DocumentsPage() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [toDelete, setToDelete] = useState<WorkspaceDoc | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (ws.data?.docs ?? []).filter((d) => {
      const verified = Boolean(d.verification?.job);
      if (filter === "verified" && !verified) return false;
      if (filter === "unverified" && verified) return false;
      if (filter === "failed" && d.document.status !== "FAILED") return false;
      return (
        !q ||
        d.document.title.toLowerCase().includes(q) ||
        d.document.originalFilename.toLowerCase().includes(q)
      );
    });
  }, [ws.data, query, filter]);

  async function remove(d: WorkspaceDoc) {
    try {
      await api.documents.remove(d.document.id);
      toast({
        tone: "success",
        title: "Document deleted",
        description: d.document.title,
      });
      invalidateDocument(d.document.id);
    } catch (err) {
      toast({
        tone: "error",
        title: "Could not delete the document",
        description: errorMessage(err),
      });
      throw err;
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Library"
        icon="documents"
        title="My Documents"
        description="Every manuscript you have uploaded, with its extraction, claims, citations and latest verification."
        actions={
          <Link to="/upload" className={buttonClass("primary")}>
            <Icon name="upload" size={16} /> Upload document
          </Link>
        }
      />
      <Card className="overflow-hidden">
        <GridToolbar>
          <Input
            icon="search"
            placeholder="Search by title or file name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search documents"
            className="sm:w-80"
          />
          <Select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            aria-label="Filter documents"
            className="sm:w-48"
          >
            <option value="all">All documents</option>
            <option value="verified">Verified</option>
            <option value="unverified">Not yet verified</option>
            <option value="failed">Extraction failed</option>
          </Select>
          {ws.data?.failed.length ? (
            <span className="text-[12.5px] text-warning-700">
              {plural(ws.data.failed.length, "document")} could not be loaded.
            </span>
          ) : null}
        </GridToolbar>
        {ws.error && !ws.data ? (
          <ErrorState error={ws.error} onRetry={ws.refetch} />
        ) : (
          <DataGrid
            loading={!ws.data}
            rows={rows}
            noun="documents"
            resetKey={`${query}|${filter}`}
            rowKey={(d) => d.document.id}
            onRowClick={(d) => navigate(`/documents/${d.document.id}`)}
            initialSort={{ key: "uploaded", dir: "desc" }}
            empty={
              ws.data?.docs.length === 0 ? (
                <EmptyState
                  icon="documents"
                  title="No documents yet"
                  description="Upload a PDF or DOCX manuscript to start verifying its citations."
                  action={
                    <Button icon="upload" onClick={() => navigate("/upload")}>
                      Upload document
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  compact
                  icon="search"
                  title="No documents match"
                  description="Try a different search or filter."
                />
              )
            }
            columns={[
              {
                key: "title",
                header: "Document",
                sortValue: (d) => d.document.title.toLowerCase(),
                cell: (d) => (
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-paper font-semibold text-[9.5px] text-navy-600 uppercase">
                      {d.document.fileType.includes("pdf") ? "PDF" : "DOCX"}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink group-hover:text-primary-600">
                        {d.document.title}
                      </div>
                      <div className="truncate text-[12px] text-muted">
                        {d.document.originalFilename} ·{" "}
                        {formatBytes(d.document.fileSize)}
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: "status",
                header: "Progress",
                sortValue: (d) =>
                  furthestStage(d.document, Boolean(d.verification?.job)).step,
                cell: (d) => (
                  <ProcessingBadge
                    document={d.document}
                    verified={Boolean(d.verification?.job)}
                  />
                ),
              },
              {
                key: "claims",
                header: "Claims",
                align: "right",
                sortValue: (d) => d.document.counts.claims,
                cell: (d) => (
                  <span className="tabular">{d.document.counts.claims}</span>
                ),
              },
              {
                key: "citations",
                header: "Citations",
                align: "right",
                hideBelow: "lg",
                sortValue: (d) => d.document.counts.citations,
                cell: (d) => (
                  <span className="tabular">{d.document.counts.citations}</span>
                ),
              },
              {
                key: "verification",
                header: "Verification",
                sortValue: (d) =>
                  d.verification?.job
                    ? d.verification.summary.humanReviewRecommended
                    : -1,
                cell: (d) =>
                  d.verification?.job ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="success" dot>
                        Verified
                      </Badge>
                      {d.verification.summary.humanReviewRecommended > 0 ? (
                        <Badge tone="warning">
                          {d.verification.summary.humanReviewRecommended} to
                          review
                        </Badge>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-[12.5px] text-subtle">
                      Not verified
                    </span>
                  ),
              },
              {
                key: "uploaded",
                header: "Uploaded",
                hideBelow: "lg",
                sortValue: (d) => d.document.createdAt,
                cell: (d) => (
                  <span
                    className="text-[12.5px] text-muted"
                    title={formatDate(d.document.createdAt)}
                  >
                    {formatRelative(d.document.createdAt)}
                  </span>
                ),
              },
              {
                key: "actions",
                header: <span className="sr-only">Actions</span>,
                align: "right",
                cell: (d) => (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${d.document.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setToDelete(d);
                    }}
                    className="text-subtle hover:text-danger-600"
                  >
                    <Icon name="trash" size={16} />
                  </Button>
                ),
              },
            ]}
            mobileCard={(d) => (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-[14px] text-ink">
                      {d.document.title}
                    </div>
                    <div className="truncate text-[12px] text-muted">
                      {d.document.originalFilename}
                    </div>
                  </div>
                  <ProcessingBadge
                    document={d.document}
                    verified={Boolean(d.verification?.job)}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
                  <span>{plural(d.document.counts.claims, "claim")}</span>
                  <span>{plural(d.document.counts.citations, "citation")}</span>
                  <span>
                    {d.verification?.job
                      ? `${d.verification.summary.humanReviewRecommended} to review`
                      : "Not verified"}
                  </span>
                  <span>{formatRelative(d.document.createdAt)}</span>
                </div>
              </div>
            )}
          />
        )}
      </Card>

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => (toDelete ? remove(toDelete) : undefined)}
        title="Delete this document?"
        description="This permanently deletes the file and its extraction, claims, citations, references and verification results."
        confirmLabel="Delete document"
      >
        {toDelete ? (
          <div className="rounded-md border border-line bg-paper px-3 py-2.5 text-[13px]">
            <div className="font-medium text-ink">
              {toDelete.document.title}
            </div>
            <div className="text-muted">
              {plural(toDelete.document.counts.claims, "claim")} ·{" "}
              {plural(toDelete.document.counts.citations, "citation")}
            </div>
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
