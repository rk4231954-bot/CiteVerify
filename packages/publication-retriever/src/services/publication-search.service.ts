/**
 * Reference → publication retrieval, in this order:
 *   1. Normalise/validate the reference's DOI (field, else one written in the raw text).
 *   2. Exact DOI lookup (primary provider, then fallback), checked against the
 *      reference's own title/author/year so a mis-parsed DOI is not trusted blindly.
 *   3. Title search (bibliographic query) on the primary provider, scored on
 *      title similarity, first-author surname and publication year.
 *   4. OpenAlex (fallback) search only when step 3 is not a confident MATCHED —
 *      no duplicate searches once a reliable match exists.
 *   5. For a MATCHED DOI, an optional fallback DOI *lookup* fills missing fields
 *      (abstract, open-access status) without replacing the primary's metadata.
 *
 * Statuses: MATCHED (confident, single), AMBIGUOUS (several similar), NEEDS_REVIEW
 * (uncertain), NOT_FOUND (providers answered, nothing fits), FAILED (providers
 * unavailable — never reported as NOT_FOUND). Only MATCHED returns a publication.
 */
import { surnameOf } from "@citeverify/citation-engine";
import { PublicationMatchStatus as S } from "@citeverify/shared";
import { resolveReferenceDoi } from "../resolvers/doi-resolver.ts";
import type {
  MatchMethod,
  NormalizedPublication,
  ProviderFailure,
  PublicationCandidate,
  PublicationSource,
  ReferenceQuery,
  RetrievalResult,
} from "../types/publication.types.ts";
import { ProviderError } from "../utils/errors.ts";
import {
  normalizeTitle,
  providerSurname,
  surnameKey,
  titleSimilarity,
  wordCount,
} from "../utils/text.ts";
import {
  isSameWork,
  mergePublications,
} from "./publication-normalizer.service.ts";

export const MATCH_THRESHOLD = 0.9;
const CLEAR_GAP = 0.1;
const AMBIGUOUS_FLOOR = 0.75;
const REVIEW_FLOOR = 0.5;
const KEEP_FLOOR = 0.4;
const NOTICE =
  /^(?:correction|corrigendum|erratum|retraction|retracted|reply|response|comment|expression of concern)\b/i;

const round = (n: number) => Math.round(n * 100) / 100;

export type RetrieverOptions = {
  /** Searched first; also used for exact DOI lookup. Typically Crossref. */
  primary: PublicationSource | null;
  /** Complement and fallback. Typically OpenAlex. */
  fallback?: PublicationSource | null;
  searchLimit?: number;
  /** Look a matched DOI up in the fallback too, to fill missing fields (default true). */
  enrich?: boolean;
};

type Ctx = { errors: ProviderFailure[]; cache: Map<string, Promise<unknown>> };

// ─── Scoring ───────────────────────────────────────────────────────────────

function referenceSurnames(ref: ReferenceQuery): string[] {
  return ref.authors
    .map((a) => surnameOf(a) ?? "")
    .map(surnameKey)
    .filter(Boolean);
}

function authorAgreement(
  ref: ReferenceQuery,
  pub: NormalizedPublication,
): number | null {
  const mine = referenceSurnames(ref);
  const theirs = pub.authors
    .map((a) => surnameKey(providerSurname(a)))
    .filter(Boolean);
  if (!mine.length || !theirs.length) return null;
  if (mine[0] === theirs[0]) return 1;
  return theirs.includes(mine[0] ?? "") ? 0.8 : 0;
}

function yearAgreement(
  ref: ReferenceQuery,
  pub: NormalizedPublication,
): number | null {
  if (ref.year === null || pub.year === null) return null;
  const diff = Math.abs(ref.year - pub.year);
  return diff === 0 ? 1 : diff === 1 ? 0.8 : 0; // ±1: online-first vs print year
}

function titleAgreement(
  ref: ReferenceQuery,
  pub: NormalizedPublication,
): number {
  if (ref.title) return titleSimilarity(ref.title, pub.title);
  // No parsed title: the candidate's title must appear verbatim (normalised) in the raw entry.
  const t = normalizeTitle(pub.title);
  return wordCount(pub.title) >= 3 && normalizeTitle(ref.rawText).includes(t)
    ? 0.95
    : 0;
}

/** Scores a search candidate. Title agreement is required; author/year can only confirm or veto. */
export function scoreCandidate(
  ref: ReferenceQuery,
  pub: NormalizedPublication,
): PublicationCandidate {
  const t = titleAgreement(ref, pub);
  const a = authorAgreement(ref, pub);
  const y = yearAgreement(ref, pub);
  const reasons = [`title similarity ${t}`];
  if (a !== null)
    reasons.push(
      a === 1
        ? "first author matches"
        : a > 0
          ? "cited first author is a co-author"
          : "first author differs",
    );
  if (y !== null)
    reasons.push(
      y === 1
        ? `year ${pub.year} matches`
        : y > 0
          ? `year off by one (${ref.year} vs ${pub.year})`
          : `year differs (${ref.year} vs ${pub.year})`,
    );

  const parts: [number, number][] = [[t, 0.6]];
  if (a !== null) parts.push([a, 0.2]);
  if (y !== null) parts.push([y, 0.2]);
  let score =
    parts.reduce((s, [v, w]) => s + v * w, 0) /
    parts.reduce((s, [, w]) => s + w, 0);

  // A different title cannot be rescued by author/year. Only when both agree
  // (e.g. a mangled parsed title) is it kept as a candidate for review.
  if (t < 0.6) score = a === 1 && y === 1 ? Math.min(score, t) : t * 0.5;
  // With a contradicting first author, only a near-identical title stays reviewable.
  else if (a === 0 && t < 0.85) score = Math.min(score, t * 0.5);
  if (a === 0 && y === 0) score *= 0.5;
  else if (a === 0 || y === 0) score = Math.min(score, 0.85); // a contradiction caps it below MATCHED
  if (a === null && y === null && wordCount(pub.title) < 5) {
    score = Math.min(score, 0.8); // a short title alone is not proof
    reasons.push("short title with no author/year to confirm");
  }
  if (NOTICE.test(pub.title) && !NOTICE.test(ref.title ?? ref.rawText)) {
    score *= 0.5;
    reasons.push("candidate is a correction/retraction/comment notice");
  }
  return { publication: pub, score: round(score), reasons };
}

/** Checks that a DOI lookup result is consistent with what the reference states. */
function doiConsistency(
  ref: ReferenceQuery,
  pub: NormalizedPublication,
): { ok: boolean; score: number; reasons: string[] } {
  const t = ref.title ? titleSimilarity(ref.title, pub.title) : null;
  const a = authorAgreement(ref, pub);
  const y = yearAgreement(ref, pub);
  const reasons = ["exact DOI match"];
  if (t !== null) reasons.push(`title similarity ${t}`);
  if (a !== null)
    reasons.push(a > 0 ? "first author agrees" : "first author differs");
  if (y !== null)
    reasons.push(
      y > 0 ? "year agrees" : `year differs (${ref.year} vs ${pub.year})`,
    );
  if (t !== null && t >= 0.6)
    return { ok: true, score: a === 0 || y === 0 ? 0.95 : 0.99, reasons };
  if (t === null && a !== 0 && y !== 0)
    return { ok: true, score: 0.97, reasons };
  if (a !== null && a > 0 && y !== null && y > 0)
    return {
      ok: true,
      score: 0.93,
      reasons: [...reasons, "title differs but author and year agree"],
    };
  return {
    ok: false,
    score: 0.6,
    reasons: [
      ...reasons,
      "DOI resolves to a work that does not agree with the reference",
    ],
  };
}

function decide(candidates: PublicationCandidate[]): {
  status: S;
  best: PublicationCandidate | null;
  reason: string;
} {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const [best, second] = sorted;
  if (!best || best.score < REVIEW_FLOOR)
    return {
      status: S.NOT_FOUND,
      best: null,
      reason: "no candidate is similar enough",
    };
  if (
    best.score >= MATCH_THRESHOLD &&
    (!second || best.score - second.score >= CLEAR_GAP)
  )
    return { status: S.MATCHED, best, reason: best.reasons.join("; ") };
  if (
    second &&
    second.score >= AMBIGUOUS_FLOOR &&
    best.score - second.score < CLEAR_GAP
  )
    return {
      status: S.AMBIGUOUS,
      best: null,
      reason: `${sorted.filter((c) => best.score - c.score < CLEAR_GAP).length} publications fit similarly well`,
    };
  return {
    status: S.NEEDS_REVIEW,
    best: null,
    reason: `uncertain best candidate: ${best.reasons.join("; ")}`,
  };
}

/** Adds candidates, merging records of the same work found by different providers. */
function addCandidates(
  into: PublicationCandidate[],
  ref: ReferenceQuery,
  pubs: NormalizedPublication[],
) {
  for (const pub of pubs) {
    const existing = into.find((c) => isSameWork(c.publication, pub));
    if (existing) {
      const merged = mergePublications(existing.publication, pub);
      const rescored = scoreCandidate(ref, merged);
      existing.publication = merged;
      existing.score = Math.max(existing.score, rescored.score);
      existing.reasons =
        rescored.score >= existing.score ? rescored.reasons : existing.reasons;
    } else {
      into.push(scoreCandidate(ref, pub));
    }
  }
}

// ─── Retriever ─────────────────────────────────────────────────────────────

export class PublicationRetriever {
  private readonly primary: PublicationSource | null;
  private readonly fallback: PublicationSource | null;
  private readonly searchLimit: number;
  private readonly enrich: boolean;

  constructor(options: RetrieverOptions) {
    this.primary = options.primary;
    this.fallback = options.fallback ?? null;
    this.searchLimit = options.searchLimit ?? 5;
    this.enrich = options.enrich ?? true;
  }

  get providers(): PublicationSource[] {
    return [this.primary, this.fallback].filter(
      (p): p is PublicationSource => p !== null,
    );
  }

  /** Runs a provider call; failures are recorded (not thrown). undefined = failed, null = not found. */
  private async call<T>(
    ctx: Ctx,
    key: string,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    let pending = ctx.cache.get(key) as Promise<T> | undefined;
    if (!pending) {
      pending = fn();
      ctx.cache.set(key, pending);
    }
    try {
      return await pending;
    } catch (error) {
      if (error instanceof ProviderError) {
        if (
          !ctx.errors.some(
            (e) => e.provider === error.provider && e.message === error.message,
          )
        )
          ctx.errors.push(error.toFailure());
      } else {
        throw error;
      }
      return undefined;
    }
  }

  private lookup(ctx: Ctx, source: PublicationSource, doi: string) {
    return this.call(ctx, `${source.name}:doi:${doi}`, () =>
      source.lookupDoi(doi),
    );
  }

  private async enrichFromFallback(
    ctx: Ctx,
    pub: NormalizedPublication,
  ): Promise<NormalizedPublication> {
    if (
      !this.enrich ||
      !this.fallback ||
      !pub.doi ||
      pub.provider === this.fallback.name
    )
      return pub;
    const extra = await this.lookup(ctx, this.fallback, pub.doi);
    return extra && isSameWork(pub, extra)
      ? mergePublications(pub, extra)
      : pub;
  }

  async retrieve(
    ref: ReferenceQuery,
    shared?: Map<string, Promise<unknown>>,
  ): Promise<RetrievalResult> {
    const ctx: Ctx = { errors: [], cache: shared ?? new Map() };
    const result = (
      status: S,
      extra: Partial<RetrievalResult> & { reason: string },
    ): RetrievalResult => ({
      referenceId: ref.id,
      status,
      confidence: 0,
      method: null,
      publication: null,
      candidates: [],
      errors: ctx.errors,
      ...extra,
    });
    if (!this.providers.length)
      return result(S.FAILED, {
        reason: "no publication providers are configured",
      });

    const notes: string[] = [];

    // 1–2. Exact DOI.
    const doi = resolveReferenceDoi(ref);
    if (ref.doi && !doi)
      notes.push(`reference DOI "${ref.doi}" is not a valid DOI`);
    if (doi) {
      let pub: NormalizedPublication | null | undefined;
      for (const source of this.providers) {
        pub = await this.lookup(ctx, source, doi);
        if (pub) break;
      }
      if (pub) {
        const enriched = await this.enrichFromFallback(ctx, pub);
        const check = doiConsistency(ref, enriched);
        const candidate = {
          publication: enriched,
          score: check.score,
          reasons: check.reasons,
        };
        if (check.ok)
          return result(S.MATCHED, {
            confidence: check.score,
            method: "DOI",
            publication: enriched,
            candidates: [candidate],
            reason: check.reasons.join("; "),
          });
        return result(S.NEEDS_REVIEW, {
          method: "DOI",
          candidates: [candidate],
          reason: check.reasons.join("; "),
        });
      }
      notes.push(
        ctx.errors.length
          ? `DOI ${doi} could not be looked up`
          : `DOI ${doi} is not known to the providers`,
      );
    }

    // 3–4. Bibliographic search.
    if (!ref.title && wordCount(ref.rawText) < 4) {
      return result(ctx.errors.length ? S.FAILED : S.NOT_FOUND, {
        reason: [...notes, "not enough information to search"].join("; "),
      });
    }
    const query = {
      text: [
        ref.title ?? ref.rawText,
        ref.title ? ref.authors[0] : null,
        ref.title && ref.year ? String(ref.year) : null,
      ]
        .filter(Boolean)
        .join(" "),
      title: ref.title,
      year: ref.year,
    };
    const candidates: PublicationCandidate[] = [];
    let decision: ReturnType<typeof decide> = {
      status: S.NOT_FOUND,
      best: null,
      reason: "",
    };
    for (const source of this.providers) {
      const found = await this.call(
        ctx,
        `${source.name}:search:${query.text}`,
        () => source.search(query, this.searchLimit),
      );
      if (found) addCandidates(candidates, ref, found);
      decision = decide(candidates);
      if (decision.status === S.MATCHED) break; // reliable match: skip the fallback search
    }

    const kept = candidates
      .filter((c) => c.score >= KEEP_FLOOR)
      .sort((a, b) => b.score - a.score);
    const method: MatchMethod = "TITLE";
    if (decision.status === S.MATCHED && decision.best) {
      const publication = await this.enrichFromFallback(
        ctx,
        decision.best.publication,
      );
      return result(S.MATCHED, {
        confidence: decision.best.score,
        method,
        publication,
        candidates: kept,
        reason: [...notes, decision.reason].join("; "),
      });
    }
    if (decision.status === S.NOT_FOUND && ctx.errors.length) {
      // Not every provider answered, so "not found" would be unproven.
      return result(S.FAILED, {
        method,
        candidates: kept,
        reason: [
          ...notes,
          candidates.length
            ? "no confident candidate and a provider was unavailable; retry later"
            : "providers were unavailable; retry later",
        ].join("; "),
      });
    }
    return result(decision.status, {
      method,
      candidates: kept,
      reason: [...notes, decision.reason].join("; "),
    });
  }

  /** Retrieves many references with bounded concurrency, sharing one request cache. */
  async retrieveMany(
    refs: readonly ReferenceQuery[],
    { concurrency = 2 } = {},
  ): Promise<RetrievalResult[]> {
    const cache = new Map<string, Promise<unknown>>();
    const results: RetrievalResult[] = new Array(refs.length);
    let next = 0;
    const worker = async () => {
      while (next < refs.length) {
        const i = next++;
        const ref = refs[i];
        if (ref) results[i] = await this.retrieve(ref, cache);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(concurrency, refs.length) }, worker),
    );
    return results;
  }
}
