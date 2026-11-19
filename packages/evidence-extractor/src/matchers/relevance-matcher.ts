/**
 * Claim ↔ evidence RELEVANCE ranking.
 *
 * Scores measure how much an evidence passage is ABOUT the same thing as the
 * claim (shared important terms, subject/outcome terms, phrases, numbers and
 * character similarity). They never say whether the passage supports or
 * contradicts the claim — that is the verification engine's job.
 */
import {
  EvidenceType,
  type EvidenceType as EvidenceTypeValue,
} from "@citeverify/shared";
import type {
  RankedEvidence,
  RelevanceCandidate,
  RelevanceClaim,
  RelevanceLevel,
} from "../types/evidence.types.ts";
import {
  charTrigrams,
  contentTokens,
  diceOf,
  numericExpressions,
} from "../utils/text.ts";

export const DEFAULT_MIN_RELEVANCE = 0.2;
export const DEFAULT_TOP_K = 10;

/** How useful each evidence kind usually is when checking a claim (results first). */
const TYPE_WEIGHT: Record<EvidenceTypeValue, number> = {
  [EvidenceType.STATISTICAL_RESULT]: 1,
  [EvidenceType.EXPERIMENTAL_RESULT]: 1,
  [EvidenceType.ABSTRACT_FINDING]: 1,
  [EvidenceType.CONCLUSION]: 0.95,
  [EvidenceType.DISCUSSION]: 0.85,
  [EvidenceType.LIMITATION]: 0.8,
  [EvidenceType.METHODOLOGY]: 0.75,
};

// "X reduces Y", "X is associated with Y", "X improved Y" → subject X, outcome Y.
const RELATION =
  /\b(?:(?:is|are|was|were)\s+(?:not\s+)?(?:positively\s+|negatively\s+|inversely\s+|strongly\s+|significantly\s+)?(?:associated|correlated|linked)\s+with|(?:may|might|can|could|does|did|do)\s+(?:not\s+)?\w+|(?:increase|decrease|reduce|improve|lower|raise|enhance|impair|predict|prevent|cause|inhibit|affect|alter|elevate|protect)(?:s|d|ed)?(?:\s+against)?|leads?\s+to|results?\s+in)\b/i;

export function subjectOutcome(
  claim: string,
): { subject: string[]; outcome: string[] } | null {
  const m = RELATION.exec(claim);
  if (!m || m.index === 0) return null;
  const subject = [...new Set(contentTokens(claim.slice(0, m.index)))];
  // Outcome terms must differ from the subject ("sleep extension increases total SLEEP time").
  const outcome = [
    ...new Set(contentTokens(claim.slice(m.index + m[0].length))),
  ].filter((t) => !subject.includes(t));
  return subject.length && outcome.length ? { subject, outcome } : null;
}

const bigrams = (tokens: string[]) =>
  tokens.slice(1).map((t, i) => `${tokens[i]} ${t}`);
const round = (n: number) => Math.round(n * 100) / 100;
const level = (score: number): RelevanceLevel =>
  score >= 0.6 ? "HIGH" : score >= 0.4 ? "MEDIUM" : "LOW";

/**
 * Ranks candidate evidence for one claim. Term weights are IDF over the
 * candidate set, so terms every passage shares (e.g. the paper's topic word)
 * count less than the claim's distinctive terms.
 */
export function rankEvidenceForClaim(
  claim: RelevanceClaim,
  candidates: readonly RelevanceCandidate[],
  { minRelevance = DEFAULT_MIN_RELEVANCE, topK = DEFAULT_TOP_K } = {},
): RankedEvidence[] {
  const claimTokens = contentTokens(claim.text);
  const claimSet = new Set(claimTokens);
  if (!claimSet.size || !candidates.length) return [];

  const docs = candidates.map((c) => ({ c, tokens: contentTokens(c.text) }));
  const df = new Map<string, number>();
  for (const d of docs)
    for (const t of new Set(d.tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  const idf = (t: string) => Math.log(1 + (n + 1) / ((df.get(t) ?? 0) + 0.5));
  const claimWeight = [...claimSet].reduce((s, t) => s + idf(t), 0);

  const so = subjectOutcome(claim.text);
  const claimBigrams = new Set(bigrams(claimTokens));
  const claimNumbers = new Set(numericExpressions(claim.text));
  const claimNumberValues = new Map(
    [...claimNumbers].map((x) => [x.split(" ")[0] ?? x, x]),
  );
  const claimGrams = charTrigrams(claim.text);

  const ranked: Omit<RankedEvidence, "rank">[] = [];
  for (const { c, tokens } of docs) {
    const set = new Set(tokens);
    const shared = [...claimSet].filter((t) => set.has(t));
    if (!shared.length) continue;

    const terms = shared.reduce((s, t) => s + idf(t), 0) / claimWeight;
    // The outcome must be present; the subject is often implicit in a paper about it.
    const coverage = (terms: string[]) =>
      terms.filter((t) => set.has(t)).reduce((s, t) => s + idf(t), 0) /
      terms.reduce((s, t) => s + idf(t), 0);
    const outcomeCoverage = so ? coverage(so.outcome) : null;
    const subjectOutcomeScore =
      so && outcomeCoverage !== null
        ? round(outcomeCoverage * (0.7 + 0.3 * coverage(so.subject)))
        : null;
    const evBigrams = new Set(bigrams(tokens));
    const phrases = claimBigrams.size
      ? [...claimBigrams].filter((b) => evBigrams.has(b)).length /
        claimBigrams.size
      : 0;

    const evNumbers = numericExpressions(c.text);
    const matchedNumbers: string[] = [];
    let numberHits = 0;
    for (const x of new Set(evNumbers)) {
      if (claimNumbers.has(x)) {
        numberHits += 1;
        matchedNumbers.push(x);
      } else {
        const value = x.split(" ")[0] ?? x;
        const claimForm = claimNumberValues.get(value);
        if (claimForm && !claimForm.includes(" ")) {
          numberHits += 0.5; // same value, unit only on one side
          matchedNumbers.push(x);
        }
      }
    }
    const numbers = claimNumbers.size
      ? Math.min(1, numberHits / claimNumbers.size)
      : null;
    const characters = diceOf(claimGrams, charTrigrams(c.text));

    const parts: [number, number][] = [
      [terms, 0.4],
      [phrases, 0.15],
      [characters, 0.15],
    ];
    if (subjectOutcomeScore !== null) parts.push([subjectOutcomeScore, 0.25]);
    if (numbers !== null) parts.push([numbers, 0.1]);
    const base =
      parts.reduce((s, [v, w]) => s + v * w, 0) /
      parts.reduce((s, [, w]) => s + w, 0);
    const typeWeight = c.evidenceType ? TYPE_WEIGHT[c.evidenceType] : 0.9;
    // Topic-only overlap (the claim's outcome mostly absent) is capped: related, but not about the claim.
    let score = base * typeWeight;
    if (outcomeCoverage !== null && outcomeCoverage < 0.5)
      score = Math.min(score, 0.45);
    score = round(Math.min(score, 1));
    if (score < minRelevance) continue;

    ranked.push({
      evidenceId: c.id,
      relevanceScore: score,
      relevanceLevel: level(score),
      matchedTerms: shared.sort((a, b) => idf(b) - idf(a)),
      matchedNumbers,
      breakdown: {
        terms: round(terms),
        subjectOutcome: subjectOutcomeScore,
        phrases: round(phrases),
        numbers: numbers === null ? null : round(numbers),
        characters: round(characters),
        typeWeight,
      },
    });
  }
  return ranked
    .sort(
      (a, b) =>
        b.relevanceScore - a.relevanceScore ||
        a.evidenceId.localeCompare(b.evidenceId),
    )
    .slice(0, topK)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
