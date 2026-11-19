import {
  Badge,
  Button,
  buttonClass,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Icon,
  Skeleton,
  useToast,
} from "@citeverify/ui";
import { useState } from "react";
import { Link, useParams } from "react-router";
import {
  ErrorState,
  KeyValue,
  LoadingRows,
  PageHeader,
} from "../components/common.tsx";
import { StoredPassage } from "../components/verification/evidence.tsx";
import { ApiError, api, errorMessage } from "../lib/api.ts";
import { MATCH_TONE, SCOPE_LABEL } from "../lib/domain.ts";
import { formatDateTime, humanize, pct, plural } from "../lib/format.ts";
import {
  useConfig,
  usePublication,
  usePublicationEvidence,
} from "../lib/hooks.ts";
import { invalidate } from "../lib/query.ts";
import { NotFoundPage } from "./not-found.tsx";

export function PublicationPage() {
  const { id } = useParams();
  const pub = usePublication(id);
  const evidence = usePublicationEvidence(id);
  const config = useConfig();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  if (pub.error && !pub.data) {
    if (pub.error instanceof ApiError && pub.error.status === 404)
      return (
        <NotFoundPage
          title="Publication not found"
          description="It is only available to accounts whose documents cite it."
        />
      );
    return (
      <Card>
        <ErrorState error={pub.error} onRetry={pub.refetch} />
      </Card>
    );
  }
  const p = pub.data?.publication;
  const ev = evidence.data;

  const extract = async (replace: boolean) => {
    if (!id) return;
    setBusy(true);
    try {
      const res = await api.publications.extractEvidence(id, {
        replace,
        fullText: config.data?.features.openAccessFullText ?? false,
      });
      invalidate(`pubevidence:${id}`, `pub:${id}`, "allpubs");
      toast({
        tone: "success",
        title: res.created
          ? `${plural(res.created, "passage")} extracted`
          : "No new passages",
        description: `${SCOPE_LABEL[res.verificationScope] ?? humanize(res.verificationScope)}${res.fullText.reason ? ` · ${res.fullText.reason}` : ""}`,
      });
    } catch (err) {
      toast({
        tone: "error",
        title: "Evidence extraction failed",
        description: errorMessage(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Publication"
        title={p ? p.title : <Skeleton className="h-9 w-[32rem] max-w-full" />}
        description={
          p
            ? [
                p.authors.slice(0, 8).join(", ") +
                  (p.authors.length > 8 ? " et al." : ""),
                p.year,
                p.journal,
              ]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
        actions={
          p ? (
            <>
              {p.doi ? (
                <a
                  href={p.doiUrl ?? `https://doi.org/${p.doi}`}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClass("secondary")}
                >
                  <Icon name="external" size={15} /> DOI
                </a>
              ) : null}
              {p.openAccessUrl ? (
                <a
                  href={p.openAccessUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClass("secondary")}
                >
                  <Icon name="external" size={15} /> Open-access copy
                </a>
              ) : null}
            </>
          ) : null
        }
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Abstract" />
            <CardBody>
              {!p ? (
                <LoadingRows rows={3} />
              ) : p.abstract ? (
                <p className="text-[14.5px] text-ink leading-[1.75]">
                  {p.abstract}
                </p>
              ) : (
                <p className="text-[13px] text-muted">
                  No abstract was returned by the metadata providers.
                </p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Evidence passages"
              description={
                ev
                  ? `${plural(ev.total, "passage")} · ${SCOPE_LABEL[ev.verificationScope] ?? humanize(ev.verificationScope)}`
                  : undefined
              }
              actions={
                ev ? (
                  <Button
                    size="sm"
                    variant={ev.total ? "secondary" : "primary"}
                    icon={ev.total ? "refresh" : "play"}
                    loading={busy}
                    onClick={() =>
                      ev.total > 0 ? setConfirmReplace(true) : extract(false)
                    }
                  >
                    {ev.total ? "Re-extract" : "Extract evidence"}
                  </Button>
                ) : null
              }
            />
            <CardBody>
              {evidence.error ? (
                <ErrorState
                  compact
                  error={evidence.error}
                  onRetry={evidence.refetch}
                />
              ) : !ev ? (
                <LoadingRows rows={3} />
              ) : ev.evidence.length === 0 ? (
                <EmptyState
                  compact
                  icon="quote"
                  title={
                    ev.publication.evidenceExtractedAt
                      ? "No passages found"
                      : "Evidence not extracted yet"
                  }
                  description={
                    ev.publication.evidenceExtractedAt
                      ? "Nothing usable was found in the available text."
                      : "Passages are taken verbatim from the abstract (and open-access full text when supported)."
                  }
                />
              ) : (
                <div className="space-y-2.5">
                  <Callout tone="neutral">
                    These passages are stored verbatim from the source. They are
                    assessed against specific claims only during verification.
                  </Callout>
                  {ev.evidence.map((e) => (
                    <StoredPassage key={e.id} evidence={e} terms={[]} />
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Metadata" />
            <CardBody>
              {!p ? (
                <LoadingRows rows={4} />
              ) : (
                <KeyValue
                  items={[
                    { label: "DOI", value: p.doi ?? "—" },
                    { label: "Publisher", value: p.publisher ?? "—" },
                    {
                      label: "Access",
                      value: p.openAccess
                        ? `Open access${p.openAccessStatus ? ` (${p.openAccessStatus})` : ""}`
                        : "Not reported as open access",
                    },
                    {
                      label: "Full text",
                      value: ev?.publication.fullTextStatus
                        ? humanize(ev.publication.fullTextStatus)
                        : "Not attempted",
                    },
                    {
                      label: "Metadata sources",
                      value: p.providers.join(", ") || "—",
                    },
                    {
                      label: "Retrieved",
                      value: p.retrievedAt
                        ? formatDateTime(p.retrievedAt)
                        : "—",
                    },
                    {
                      label: "Evidence extracted",
                      value: ev?.publication.evidenceExtractedAt
                        ? formatDateTime(ev.publication.evidenceExtractedAt)
                        : "—",
                    },
                  ]}
                />
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Cited in your documents" />
            <CardBody>
              {!pub.data ? (
                <LoadingRows rows={2} />
              ) : pub.data.references.length === 0 ? (
                <p className="text-[13px] text-muted">
                  No reference in your documents points to this publication.
                </p>
              ) : (
                <ul className="space-y-3">
                  {pub.data.references.map((r) => (
                    <li key={r.id} className="text-[13px]">
                      <p className="text-ink-soft leading-relaxed">
                        {r.rawText}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        {r.publicationMatchStatus ? (
                          <Badge
                            tone={
                              MATCH_TONE[r.publicationMatchStatus] ?? "neutral"
                            }
                            dot
                          >
                            {humanize(r.publicationMatchStatus)}
                            {r.publicationMatchConfidence !== null
                              ? ` · ${pct(r.publicationMatchConfidence)}`
                              : ""}
                          </Badge>
                        ) : null}
                        <Link
                          to={`/documents/${r.documentId}?tab=publications`}
                          className="text-primary-600 hover:underline"
                        >
                          Open document
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {pub.data?.note ? (
                <p className="mt-4 text-[12px] text-muted">{pub.data.note}</p>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>
      <ConfirmDialog
        open={confirmReplace}
        onClose={() => setConfirmReplace(false)}
        tone="primary"
        title="Re-extract evidence?"
        description="The stored passages for this publication are replaced. Existing verification results keep their quoted text, but re-run verification to assess claims against the new passages."
        confirmLabel="Re-extract"
        onConfirm={() => extract(true)}
      />
    </>
  );
}
