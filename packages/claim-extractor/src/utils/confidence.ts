/**
 * Extraction confidence: how sure we are that a sentence IS a scientific
 * claim. It says nothing about whether the claim is true.
 *
 * Signals are combined with a noisy-OR — 1 − Π(1 − wᵢ) — so several weak cues
 * add up, but no number of cues reaches 1. Penalties then scale the result
 * down (e.g. methods-section procedure, hedging).
 */

export type Penalty = { reason: string; factor: number };

export const MIN_CONFIDENCE = 0.01;
export const MAX_CONFIDENCE = 0.99;

export function combineSignalWeights(weights: readonly number[]): number {
  return (
    1 -
    weights.reduce(
      (remaining, w) => remaining * (1 - Math.min(Math.max(w, 0), 1)),
      1,
    )
  );
}

export function computeConfidence(
  weights: readonly number[],
  penalties: readonly Penalty[] = [],
): number {
  const base = combineSignalWeights(weights);
  const scaled = penalties.reduce((value, p) => value * p.factor, base);
  return roundConfidence(scaled);
}

export function roundConfidence(value: number): number {
  const clamped = Math.min(Math.max(value, MIN_CONFIDENCE), MAX_CONFIDENCE);
  return Math.round(clamped * 100) / 100;
}
