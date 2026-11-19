/**
 * Citation → reference matching with explicit confidence.
 *
 * Numeric: "[n]" matches the entry labelled n. Without labels, the n-th entry
 *   is only proposed (NEEDS_REVIEW) — position alone is not proof.
 * Author-year: each reference is scored on
 *   first-author surname × year (+ suffix) × author-count consistency,
 *   then the candidates decide the status:
 *     MATCHED       one candidate ≥ 0.85, clearly ahead of any other (gap ≥ 0.2)
 *     AMBIGUOUS     several strong candidates (e.g. "Smith 2020" vs 2020a/2020b)
 *     NEEDS_REVIEW  only weak/partial candidates (year off by one, unparsed authors…)
 *     UNMATCHED     no candidate at all
 * Only MATCHED sets a referenceId; every other outcome keeps its candidates.
 * A match links a marker to an entry — it says nothing about scientific support.
 */
import { CitationMatchStatus } from "@citeverify/shared";
import type {
  AuthorYearTarget,
  CitationMatch,
  DetectedCitation,
  MatchCandidate,
  ParsedReference,
} from "../types/citation.types.ts";
import { editDistance, surnameKey, surnameOf } from "../utils/names.ts";

export const MATCH_THRESHOLD = 0.85;
const CLEAR_GAP = 0.2;
const MIN_CANDIDATE = 0.3;
const NUMERIC_LABEL_CONFIDENCE = 0.97;
const NUMERIC_POSITION_CONFIDENCE = 0.5;

const round = (n: number) => Math.round(n * 100) / 100;

/** Similarity of two surnames: exact, particle-insensitive, or a one-letter slip in a long name. */
export function surnameSimilarity(a: string, b: string): number {
  const x = surnameKey(a);
  const y = surnameKey(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (
    surnameKey(a, { dropParticles: true }) ===
    surnameKey(b, { dropParticles: true })
  )
    return 0.95;
  if (Math.min(x.length, y.length) >= 5 && editDistance(x, y, 1) <= 1)
    return 0.75;
  return 0;
}

function referenceSurnames(ref: ParsedReference): string[] {
  return ref.authors.map(surnameOf).filter((s): s is string => !!s);
}

/** Scores one author-year citation against one reference. Returns null when they can't be the same work. */
export function scoreAuthorYear(
  target: AuthorYearTarget,
  ref: ParsedReference,
): MatchCandidate | null {
  const reasons: string[] = [];
  const surnames = referenceSurnames(ref);
  const [firstCited = ""] = target.authors;

  // 1. First author.
  let authorScore: number;
  if (surnames.length) {
    authorScore = surnameSimilarity(firstCited, surnames[0] ?? "");
    if (!authorScore) return null;
    reasons.push(
      authorScore === 1
        ? `first author "${surnames[0]}" matches`
        : `first author "${surnames[0]}" ≈ "${firstCited}" (score ${authorScore})`,
    );
  } else {
    // Authors could not be parsed: fall back to the name appearing at the start of the raw entry.
    const head = ref.rawText
      .slice(0, 80)
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase();
    if (!head.includes(surnameKey(firstCited))) return null;
    authorScore = 0.6;
    reasons.push(
      `authors not parsed; "${firstCited}" appears at the start of the entry`,
    );
  }

  // 2. Year and suffix.
  let yearScore: number;
  if (target.year === null && ref.year === null) {
    yearScore = 1;
    reasons.push("both undated");
  } else if (ref.year === null) {
    yearScore = 0.5;
    reasons.push("reference year unknown");
  } else if (target.year === ref.year) {
    if (target.yearSuffix === ref.yearSuffix) {
      yearScore = 1;
      reasons.push(`year ${ref.year}${ref.yearSuffix ?? ""} matches`);
    } else if (target.yearSuffix && ref.yearSuffix) {
      return null; // 2020a vs 2020b: different works
    } else {
      yearScore = 0.8;
      reasons.push(
        `year matches but suffix differs ("${target.yearSuffix ?? ""}" vs "${ref.yearSuffix ?? ""}")`,
      );
    }
  } else if (target.year !== null && Math.abs(target.year - ref.year) === 1) {
    yearScore = 0.4;
    reasons.push(`year off by one (${target.year} vs ${ref.year})`);
  } else {
    return null;
  }

  // 3. Author-count consistency ("et al." / two authors / single author).
  let countScore = 1;
  const n = ref.authorsTruncated
    ? Math.max(surnames.length, 3)
    : surnames.length;
  if (surnames.length) {
    if (target.etAl) {
      countScore = n >= 3 ? 1 : n === 2 ? 0.85 : 0.6;
      if (countScore < 1)
        reasons.push(`cited with "et al." but the entry lists ${n} author(s)`);
    } else if (target.authors.length >= 2) {
      const others = target.authors.slice(1);
      const allFound = others.every(
        (a, i) => surnameSimilarity(a, surnames[i + 1] ?? "") >= 0.75,
      );
      if (!allFound) {
        countScore = 0.5;
        reasons.push("co-author names do not match the entry");
      } else if (n !== target.authors.length) {
        countScore = 0.85;
        reasons.push(
          `cited with ${target.authors.length} authors, entry lists ${n}`,
        );
      } else reasons.push("co-authors match");
    } else if (n > 1) {
      countScore = 0.7;
      reasons.push(`cited as a single author, entry lists ${n}`);
    }
  }

  const score = round(authorScore * yearScore * countScore);
  return score >= MIN_CANDIDATE
    ? { referenceId: ref.id, score, reasons }
    : null;
}

function decide(
  citationId: string,
  candidates: MatchCandidate[],
  context: string,
): CitationMatch {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const [best, second] = sorted;
  if (!best) {
    return {
      citationId,
      status: CitationMatchStatus.UNMATCHED,
      referenceId: null,
      confidence: 0,
      candidates: [],
      reason: `no bibliography entry matches ${context}`,
    };
  }
  const clear =
    best.score >= MATCH_THRESHOLD &&
    (!second || best.score - second.score >= CLEAR_GAP);
  if (clear) {
    return {
      citationId,
      status: CitationMatchStatus.MATCHED,
      referenceId: best.referenceId,
      confidence: best.score,
      candidates: sorted,
      reason: best.reasons.join("; "),
    };
  }
  if (second && second.score >= 0.6) {
    return {
      citationId,
      status: CitationMatchStatus.AMBIGUOUS,
      referenceId: null,
      confidence: 0,
      candidates: sorted,
      reason: `${sorted.filter((c) => c.score >= 0.6).length} entries fit ${context} similarly well`,
    };
  }
  return {
    citationId,
    status: CitationMatchStatus.NEEDS_REVIEW,
    referenceId: null,
    confidence: 0,
    candidates: sorted,
    reason: `only an uncertain candidate for ${context}: ${best.reasons.join("; ")}`,
  };
}

export function matchCitation(
  citation: DetectedCitation,
  references: readonly ParsedReference[],
): CitationMatch {
  const { target } = citation;
  if (target.kind === "NUMERIC") {
    const labelled = references.some((r) => r.label !== null);
    if (labelled) {
      const hits = references.filter(
        (r) => r.label !== null && Number(r.label) === target.number,
      );
      const candidates = hits.map((r) => ({
        referenceId: r.id,
        score: NUMERIC_LABEL_CONFIDENCE,
        reasons: [`entry labelled ${r.label}`],
      }));
      if (hits.length > 1) {
        return {
          citationId: citation.id,
          status: CitationMatchStatus.AMBIGUOUS,
          referenceId: null,
          confidence: 0,
          candidates,
          reason: `${hits.length} entries are labelled ${target.number}`,
        };
      }
      return decide(citation.id, candidates, `[${target.number}]`);
    }
    const byPosition = references[target.number - 1];
    const candidates = byPosition
      ? [
          {
            referenceId: byPosition.id,
            score: NUMERIC_POSITION_CONFIDENCE,
            reasons: [
              `bibliography is unnumbered; entry #${target.number} by position`,
            ],
          },
        ]
      : [];
    return decide(citation.id, candidates, `[${target.number}]`);
  }
  const candidates = references
    .map((ref) => scoreAuthorYear(target, ref))
    .filter((c): c is MatchCandidate => c !== null);
  return decide(citation.id, candidates, `"${citation.citationKey}"`);
}

export function matchCitations(
  citations: readonly DetectedCitation[],
  references: readonly ParsedReference[],
): CitationMatch[] {
  return citations.map((c) => matchCitation(c, references));
}
