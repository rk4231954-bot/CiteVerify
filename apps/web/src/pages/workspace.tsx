/**
 * Split-view evidence workspace: the claim and its citations on the left, the
 * cited publications and the verifier's evidence on the right. Every passage
 * shown is text returned by the API — nothing is generated here.
 */
import {
  Badge,
  Button,
  buttonClass,
  Callout,
  Card,
  cn,
  EmptyState,
  Icon,
  Segmented,
  Select,
  Skeleton,
} from "@citeverify/ui";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
  ConfidenceMeter,
  ErrorState,
  KeyValue,
  LoadingRows,
  SectionLabel,
  VerdictBadge,
} from "../components/common.tsx";
import {
  Highlighted,
  StoredPassage,
} from "../components/verification/evidence.tsx";
import { ResultDetail } from "../components/verification/result-detail.tsx";
import { categoryLabel, MATCH_TONE } from "../lib/domain.ts";
import { humanize, keyTerms, pct, plural } from "../lib/format.ts";
import {
  useCitations,
  useClaims,
  useDocument,
  useExtraction,
  usePublicationEvidence,
  usePublications,
  useVerification,
} from "../lib/hooks.ts";
import type { Publication } from "../lib/types.ts";

const PANEL =
  "lg:h-[calc(100dvh-13rem)] lg:min-h-[520px] lg:overflow-y-auto scrollbar-thin";

export function WorkspacePage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const doc = useDocument(id);
  const claims = useClaims(id);
  const citations = useCitations(id);
  const pubs = usePublications(id);
  const extraction = useExtraction(id);
  const verification = useVerification(id);
  const [reviewOnly, setReviewOnly] = useState(params.get("review") === "1");

  const resultByClaim = useMemo(
    () =>
      new Map((verification.data?.results ?? []).map((r) => [r.claimId, r])),
    [verification.data],
  );
  const list = useMemo(
    () =>
      (claims.data ?? []).filter(
        (c) => !reviewOnly || resultByClaim.get(c.id)?.humanReview.recommended,
      ),
    [claims.data, reviewOnly, resultByClaim],
  );
  const claimId = params.get("claim") ?? list[0]?.id ?? null;
  const index = list.findIndex((c) => c.id === claimId);
  const claim = claims.data?.find((c) => c.id === claimId) ?? null;

  const select = (cid: string | undefined) => {
    if (!cid) return;
    const next = new URLSearchParams(params);
    next.set("claim", cid);
    setParams(next, { replace: true });
  };
  // Keep the URL pointing at a claim that exists in the filtered list.
  // biome-ignore lint/correctness/useExhaustiveDependencies: select is recreated each render; only list/claim changes matter.
  useEffect(() => {
    if (
      claims.data &&
      list.length &&
      (!claimId || !list.some((c) => c.id === claimId))
    )
      select(list[0]?.id);
  }, [claims.data, list, claimId]);

  // Keyboard: [ and ] step through claims.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "]" && index < list.length - 1) select(list[index + 1]?.id);
      if (e.key === "[" && index > 0) select(list[index - 1]?.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const links = useMemo(
    () =>
      (citations.data ?? []).flatMap((c) =>
        c.claims
          .filter((l) => l.claimId === claimId)
          .map((l) => ({ citation: c, link: l })),
      ),
    [citations.data, claimId],
  );
  const pubByRef = useMemo(
    () =>
      new Map((pubs.data?.references ?? []).map((r) => [r.reference.id, r])),
    [pubs.data],
  );
  const linkedPubs = useMemo(() => {
    const m = new Map<string, Publication>();
    for (const { citation } of links) {
      const p = citation.referenceId
        ? pubByRef.get(citation.referenceId)?.publication
        : null;
      if (p) m.set(p.id, p);
    }
    return [...m.values()];
  }, [links, pubByRef]);
  const paragraph = useMemo(
    () =>
      extraction.data?.extraction?.result?.paragraphs.find(
        (p) => p.id === claim?.paragraphId,
      ) ?? null,
    [extraction.data, claim],
  );
  const result = claimId ? resultByClaim.get(claimId) : undefined;
  const terms = claim ? keyTerms(claim.originalText) : [];

  const error = claims.error ?? doc.error;
  if (error)
    return (
      <Card>
        <ErrorState
          error={error}
          onRetry={() => {
            claims.refetch();
            doc.refetch();
          }}
        />
      </Card>
    );

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="mb-1 font-medium text-[11.5px] text-primary-600 uppercase tracking-[0.1em]">
            Evidence workspace
          </p>
          <h1 className="truncate font-display text-[24px] text-navy-950 tracking-tight">
            {doc.data ? doc.data.title : <Skeleton className="h-8 w-80" />}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Claims shown"
            value={reviewOnly ? "review" : "all"}
            onChange={(v) => {
              setReviewOnly(v === "review");
              const next = new URLSearchParams(params);
              if (v === "review") next.set("review", "1");
              else next.delete("review");
              setParams(next, { replace: true });
            }}
            items={[
              { key: "all", label: "All claims" },
              { key: "review", label: "Needs review" },
            ]}
          />
          <Link
            to={`/documents/${id}`}
            className={buttonClass("secondary", "sm")}
          >
            <Icon name="arrowLeft" size={14} /> Analysis
          </Link>
        </div>
      </div>

      {!claims.data ? (
        <LoadingRows rows={6} />
      ) : claims.data.length === 0 ? (
        <Card>
          <EmptyState
            icon="claims"
            title="No claims to inspect"
            description="Identify claims from the document analysis page first."
            action={
              <Link to={`/documents/${id}`} className={buttonClass("primary")}>
                Open analysis
              </Link>
            }
          />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon="checkCircle"
            title="No claims need review"
            description="No verification result for this document recommends human review."
            action={
              <Button variant="secondary" onClick={() => setReviewOnly(false)}>
                Show all claims
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* Left: claim, citations, context */}
          <Card className={cn("flex flex-col", PANEL)}>
            <div className="sticky top-0 z-10 flex items-center gap-2 border-line border-b bg-surface/95 px-4 py-3 backdrop-blur">
              <Button
                size="icon"
                variant="ghost"
                icon="chevronLeft"
                aria-label="Previous claim ([)"
                disabled={index <= 0}
                onClick={() => select(list[index - 1]?.id)}
              />
              <Select
                aria-label="Select a claim"
                className="min-w-0 flex-1"
                value={claimId ?? ""}
                onChange={(e) => select(e.target.value)}
              >
                {list.map((c, i) => {
                  const r = resultByClaim.get(c.id);
                  return (
                    <option key={c.id} value={c.id}>
                      {i + 1}. {r ? `[${humanize(r.verdict)}] ` : ""}
                      {c.originalText.slice(0, 90)}
                    </option>
                  );
                })}
              </Select>
              <Button
                size="icon"
                variant="ghost"
                icon="chevronRight"
                aria-label="Next claim (])"
                disabled={index >= list.length - 1}
                onClick={() => select(list[index + 1]?.id)}
              />
              <span className="tabular hidden shrink-0 text-[12px] text-muted sm:inline">
                {index + 1}/{list.length}
              </span>
            </div>
            {claim ? (
              <div className="space-y-6 p-5">
                <section>
                  <SectionLabel>Claim</SectionLabel>
                  <blockquote className="border-primary-500 border-l-2 pl-4 font-display text-[18px] text-navy-950 leading-relaxed">
                    {claim.originalText}
                  </blockquote>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge>{categoryLabel(claim.category)}</Badge>
                    {claim.characteristics.map((ch) => (
                      <Badge key={ch} tone="slate">
                        {humanize(ch)}
                      </Badge>
                    ))}
                  </div>
                </section>
                <section>
                  <SectionLabel>Status</SectionLabel>
                  {result ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <VerdictBadge verdict={result.verdict} />
                      <ConfidenceMeter value={result.confidence} showLabel />
                      {result.humanReview.recommended ? (
                        <Badge tone="warning" dot>
                          Human review recommended
                        </Badge>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-[13px] text-muted">
                      {verification.data?.job
                        ? "Not part of the latest verification run."
                        : "Not verified yet."}
                    </p>
                  )}
                </section>
                <section>
                  <SectionLabel>Linked citations · {links.length}</SectionLabel>
                  {!citations.data ? (
                    <LoadingRows rows={2} />
                  ) : links.length === 0 ? (
                    <p className="text-[13px] text-muted">
                      No citation is linked to this claim, so there is no cited
                      source to check it against.
                    </p>
                  ) : (
                    <ul className="space-y-2.5">
                      {links.map(({ citation, link }) => (
                        <li
                          key={citation.id}
                          className="rounded-md border border-line px-3.5 py-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[13px] text-ink">
                              {citation.citationText}
                            </span>
                            <Badge
                              tone={
                                MATCH_TONE[citation.matchStatus] ?? "neutral"
                              }
                              dot
                            >
                              {humanize(citation.matchStatus)}
                            </Badge>
                            <span className="text-[11.5px] text-subtle">
                              {humanize(link.status)} link ·{" "}
                              {pct(link.confidence)}
                            </span>
                          </div>
                          <p className="mt-1.5 text-[12.5px] text-muted leading-relaxed">
                            {citation.reference?.rawText ??
                              "No reference-list entry matched."}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section>
                  <SectionLabel>Context in the document</SectionLabel>
                  {!extraction.data ? (
                    <LoadingRows rows={2} />
                  ) : paragraph ? (
                    <div className="rounded-md bg-paper px-4 py-3">
                      <p className="mb-1.5 text-[11.5px] text-subtle">
                        {[
                          paragraph.section,
                          paragraph.pageNumber
                            ? `page ${paragraph.pageNumber}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Paragraph"}
                      </p>
                      <p className="text-[13.5px] text-ink-soft leading-[1.75]">
                        <Highlighted
                          text={paragraph.cleanedText}
                          terms={[claim.originalText]}
                        />
                      </p>
                    </div>
                  ) : (
                    <p className="text-[13px] text-muted">
                      The source paragraph is not available.
                    </p>
                  )}
                </section>
                <KeyValue
                  items={[
                    {
                      label: "Location",
                      value:
                        [
                          claim.section,
                          claim.pageNumber ? `page ${claim.pageNumber}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—",
                    },
                    {
                      label: "Identified by",
                      value: `${humanize(claim.extractionMethod)} · ${pct(claim.confidence)} extraction confidence`,
                    },
                  ]}
                />
              </div>
            ) : null}
          </Card>

          {/* Right: publications and evidence */}
          <Card className={PANEL}>
            <div className="space-y-6 p-5">
              {linkedPubs.length ? (
                <section>
                  <SectionLabel>
                    Cited publications · {linkedPubs.length}
                  </SectionLabel>
                  <div className="space-y-2.5">
                    {linkedPubs.map((p) => (
                      <PublicationCard key={p.id} publication={p} />
                    ))}
                  </div>
                </section>
              ) : null}
              {verification.error ? (
                <ErrorState
                  compact
                  error={verification.error}
                  onRetry={verification.refetch}
                />
              ) : !verification.data ? (
                <LoadingRows rows={4} />
              ) : result ? (
                <ResultDetail result={result} showClaim={false} />
              ) : (
                <>
                  <Callout
                    tone="neutral"
                    title="No assessment for this claim yet"
                  >
                    The passages below are stored evidence from the cited
                    publications. They have not been assessed against this claim
                    — run verification from the analysis page.
                  </Callout>
                  {linkedPubs.length === 0 ? (
                    <EmptyState
                      compact
                      icon="book"
                      title="No retrieved publication"
                      description="None of this claim's citations resolved to a retrieved publication."
                    />
                  ) : (
                    linkedPubs.map((p) => (
                      <StoredEvidence
                        key={p.id}
                        publication={p}
                        terms={terms}
                      />
                    ))
                  )}
                </>
              )}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

function PublicationCard({ publication: p }: { publication: Publication }) {
  return (
    <article className="rounded-md border border-line px-4 py-3">
      <Link
        to={`/publications/${p.id}`}
        className="font-medium text-[14px] text-navy-950 leading-snug hover:text-primary-600"
      >
        {p.title}
      </Link>
      <p className="mt-1 text-[12.5px] text-muted">
        {[
          p.authors.slice(0, 3).join(", ") +
            (p.authors.length > 3 ? " et al." : ""),
          p.year,
          p.journal,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
        {p.doi ? (
          <a
            className="font-mono text-primary-600 hover:underline"
            href={p.doiUrl ?? `https://doi.org/${p.doi}`}
            target="_blank"
            rel="noreferrer"
          >
            doi:{p.doi}
          </a>
        ) : null}
        <Badge tone={p.openAccess ? "teal" : "slate"}>
          {p.openAccess ? "Open access" : "Access not reported"}
        </Badge>
        {p.abstract ? null : <Badge tone="warning">No abstract</Badge>}
      </div>
    </article>
  );
}

function StoredEvidence({
  publication,
  terms,
}: {
  publication: Publication;
  terms: string[];
}) {
  const ev = usePublicationEvidence(publication.id);
  return (
    <section>
      <SectionLabel>
        Stored evidence · {publication.title.slice(0, 60)}
      </SectionLabel>
      {ev.error ? (
        <ErrorState compact error={ev.error} onRetry={ev.refetch} />
      ) : !ev.data ? (
        <LoadingRows rows={2} />
      ) : ev.data.evidence.length === 0 ? (
        <p className="text-[13px] text-muted">
          {ev.data.publication.evidenceExtractedAt
            ? "No passages were extracted from the available text."
            : "Evidence has not been extracted for this publication yet."}
        </p>
      ) : (
        <div className="space-y-2.5">
          <p className="text-[12px] text-muted">
            {plural(ev.data.total, "passage")} ·{" "}
            {humanize(ev.data.verificationScope)}
          </p>
          {ev.data.evidence.slice(0, 8).map((e) => (
            <StoredPassage key={e.id} evidence={e} terms={terms} />
          ))}
        </div>
      )}
    </section>
  );
}
