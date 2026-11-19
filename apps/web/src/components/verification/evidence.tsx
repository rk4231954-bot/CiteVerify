import { Badge, cn, Icon } from "@citeverify/ui";
import { Fragment } from "react";
import { SOURCE_LABEL } from "../../lib/domain.ts";
import { highlightParts, humanize, pct } from "../../lib/format.ts";
import type { Evidence, ResultEvidence } from "../../lib/types.ts";

export function Highlighted({
  text,
  terms,
}: {
  text: string;
  terms: string[];
}) {
  return (
    <>
      {highlightParts(text, terms).map((p, i) =>
        p.match ? (
          <mark key={`${i.toString()}-m`}>{p.text}</mark>
        ) : (
          <Fragment key={`${i.toString()}-t`}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}

const ROLE_STYLE = {
  SUPPORTING: {
    tint: "bg-[linear-gradient(90deg,rgb(47_179_92/0.07),transparent_45%)]",
    bar: "bg-success-600",
    label: "Supporting",
    tone: "success" as const,
    icon: "checkCircle" as const,
  },
  CONTRADICTING: {
    tint: "bg-[linear-gradient(90deg,rgb(239_83_80/0.08),transparent_45%)]",
    bar: "bg-danger-600",
    label: "Contradicting",
    tone: "danger" as const,
    icon: "x" as const,
  },
  CONTEXT: {
    tint: "",
    bar: "bg-navy-300",
    label: "Context",
    tone: "neutral" as const,
    icon: "info" as const,
  },
};

/** One passage the verifier used — the text is exactly what the API returned. */
export function ResultPassage({
  evidence,
  terms,
  publicationTitle,
}: {
  evidence: ResultEvidence;
  terms: string[];
  publicationTitle?: string;
}) {
  const role = ROLE_STYLE[evidence.role] ?? ROLE_STYLE.CONTEXT;
  return (
    <figure
      className={cn(
        "relative overflow-hidden rounded-[9px] border border-line bg-surface pl-4 shadow-card transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-raised",
        role.tint,
      )}
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-[3px]", role.bar)}
        aria-hidden="true"
      />
      <div className="px-3 py-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={role.tone}>
            <span className="inline-flex items-center gap-1">
              <Icon name={role.icon} size={12} />
              {role.label}
            </span>
          </Badge>
          {evidence.evidenceType ? (
            <Badge tone="neutral">{humanize(evidence.evidenceType)}</Badge>
          ) : null}
          {evidence.evidenceAvailability ? (
            <Badge
              tone={
                evidence.evidenceAvailability === "FULL_TEXT"
                  ? "primary"
                  : "slate"
              }
            >
              {SOURCE_LABEL[evidence.evidenceAvailability] ??
                evidence.evidenceAvailability}
            </Badge>
          ) : null}
          {evidence.flags.map((f) => (
            <Badge key={f} tone="warning">
              {humanize(f)}
            </Badge>
          ))}
        </div>
        <blockquote className="relative pl-4 text-[13.5px] text-ink leading-relaxed">
          <span
            className="absolute -top-1 left-0 font-semibold text-[22px] text-subtle leading-none"
            aria-hidden="true"
          >
            “
          </span>
          <Highlighted text={evidence.sourceText} terms={terms} />
        </blockquote>
        <figcaption className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted">
          {publicationTitle ? (
            <span className="max-w-full truncate">{publicationTitle}</span>
          ) : null}
          {evidence.section ? <span>§ {evidence.section}</span> : null}
          {evidence.pageNumber ? <span>p. {evidence.pageNumber}</span> : null}
          <span title="Topical overlap with the claim — not a measure of support">
            relevance {pct(evidence.relevanceScore)}
          </span>
          {evidence.sourceUrl ? (
            <a
              href={evidence.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-primary-600 hover:underline"
            >
              source <Icon name="external" size={11} />
            </a>
          ) : null}
        </figcaption>
        {evidence.rationale.length ? (
          <ul className="mt-2 space-y-0.5 border-line border-t pt-2 text-[12px] text-ink-soft">
            {evidence.rationale.map((r, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: rationale lines can repeat, so position disambiguates.
                key={`${i}:${r}`}
                className="flex gap-1.5"
              >
                <Icon
                  name="chevronRight"
                  size={12}
                  className="mt-0.5 shrink-0 text-subtle"
                />
                {r}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </figure>
  );
}

/** A stored evidence passage of a publication (not yet assessed against a specific claim). */
export function StoredPassage({
  evidence,
  terms,
}: {
  evidence: Evidence;
  terms: string[];
}) {
  return (
    <figure className="rounded-md border border-line bg-surface px-3.5 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral">{humanize(evidence.evidenceType)}</Badge>
        <Badge
          tone={
            evidence.evidenceAvailability === "FULL_TEXT" ? "primary" : "slate"
          }
        >
          {SOURCE_LABEL[evidence.evidenceAvailability] ??
            evidence.evidenceAvailability}
        </Badge>
        <span className="text-[11.5px] text-subtle">
          extraction confidence {pct(evidence.confidence)}
        </span>
      </div>
      <blockquote className="text-[13.5px] text-ink leading-relaxed">
        “<Highlighted text={evidence.sourceText} terms={terms} />”
      </blockquote>
      <figcaption className="mt-2 flex flex-wrap gap-x-3 text-[11.5px] text-muted">
        {evidence.section ? <span>§ {evidence.section}</span> : null}
        {evidence.pageNumber ? <span>p. {evidence.pageNumber}</span> : null}
        <span>{humanize(evidence.extractionMethod)}</span>
      </figcaption>
    </figure>
  );
}
