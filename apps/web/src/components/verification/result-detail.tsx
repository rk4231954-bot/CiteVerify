import { Badge, Callout, Icon } from "@citeverify/ui";
import { Link } from "react-router";
import { SCOPE_LABEL, SOURCE_LABEL, verdictMeta } from "../../lib/domain.ts";
import { humanize, keyTerms } from "../../lib/format.ts";
import type { VerificationResult } from "../../lib/types.ts";
import { ConfidenceMeter, SectionLabel, VerdictBadge } from "../common.tsx";
import { ResultPassage } from "./evidence.tsx";

/** Verdict header: verdict, confidence (of the assessment), scope and the "automated" marker. */
export function VerdictSummary({ result }: { result: VerificationResult }) {
  const meta = verdictMeta(result.verdict);
  return (
    <div
      className="gloss relative overflow-hidden rounded-[10px] border border-line bg-surface p-4 pl-5 shadow-card"
      style={{
        backgroundImage: `linear-gradient(90deg, ${meta.color}14, transparent 55%)`,
      }}
    >
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: meta.color }}
        aria-hidden="true"
      />
      <div className="flex flex-wrap items-center gap-2">
        <VerdictBadge verdict={result.verdict} />
        <Badge tone="dark">Automated assessment</Badge>
        <Badge tone={result.verificationScope === "FULL" ? "primary" : "slate"}>
          {SCOPE_LABEL[result.verificationScope] ?? result.verificationScope}
        </Badge>
      </div>
      <p className="mt-2 text-[12.5px] text-muted">{meta.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div>
          <div className="text-[11px] text-subtle uppercase tracking-[0.06em]">
            Assessment confidence
          </div>
          <div className="mt-1">
            <ConfidenceMeter value={result.confidence} showLabel />
          </div>
        </div>
        <div>
          <div className="text-[11px] text-subtle uppercase tracking-[0.06em]">
            Evidence source
          </div>
          <div className="mt-1 text-[13px] text-ink">
            {SOURCE_LABEL[result.evidenceSource] ?? result.evidenceSource}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-subtle uppercase tracking-[0.06em]">
            Method
          </div>
          <div className="mt-1 text-[13px] text-ink">
            {humanize(result.method)}
            {result.strategy ? (
              <span className="text-muted"> · {result.strategy}</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReviewRecommendation({
  result,
}: {
  result: VerificationResult;
}) {
  if (!result.humanReview.recommended)
    return (
      <Callout tone="neutral" title="No human review flagged">
        The verifier did not flag this claim, but automated assessments can
        still be wrong — check important claims.
      </Callout>
    );
  return (
    <Callout tone="warning" title="Human review recommended">
      <ul className="list-disc space-y-0.5 pl-4">
        {result.humanReview.reasons.map((r, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: reasons can repeat, so position disambiguates.
          <li key={`${i}:${r}`}>{r}</li>
        ))}
      </ul>
    </Callout>
  );
}

/** Full verification result: explanation, evidence by role, publications, limitations, review. */
export function ResultDetail({
  result,
  showClaim = true,
}: {
  result: VerificationResult;
  showClaim?: boolean;
}) {
  const terms = keyTerms(result.claim.originalText);
  const pubTitle = (id: string) =>
    result.publications.find((p) => p.id === id)?.title;
  const groups = [
    {
      key: "supporting",
      label: "Supporting evidence",
      items: result.supportingEvidence,
    },
    {
      key: "contradicting",
      label: "Contradicting evidence",
      items: result.contradictingEvidence,
    },
    {
      key: "context",
      label: "Context (no stance)",
      items: result.contextEvidence,
    },
  ];
  return (
    <div className="space-y-6">
      {showClaim ? (
        <blockquote className="border-primary-500 border-l-2 pl-4 font-display text-[17px] text-navy-950 leading-relaxed">
          {result.claim.originalText}
        </blockquote>
      ) : null}
      <VerdictSummary result={result} />
      <div>
        <SectionLabel>Explanation</SectionLabel>
        <p className="text-[14px] text-ink leading-relaxed">
          {result.explanation}
        </p>
        {result.evidenceSummary ? (
          <p className="mt-1 text-[12.5px] text-muted">
            {result.evidenceSummary}
          </p>
        ) : null}
      </div>
      <ReviewRecommendation result={result} />

      {groups.map((g) =>
        g.items.length ? (
          <section key={g.key}>
            <SectionLabel>
              {g.label} · {g.items.length}
            </SectionLabel>
            <div className="space-y-2.5">
              {g.items.map((e, i) => (
                <ResultPassage
                  key={`${e.evidenceId ?? "x"}-${i.toString()}`}
                  evidence={e}
                  terms={terms}
                  publicationTitle={pubTitle(e.publicationId)}
                />
              ))}
            </div>
          </section>
        ) : null,
      )}
      {result.supportingEvidence.length +
        result.contradictingEvidence.length +
        result.contextEvidence.length ===
      0 ? (
        <Callout tone="neutral" title="No evidence passages">
          The verifier found no passage in the available text of the cited
          publications to assess this claim against.
        </Callout>
      ) : null}

      <section>
        <SectionLabel>
          Cited publications assessed · {result.publications.length}
        </SectionLabel>
        {result.publications.length === 0 ? (
          <p className="text-[13px] text-muted">
            No cited publication could be assessed.
          </p>
        ) : (
          <ul className="space-y-2">
            {result.publications.map((p) => (
              <li
                key={p.id}
                className="rounded-md border border-line px-3.5 py-2.5"
              >
                <Link
                  to={`/publications/${p.id}`}
                  className="font-medium text-[13.5px] text-ink hover:text-primary-600"
                >
                  {p.title}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                  <span>
                    {p.year ?? "n.d."}
                    {p.journal ? ` · ${p.journal}` : ""}
                  </span>
                  <Badge
                    tone={
                      p.evidenceSource === "FULL_TEXT" ? "primary" : "slate"
                    }
                  >
                    {SOURCE_LABEL[p.evidenceSource] ?? p.evidenceSource}
                  </Badge>
                  <Badge
                    tone={
                      p.contribution === "SUPPORTING"
                        ? "success"
                        : p.contribution === "CONTRADICTING"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {humanize(p.contribution)}
                  </Badge>
                  {!p.onTopic ? (
                    <Badge tone="orange">Off-topic for this claim</Badge>
                  ) : null}
                  {p.citationTexts.map((c) => (
                    <span key={c} className="font-mono text-[11.5px]">
                      {c}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {result.unresolvedCitations.length ? (
        <section>
          <SectionLabel>Unresolved citations</SectionLabel>
          <ul className="space-y-1.5 text-[13px]">
            {result.unresolvedCitations.map((u) => (
              <li key={u.citationId} className="flex gap-2">
                <span className="font-mono text-ink">{u.citationText}</span>
                <span className="text-muted">— {u.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <SectionLabel>Limitations</SectionLabel>
        <ul className="space-y-1.5">
          {result.limitations.map((l, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: limitations can repeat, so position disambiguates.
              key={`${i}:${l}`}
              className="flex gap-2 text-[13px] text-ink-soft leading-relaxed"
            >
              <Icon
                name="alert"
                size={14}
                className="mt-0.5 shrink-0 text-subtle"
              />
              {l}
            </li>
          ))}
        </ul>
      </section>

      <p className="border-line border-t pt-3 text-[11.5px] text-subtle leading-relaxed">
        {result.disclaimer}
      </p>
    </div>
  );
}
