/**
 * Reads what a sentence explicitly asserts: direction of the relationship,
 * its kind (cause/effect vs association), hedging, absolute wording,
 * quantities, statistical significance and the population studied.
 * Only explicit wording counts — nothing is inferred from topic similarity.
 */
import { numericExpressions } from "@citeverify/evidence-extractor";
import type {
  Assertion,
  Polarity,
  PopulationGroup,
  RelationKind,
  Significance,
} from "../types/verification.types.ts";
import { tokenPositions } from "../utils/text.ts";
import {
  ABSOLUTE,
  ADULTS,
  ASSOCIATION_PATTERN,
  CAUSAL_DOWN,
  CAUSAL_UP,
  CI_LEVEL,
  DOWN_SIGN,
  EFFECT_DOWN,
  EFFECT_UP,
  HEDGE,
  NONE_PATTERNS,
  NOT_SIGNIFICANT_TEXT,
  P_VALUE,
  POPULATION_PATTERNS,
  SIGNIFICANT_TEXT,
  UNSIGNED_ASSOCIATION,
  UP_SIGN,
} from "./patterns.ts";

type Cue = {
  start: number;
  end: number;
  text: string;
  polarity: Polarity;
  relation: RelationKind;
};

function collectCues(text: string): Cue[] {
  const kept: Cue[] = [];
  const overlaps = (s: number, e: number) =>
    kept.some((c) => s < c.end && e > c.start);
  const add = (
    re: RegExp,
    make: (m: RegExpExecArray) => Omit<Cue, "start" | "end" | "text">,
  ) => {
    for (const m of text.matchAll(re)) {
      const start = m.index;
      const end = start + m[0].length;
      if (!overlaps(start, end))
        kept.push({
          start,
          end,
          text: m[0].trim(),
          ...make(m as RegExpExecArray),
        });
    }
  };
  // Priority: "no effect" > association > causal > plain effect words.
  for (const re of NONE_PATTERNS)
    add(re, (m) => ({
      polarity: "NONE",
      relation: /associat|correlat|linked|related|relationship/.test(m[0])
        ? "ASSOCIATION"
        : "EFFECT",
    }));
  add(ASSOCIATION_PATTERN, (m) => {
    const sign = m[1] ?? m[2] ?? "";
    return {
      polarity: UP_SIGN.test(sign)
        ? "UP"
        : DOWN_SIGN.test(sign)
          ? "DOWN"
          : "UNSIGNED",
      relation: "ASSOCIATION",
    };
  });
  add(UNSIGNED_ASSOCIATION, () => ({
    polarity: "UNSIGNED",
    relation: "ASSOCIATION",
  }));
  add(CAUSAL_UP, () => ({ polarity: "UP", relation: "CAUSAL" }));
  add(CAUSAL_DOWN, () => ({ polarity: "DOWN", relation: "CAUSAL" }));
  add(EFFECT_UP, () => ({ polarity: "UP", relation: "EFFECT" }));
  add(EFFECT_DOWN, () => ({ polarity: "DOWN", relation: "EFFECT" }));
  return kept.sort((a, b) => a.start - b.start);
}

/** The cue that governs the outcome: the closest one to an outcome term (else the first). */
function governingCue(
  text: string,
  cues: Cue[],
  outcomeTerms: readonly string[],
) {
  if (!cues.length) return null;
  const first = cues[0] ?? null;
  if (!outcomeTerms.length || cues.length === 1) return first;
  const positions = tokenPositions(text).filter((p) =>
    outcomeTerms.includes(p.token),
  );
  if (!positions.length) return first;
  const distance = (c: Cue) =>
    Math.min(
      ...positions.map((p) =>
        p.index >= c.end
          ? p.index - c.end
          : p.index < c.start
            ? c.start - p.index
            : 0,
      ),
    );
  const ranked = cues
    .map((c) => ({ c, d: distance(c) }))
    .sort((a, b) => a.d - b.d || a.c.start - b.c.start);
  const best = ranked[0];
  const second = ranked[1];
  if (!best) return first;
  // Two different directions equally close to the outcome: ambiguous.
  if (second && second.d - best.d <= 3 && second.c.polarity !== best.c.polarity)
    return null;
  return best.c;
}

function significanceOf(text: string): Significance | null {
  let sig = false;
  let notSig = false;
  for (const m of text.matchAll(P_VALUE)) {
    const op = m[1] ?? "=";
    const v = Number(m[2]);
    if (!Number.isFinite(v)) continue;
    if ((op === "<" || op === "<=" || op === "≤") && v <= 0.05) sig = true;
    else if (op === "=" && v < 0.05) sig = true;
    else if (op === "=" || op === ">" || op === ">=" || op === "≥") {
      if (v >= 0.05) notSig = true;
    }
  }
  const withoutNot = text.replace(NOT_SIGNIFICANT_TEXT, () => {
    notSig = true;
    return " ";
  });
  if (matches(SIGNIFICANT_TEXT, withoutNot)) sig = true;
  if (sig && notSig) return "MIXED";
  return sig ? "SIGNIFICANT" : notSig ? "NOT_SIGNIFICANT" : null;
}

export function populationsOf(text: string): PopulationGroup[] {
  const t = text.toLowerCase();
  const out: PopulationGroup[] = POPULATION_PATTERNS.filter(([, re]) =>
    re.test(t),
  ).map(([group]) => group);
  if (ADULTS.test(t)) out.push("ADULTS");
  return out;
}

/** `test` on a global regex without leaking `lastIndex` between calls. */
function matches(re: RegExp, text: string) {
  re.lastIndex = 0;
  const found = re.test(text);
  re.lastIndex = 0;
  return found;
}

const unique = (values: string[]) => [...new Set(values)];

export function analyzeAssertion(
  text: string,
  options: { outcomeTerms?: readonly string[] } = {},
): Assertion {
  const lower = text.toLowerCase();
  const cue = governingCue(
    lower,
    collectCues(lower),
    options.outcomeTerms ?? [],
  );
  return {
    polarity: cue?.polarity ?? null,
    relation: cue?.relation ?? null,
    cue: cue?.text ?? null,
    hedged: matches(HEDGE, lower),
    absoluteTerms: unique([...lower.matchAll(ABSOLUTE)].map((m) => m[0])),
    quantities: numericExpressions(
      lower.replace(CI_LEVEL, " ").replace(P_VALUE, " "),
    ).filter((q) => q.includes(" ")),
    significance: significanceOf(lower),
    populations: populationsOf(lower),
  };
}
