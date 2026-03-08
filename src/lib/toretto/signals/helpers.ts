// ============================================================
// Toretto Phase 2 — Signal Helpers
// Pure utility functions for signal computation.
// No database access, no side effects.
// ============================================================

import type { ScoreBand } from "./types";

/**
 * Convert a 0-100 score to its human-readable band.
 *
 *   81-100  → critical
 *   61-80   → high
 *   31-60   → medium
 *   11-30   → low
 *   0-10    → inactive
 */
export function scoreToBand(score: number): ScoreBand {
  if (score >= 81) return "critical";
  if (score >= 61) return "high";
  if (score >= 31) return "medium";
  if (score >= 11) return "low";
  return "inactive";
}

/** Clamp a number to 0-100 integer range */
export function clampScore(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

/**
 * Calculate days between two dates.
 * Returns positive number if `from` is before `to`.
 */
export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return ms / (1000 * 60 * 60 * 24);
}

/**
 * Linear interpolation: map a value from [inMin, inMax] to [outMin, outMax].
 * Clamped to output range.
 */
export function lerp(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  if (inMax === inMin) return outMin;
  const t = (value - inMin) / (inMax - inMin);
  const clamped = Math.max(0, Math.min(1, t));
  return outMin + clamped * (outMax - outMin);
}

/**
 * Map a count to a score using defined thresholds.
 * thresholds: array of [count, score] pairs, sorted by count ascending.
 * Linear interpolation between thresholds.
 *
 * Example: countToScore(3, [[0, 0], [1, 20], [5, 60], [10, 80], [20, 100]])
 *   → interpolates between [1,20] and [5,60] → score ~40
 */
export function countToScore(
  count: number,
  thresholds: [number, number][]
): number {
  if (thresholds.length === 0) return 0;
  if (count <= thresholds[0][0]) return thresholds[0][1];
  if (count >= thresholds[thresholds.length - 1][0]) {
    return thresholds[thresholds.length - 1][1];
  }

  for (let i = 0; i < thresholds.length - 1; i++) {
    const [lo, loScore] = thresholds[i];
    const [hi, hiScore] = thresholds[i + 1];
    if (count >= lo && count <= hi) {
      return lerp(count, lo, hi, loScore, hiScore);
    }
  }

  return thresholds[thresholds.length - 1][1];
}
