/**
 * Verifies one claim against the evidence of the publications it cites.
 *
 * Pipeline: resolve citations → publications, rank their evidence by
 * relevance (topical overlap only), let the strategy assess each candidate's
 * stance, then aggregate with the conservative rules in rules/verdict-rules.
 * Nothing here fetches data or invents evidence: only the given passages,
 * quoted verbatim, can appear in a result.
 */
import { rankEvidenceForClaim } from "@citeverify/evidence-extractor";
import {
  ClaimCitationStatus,
  EvidenceAvailability,
  Verdict,
  VerificationScope,
} from "@citeverify/shared";
import { analyzeClaim } from "./analysis/stance.ts";
import {
  CLAIM_OVERREACH,
  capFor,
  FLAG_TEXT,
  OUTDATED_GAP_YEARS,
  REVIEW_BELOW,
  REVIEW_CONFIDENCE,
  SERIOUS_VERDICTS,
} from "./rules/verdict-rules.ts";
import { ruleBasedStrategy } from "./strategies/rule-based.strategy.ts";
import type {
  AssessedEvidence,
  AssessmentFlag,
  ClaimVerification,
  ClaimVerificationInput,
  EvidenceInput,
  EvidenceRole,
  EvidenceSourceType,
  PassageAssessment,
  PassageContext,
  PublicationAssessment,
  PublicationInfo,
  ReasonCode,
  UnresolvedCitation,
  VerificationStrategy,
} from "./types/verification.types.ts";
import { clamp, coverage, round, tokenSet, truncate } from "./utils/text.ts";

export const DISCLAIMER =
  "Automated assessment of the available text. It is not a confirmed scientific fact: check the quoted evidence and the sources before relying on it.";

/** Candidate passages below this relevance are not considered at all. */
export const MIN_CANDIDATE_RELEVANCE = 0.15;
/** A publication is on-topic when a passage reaches this relevance (or its title matches). */
export const ON_TOPIC_RELEVANCE = 0.25;
export const ON_TOPIC_TITLE_COVERAGE = 0.3;
const MAX_CANDIDATES = 30;
const MAX_CONTEXT = 5;
const MAX_LIMITATIONS = 3;

export type VerifyOptions = { strategy?: VerificationStrategy };

type Source = {
  publication: PublicationInfo;
  citationIds: string[];
  citationTexts: string[];
  /** 0..1: how sure we are this publication is what the claim cites. */
  linkFactor: number;
  linkNeedsReview: boolean;
};

function resolveSources(input: ClaimVerificationInput) {
  const sources = new Map<string, Source>();
  const unresolved: UnresolvedCitation[] = [];
  for (const c of input.citations) {
    if (!c.referenceId) {
      unresolved.push({
        citationId: c.citationId,
        citationText: c.citationText,
        reason: `The citation is not confidently matched to a bibliography entry (${c.citationMatchStatus ?? "not matched"})`,
      });
      continue;
    }
    if (!c.publication) {
      unresolved.push({
        citationId: c.citationId,
        citationText: c.citationText,
        reason: `The cited reference is not matched to a retrieved publication (${c.publicationMatchStatus ?? "not retrieved"})`,
      });
      continue;
    }
    const needsReview = c.linkStatus === ClaimCitationStatus.NEEDS_REVIEW;
    const factor =
      (c.linkConfidence ?? 0.75) *
      (c.publicationMatchConfidence ?? 0.75) *
      (needsReview ? 0.7 : 1);
    const existing = sources.get(c.publication.id);
    if (existing) {
      existing.citationIds.push(c.citationId);
      if (!existing.citationTexts.includes(c.citationText))
        existing.citationTexts.push(c.citationText);
      existing.linkFactor = Math.max(existing.linkFactor, factor);
      existing.linkNeedsReview &&= needsReview;
    } else
      sources.set(c.publication.id, {
        publication: c.publication,
        citationIds: [c.citationId],
        citationTexts: [c.citationText],
        linkFactor: factor,
        linkNeedsReview: needsReview,
      });
  }
  return { sources, unresolved };
}

function sourceTypeOf(
  rows: readonly { evidenceAvailability: string }[],
): EvidenceSourceType {
  const full = rows.some(
    (r) => r.evidenceAvailability === EvidenceAvailability.FULL_TEXT,
  );
  const abs = rows.some(
    (r) => r.evidenceAvailability === EvidenceAvailability.ABSTRACT,
  );
  return full && abs ? "MIXED" : full ? "FULL_TEXT" : abs ? "ABSTRACT" : "NONE";
}

const hasFullText = (t: EvidenceSourceType) =>
  t === "FULL_TEXT" || t === "MIXED";

const label = (p: PublicationInfo) =>
  `"${truncate(p.title, 70)}"${p.year ? ` (${p.year})` : ""}`;

function roleOf(a: PassageAssessment, e: EvidenceInput): EvidenceRole {
  if (a.stance === "AGREES" || a.stance === "PARTIAL") return "SUPPORTING";
  if (a.stance === "DISAGREES") return "CONTRADICTING";
  return e.evidenceType === "LIMITATION" ? "LIMITATION" : "CONTEXT";
}

export async function verifyClaim(
  input: ClaimVerificationInput,
  options: VerifyOptions = {},
): Promise<ClaimVerification> {
  const strategy = options.strategy ?? ruleBasedStrategy;
  const profile = analyzeClaim(input.claim);
  const rules: string[] = [];
  const { sources, unresolved } = resolveSources(input);
  const evidence = input.evidence.filter((e) => sources.has(e.publicationId));
  const byPub = new Map<string, EvidenceInput[]>();
  for (const e of evidence)
    byPub.set(e.publicationId, [...(byPub.get(e.publicationId) ?? []), e]);
  const scopeType = sourceTypeOf(evidence);
  const verificationScope = hasFullText(scopeType)
    ? VerificationScope.FULL
    : scopeType === "ABSTRACT"
      ? VerificationScope.LIMITED
      : VerificationScope.NONE;

  // ── Relevance (topical overlap — a filter, never proof) ──────────────
  const ranked = evidence.length
    ? rankEvidenceForClaim(
        { id: input.claim.id, text: profile.text },
        evidence.map((e) => ({
          id: e.id,
          text: e.normalizedText ?? e.sourceText,
          evidenceType: e.evidenceType,
        })),
        { minRelevance: MIN_CANDIDATE_RELEVANCE, topK: MAX_CANDIDATES },
      )
    : [];
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  const contexts: PassageContext[] = ranked.flatMap((r) => {
    const passage = evidenceById.get(r.evidenceId);
    const source = passage && sources.get(passage.publicationId);
    if (!passage || !source) return [];
    const studyProfile = (byPub.get(passage.publicationId) ?? [])
      .filter((e) => e.evidenceType === "METHODOLOGY")
      .map((e) => e.sourceText)
      .join(" ")
      .slice(0, 3000);
    return [
      {
        passage,
        publication: source.publication,
        relevanceScore: r.relevanceScore,
        matchedTerms: r.matchedTerms,
        studyProfile,
      },
    ];
  });

  const analysable = profile.assertion.polarity !== null;
  const assessments =
    contexts.length && analysable
      ? await strategy.assess(input.claim, contexts)
      : [];
  const assessmentById = new Map(assessments.map((a) => [a.evidenceId, a]));
  const assessed: AssessedEvidence[] = contexts.map((ctx) => {
    const a = assessmentById.get(ctx.passage.id) ?? {
      evidenceId: ctx.passage.id,
      stance: "NEUTRAL" as const,
      flags: [] as AssessmentFlag[],
      rationale: analysable
        ? ["Not assessed"]
        : [
            "Relevant passage; the claim states no direction that could be compared",
          ],
      strength: 0,
    };
    return {
      evidenceId: ctx.passage.id,
      publicationId: ctx.passage.publicationId,
      role: roleOf(a, ctx.passage),
      stance: a.stance,
      sourceText: ctx.passage.sourceText,
      evidenceType: ctx.passage.evidenceType,
      evidenceAvailability: ctx.passage.evidenceAvailability,
      section: ctx.passage.section,
      pageNumber: ctx.passage.pageNumber,
      sourceUrl: ctx.passage.sourceUrl,
      relevanceScore: ctx.relevanceScore,
      flags: a.flags,
      rationale: a.rationale,
    };
  });
  const strengthOf = (id: string) => assessmentById.get(id)?.strength ?? 0;
  const supporting = assessed.filter((a) => a.role === "SUPPORTING");
  const contradicting = assessed.filter((a) => a.role === "CONTRADICTING");
  const limitationEvidence = assessed
    .filter((a) => a.role === "LIMITATION")
    .slice(0, MAX_LIMITATIONS);
  const contextEvidence = [
    ...assessed.filter((a) => a.role === "CONTEXT").slice(0, MAX_CONTEXT),
    ...limitationEvidence,
  ];

  // ── Per publication ──────────────────────────────────────────────────
  const claimTerms = profile.terms;
  const keyTerms =
    profile.subject.length || profile.outcome.length
      ? [...profile.subject, ...profile.outcome]
      : profile.terms;
  const publications: PublicationAssessment[] = [...sources.values()].map(
    (s) => {
      const rows = byPub.get(s.publication.id) ?? [];
      const mine = assessed.filter((a) => a.publicationId === s.publication.id);
      const sup = mine.some((a) => a.role === "SUPPORTING");
      const con = mine.some((a) => a.role === "CONTRADICTING");
      // Off-topic only when NONE of the claim's key terms appear in the title or
      // any passage: weak lexical overlap alone never makes a citation "misleading".
      const pubTokens = tokenSet(
        `${s.publication.title} ${rows.map((r) => r.normalizedText ?? r.sourceText).join(" ")}`,
      );
      const onTopic =
        mine.some(
          (a) =>
            a.relevanceScore >= ON_TOPIC_RELEVANCE || a.stance !== "NEUTRAL",
        ) ||
        coverage(claimTerms, tokenSet(s.publication.title)) >=
          ON_TOPIC_TITLE_COVERAGE ||
        keyTerms.some((t) => pubTokens.has(t));
      return {
        ...s.publication,
        citationIds: s.citationIds,
        citationTexts: s.citationTexts,
        evidenceCount: rows.length,
        evidenceSource: sourceTypeOf(rows),
        onTopic: rows.length > 0 && onTopic,
        contribution: !rows.length
          ? "NO_EVIDENCE"
          : sup && con
            ? "MIXED"
            : sup
              ? "SUPPORTING"
              : con
                ? "CONTRADICTING"
                : "NEUTRAL",
      };
    },
  );
  const pubById = new Map(publications.map((p) => [p.id, p]));

  // ── Verdict ──────────────────────────────────────────────────────────
  let verdict: Verdict;
  let reasonCode: ReasonCode;
  let explanation: string;
  let raw = 0; // 0..1 before caps
  const decisive = [...supporting, ...contradicting];
  const decisiveSource = sourceTypeOf(decisive);
  const linkOf = (pubIds: Iterable<string>) => {
    const f = [...new Set(pubIds)].map(
      (id) => sources.get(id)?.linkFactor ?? 0.5,
    );
    return f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0.5;
  };
  const evidenceStrength = (items: AssessedEvidence[]) => {
    const strengths = items
      .map((i) => strengthOf(i.evidenceId))
      .sort((a, b) => b - a);
    const top = strengths[0] ?? 0;
    const corroboration = Math.min(0.15, 0.05 * (strengths.length - 1));
    const avail = hasFullText(sourceTypeOf(items)) ? 1 : 0.8;
    return (
      (0.45 + 0.55 * top + corroboration) *
      linkOf(items.map((i) => i.publicationId)) *
      avail
    );
  };
  const onTopicPubs = publications.filter((p) => p.onTopic);
  const quoteCue = profile.assertion.cue ? ` ("${profile.assertion.cue}")` : "";

  if (!input.citations.length) {
    verdict = Verdict.NEEDS_HUMAN_REVIEW;
    reasonCode = "NO_CITATION";
    explanation =
      "The claim has no linked citation, so there is no cited source to check it against.";
  } else if (!sources.size) {
    verdict = Verdict.NEEDS_HUMAN_REVIEW;
    reasonCode = "UNRESOLVED_CITATION";
    explanation =
      "None of the claim's citations could be resolved to a retrieved publication.";
  } else if (!evidence.length) {
    verdict = Verdict.NEEDS_HUMAN_REVIEW;
    reasonCode = "NO_EVIDENCE";
    explanation =
      "No abstract or accessible full text is available for the cited publication(s); the claim could not be checked.";
  } else if (
    !onTopicPubs.length &&
    publications.every((p) => p.evidenceCount > 0)
  ) {
    verdict = Verdict.MISLEADING_CITATION;
    reasonCode = "CITED_SOURCE_OFF_TOPIC";
    const best = Math.max(0, ...assessed.map((a) => a.relevanceScore));
    raw =
      (0.55 + 0.3 * (1 - best / ON_TOPIC_RELEVANCE)) * linkOf(sources.keys());
    explanation = `The cited ${publications.length > 1 ? "publications do" : "publication does"} not appear to address the claim's topic: no passage${scopeType === "ABSTRACT" ? " of the abstract" : ""} and no title shares its key terms.`;
  } else if (!analysable) {
    verdict = Verdict.NEEDS_HUMAN_REVIEW;
    reasonCode = "CLAIM_NOT_ANALYSABLE";
    explanation =
      "The claim states no explicit direction of effect or association that the rules can compare with the sources.";
  } else if (supporting.length && contradicting.length) {
    const years = (items: AssessedEvidence[]) =>
      [...new Set(items.map((i) => i.publicationId))].map(
        (id) => pubById.get(id)?.year ?? null,
      );
    const supYears = years(supporting);
    const conYears = years(contradicting);
    const disjoint = !supporting.some((s) =>
      contradicting.some((c) => c.publicationId === s.publicationId),
    );
    if (
      disjoint &&
      supYears.every((y) => y !== null) &&
      conYears.every((y) => y !== null) &&
      Math.max(...(supYears as number[])) + OUTDATED_GAP_YEARS <=
        Math.min(...(conYears as number[]))
    ) {
      verdict = Verdict.OUTDATED;
      reasonCode = "SUPERSEDED_BY_NEWER_EVIDENCE";
      raw = evidenceStrength(contradicting);
      explanation = `Older cited evidence (${Math.max(...(supYears as number[]))}) agrees with the claim, but newer cited evidence (${Math.min(...(conYears as number[]))}) reports a different result.`;
    } else {
      verdict = Verdict.NEEDS_HUMAN_REVIEW;
      reasonCode = "CONFLICTING_EVIDENCE";
      explanation = `The cited evidence conflicts: ${supporting.length} passage(s) agree with the claim and ${contradicting.length} report a different result.`;
    }
  } else if (contradicting.length) {
    verdict = Verdict.CONTRADICTED;
    reasonCode = "CONTRADICTING_EVIDENCE";
    raw = evidenceStrength(contradicting);
    const notSig = contradicting.every((c) =>
      c.flags.includes("NO_EFFECT_REPORTED"),
    );
    explanation = `The cited ${sourceWord(decisiveSource)} ${notSig ? "reports no statistically significant effect" : "reports a different direction of effect"} for what the claim asserts${quoteCue}.`;
  } else if (supporting.length) {
    const overreach = [
      ...new Set(
        supporting.flatMap((s) =>
          s.flags.filter((f) => CLAIM_OVERREACH.has(f)),
        ),
      ),
    ];
    const fullAgreement = supporting.some((s) => s.stance === "AGREES");
    if (overreach.length || !fullAgreement) {
      verdict = Verdict.PARTIALLY_SUPPORTED;
      reasonCode = "OVERSTATED_CLAIM";
      raw = evidenceStrength(supporting) * 0.9;
      const why = (
        overreach.length
          ? overreach
          : [...new Set(supporting.flatMap((s) => s.flags))]
      )
        .map((f) => FLAG_TEXT[f])
        .filter(Boolean);
      explanation = `The cited ${sourceWord(decisiveSource)} reports a finding in the same direction, but ${why.length ? why.join("; ") : "only part of the claim is covered"}.`;
    } else {
      verdict = Verdict.SUPPORTED;
      reasonCode = "SUPPORTING_EVIDENCE";
      raw = evidenceStrength(supporting);
      explanation = `${supporting.length} passage(s) of the cited ${sourceWord(decisiveSource)} report a finding in the same direction as the claim${quoteCue}.`;
    }
  } else if (onTopicPubs.some((p) => hasFullText(p.evidenceSource))) {
    verdict = Verdict.UNSUPPORTED;
    reasonCode = "FINDING_NOT_REPORTED";
    raw = 0.55 * linkOf(onTopicPubs.map((p) => p.id));
    explanation =
      "The cited full text concerns the claim's topic, but no passage reports the claimed finding.";
  } else {
    verdict = Verdict.NEEDS_HUMAN_REVIEW;
    reasonCode = "INSUFFICIENT_EVIDENCE";
    explanation =
      "The available text (abstract only) concerns the topic but does not report the claimed finding; the full text may.";
  }
  rules.push(`verdict:${reasonCode}`);

  const confidenceSource = decisive.length ? decisiveSource : scopeType;
  const confidence =
    verdict === Verdict.NEEDS_HUMAN_REVIEW
      ? Math.round(100 * (REVIEW_CONFIDENCE[reasonCode] ?? 0.2))
      : Math.round(
          100 * clamp(Math.min(raw, capFor(verdict, confidenceSource))),
        );
  if (confidenceSource === "ABSTRACT" && verdict !== Verdict.NEEDS_HUMAN_REVIEW)
    rules.push("cap:abstract-only");

  // ── Limitations & review ─────────────────────────────────────────────
  const limitations: string[] = [];
  limitations.push(
    strategy.method === "AI"
      ? "AI-assisted assessment cross-checked with explicit-wording rules; tables, figures and synonyms may be missed."
      : "Rule-based reading of explicit wording: synonyms, paraphrases, tables and figures are not interpreted.",
  );
  for (const p of publications) {
    if (p.evidenceSource === "ABSTRACT")
      limitations.push(
        `${label(p)}: only the abstract was available${p.fullTextStatus && p.fullTextStatus !== "AVAILABLE" ? ` (full text: ${p.fullTextStatus})` : ""}, so methods, full results and limitations may be missing.`,
      );
    if (p.contribution === "NO_EVIDENCE")
      limitations.push(
        `${label(p)}: no abstract or accessible full text, not checked.`,
      );
    if (
      p.evidenceCount > 0 &&
      !p.onTopic &&
      verdict !== Verdict.MISLEADING_CITATION
    )
      limitations.push(
        `${label(p)} does not appear to address the claim's topic.`,
      );
  }
  for (const u of unresolved)
    limitations.push(`Citation ${u.citationText}: ${u.reason}.`);
  if (limitationEvidence.length)
    limitations.push(
      "The source states limitations relevant to this claim (see context evidence).",
    );
  if (
    supporting.length &&
    supporting.every((s) => s.flags.includes("HEDGED_SOURCE"))
  )
    limitations.push(
      "The supporting passages are worded tentatively by their authors.",
    );

  const reviewReasons: string[] = [];
  if (verdict === Verdict.NEEDS_HUMAN_REVIEW) reviewReasons.push(explanation);
  else {
    if (confidence < REVIEW_BELOW)
      reviewReasons.push("Low confidence in the automated assessment.");
    if (confidenceSource === "ABSTRACT")
      reviewReasons.push("Based on abstract text only.");
    if (SERIOUS_VERDICTS.has(verdict))
      reviewReasons.push(
        "A contradicted, outdated or misleading citation should be confirmed by a person.",
      );
  }
  if ([...sources.values()].some((s) => s.linkNeedsReview))
    reviewReasons.push(
      "A claim–citation link is uncertain (citation not inside the claim sentence).",
    );
  if (unresolved.length && verdict !== Verdict.NEEDS_HUMAN_REVIEW)
    reviewReasons.push(
      "Some citations could not be resolved and were not checked.",
    );
  const decisiveFlags = new Set(decisive.flatMap((d) => d.flags));
  if (decisiveFlags.has("POPULATION_MISMATCH"))
    reviewReasons.push(
      "The evidence comes from a different population than the claim.",
    );
  if (assessed.some((a) => a.flags.includes("AI_RULE_CONFLICT")))
    reviewReasons.push(
      "AI and rule-based readings disagreed on some passages.",
    );
  if (decisiveFlags.has("AI_ONLY"))
    reviewReasons.push("Some stances come from the AI provider only.");

  return {
    claimId: input.claim.id,
    verdict,
    confidence,
    explanation,
    reasonCode,
    supportingEvidence: sortByStrength(supporting, strengthOf),
    contradictingEvidence: sortByStrength(contradicting, strengthOf),
    contextEvidence,
    publications,
    unresolvedCitations: unresolved,
    evidenceSource: decisive.length
      ? decisiveSource
      : sourceTypeOf(assessed.length ? assessed : evidence),
    verificationScope,
    limitations,
    humanReview: {
      recommended: reviewReasons.length > 0,
      reasons: [...new Set(reviewReasons)],
    },
    method: strategy.method,
    strategy: strategy.name,
    rulesApplied: [
      ...rules,
      `candidates:${contexts.length}`,
      `supporting:${supporting.length}`,
      `contradicting:${contradicting.length}`,
      `confidence-source:${confidenceSource}`,
      `raw-confidence:${round(raw, 3)}`,
    ],
    assessmentType: "AUTOMATED",
    disclaimer: DISCLAIMER,
  };
}

function sourceWord(source: EvidenceSourceType) {
  return source === "ABSTRACT"
    ? "abstract"
    : source === "MIXED"
      ? "abstract and full text"
      : "full text";
}

const sortByStrength = (
  items: AssessedEvidence[],
  strengthOf: (id: string) => number,
) =>
  [...items].sort(
    (a, b) =>
      strengthOf(b.evidenceId) - strengthOf(a.evidenceId) ||
      b.relevanceScore - a.relevanceScore,
  );

/** Verifies claims one after another (each claim is independent). */
export async function verifyClaims(
  inputs: readonly ClaimVerificationInput[],
  options: VerifyOptions = {},
) {
  const out: ClaimVerification[] = [];
  for (const input of inputs) out.push(await verifyClaim(input, options));
  return out;
}
