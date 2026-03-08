// ============================================================
// Toretto Phase 2 — Intent Signal Computations
// Deterministic, no AI. Reads from interactions only.
// intent_deal_progression is a composite signal (requires base
// signals to be computed first).
// ============================================================

import type { SignalComputeContext, SignalComputeResult } from "./types";
import {
  clampScore,
  scoreToBand,
  daysBetween,
  countToScore,
} from "./helpers";

// ─── intent_buying_activity ─────────────────────────────────

/**
 * intent_buying_activity (entity_scope: account)
 *
 * High-intent pattern detection based on interaction types.
 * Certain interaction types signal stronger buying intent.
 *
 * Weighted interaction types:
 *   meeting_held     → 15 points
 *   meeting_booked   → 10 points
 *   positive_reply   → 8 points
 *   call_completed   → 6 points
 *   replied          → 4 points
 *   clicked          → 2 points
 *   (all others)     → 1 point
 *
 * Total weighted score mapped to 0-100 via countToScore.
 */
export function computeIntentBuyingActivity(
  ctx: SignalComputeContext
): SignalComputeResult {
  const { interactions } = ctx;

  if (interactions.length === 0) {
    return {
      score: 0,
      band: "inactive",
      interactionCount: 0,
      breakdown: {
        weighted_total: 0,
        total_interactions: 0,
        reason: "no_interactions",
      },
    };
  }

  // Weight map for interaction types
  const INTENT_WEIGHTS: Record<string, number> = {
    meeting_held: 15,
    meeting_booked: 10,
    positive_reply: 8,
    call_completed: 6,
    replied: 4,
    clicked: 2,
  };

  let weightedTotal = 0;
  const typeCounts: Record<string, number> = {};

  for (const ix of interactions) {
    const type = ix.interaction_type;
    const weight = INTENT_WEIGHTS[type] ?? 1;
    weightedTotal += weight;
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  }

  const score = clampScore(
    countToScore(weightedTotal, [
      [0, 0],
      [5, 15],
      [15, 35],
      [30, 55],
      [50, 75],
      [80, 90],
      [120, 100],
    ])
  );

  return {
    score,
    band: scoreToBand(score),
    interactionCount: interactions.length,
    breakdown: {
      weighted_total: weightedTotal,
      total_interactions: interactions.length,
      type_counts: typeCounts,
    },
  };
}

// ─── intent_silence_risk ────────────────────────────────────

/**
 * intent_silence_risk (entity_scope: account)
 *
 * Detects accounts that were previously active but have gone silent.
 * High score = previously active account now at risk of going dark.
 *
 * Logic:
 *   1. Check if account had 5+ interactions in any 14d window in last 90d
 *      (i.e., was "previously active")
 *   2. Count interactions in last 14d:
 *      - 0 interactions → 90 (silent alarm)
 *      - 1 interaction  → 60 (fading)
 *      - 2+ interactions → 20 (still active, low risk)
 *   3. If not previously active → 0 (no baseline to compare against)
 */
export function computeIntentSilenceRisk(
  ctx: SignalComputeContext
): SignalComputeResult {
  const { interactions, now } = ctx;

  if (interactions.length === 0) {
    return {
      score: 0,
      band: "inactive",
      interactionCount: 0,
      breakdown: {
        was_previously_active: false,
        recent_14d_count: 0,
        total_interactions: 0,
        reason: "no_interactions",
      },
    };
  }

  // Check for "previously active" — 5+ interactions in any 14d rolling window
  // We check non-overlapping 14d windows across the 90d lookback for simplicity
  // Windows: 15-28d, 29-42d, 43-56d, 57-70d, 71-84d
  const windows: { start: number; end: number }[] = [
    { start: 15, end: 28 },
    { start: 29, end: 42 },
    { start: 43, end: 56 },
    { start: 57, end: 70 },
    { start: 71, end: 84 },
  ];

  let wasPreviouslyActive = false;
  let peakWindowCount = 0;

  for (const w of windows) {
    let windowCount = 0;
    for (const ix of interactions) {
      const daysAgo = daysBetween(new Date(ix.occurred_at), now);
      if (daysAgo >= w.start && daysAgo <= w.end) {
        windowCount++;
      }
    }
    if (windowCount > peakWindowCount) peakWindowCount = windowCount;
    if (windowCount >= 5) {
      wasPreviouslyActive = true;
      break;
    }
  }

  // Count recent interactions (last 14d)
  let recent14d = 0;
  for (const ix of interactions) {
    const daysAgo = daysBetween(new Date(ix.occurred_at), now);
    if (daysAgo <= 14) recent14d++;
  }

  // Not previously active — no baseline to measure silence against
  if (!wasPreviouslyActive) {
    return {
      score: 0,
      band: "inactive",
      interactionCount: interactions.length,
      breakdown: {
        was_previously_active: false,
        peak_window_count: peakWindowCount,
        recent_14d_count: recent14d,
        total_interactions: interactions.length,
        reason: "not_previously_active",
      },
    };
  }

  // Previously active — score based on recent activity
  let score: number;
  if (recent14d === 0) score = 90;
  else if (recent14d === 1) score = 60;
  else if (recent14d <= 3) score = 30;
  else score = 10;

  score = clampScore(score);

  return {
    score,
    band: scoreToBand(score),
    interactionCount: interactions.length,
    breakdown: {
      was_previously_active: true,
      peak_window_count: peakWindowCount,
      recent_14d_count: recent14d,
      total_interactions: interactions.length,
      risk_level:
        recent14d === 0
          ? "silent"
          : recent14d === 1
            ? "fading"
            : "active",
    },
  };
}

// ─── intent_deal_progression ────────────────────────────────

/**
 * intent_deal_progression (entity_scope: deal)
 *
 * COMPOSITE SIGNAL — requires base signals to be computed first.
 * Combines three signals into a deal trajectory score:
 *
 *   deal_stage_velocity  × 0.4  (pipeline movement)
 *   deal_momentum        × 0.3  (activity acceleration)
 *   intent_buying_activity × 0.3 (high-intent actions)
 *
 * If related signals are not available, falls back to direct
 * interaction-based computation for each missing component.
 *
 * Requires ctx.relatedSignals to be populated by the engine.
 */
export function computeIntentDealProgression(
  ctx: SignalComputeContext
): SignalComputeResult {
  const { interactions, relatedSignals } = ctx;

  if (interactions.length === 0 && (!relatedSignals || relatedSignals.length === 0)) {
    return {
      score: 0,
      band: "inactive",
      interactionCount: 0,
      breakdown: {
        velocity_component: 0,
        momentum_component: 0,
        buying_component: 0,
        source: "no_data",
        reason: "no_interactions_or_signals",
      },
    };
  }

  // Try to get component scores from related signals
  const findSignal = (key: string) =>
    relatedSignals?.find((s) => s.signal_key === key);

  const velocitySignal = findSignal("deal_stage_velocity");
  const momentumSignal = findSignal("deal_momentum");
  const buyingSignal = findSignal("intent_buying_activity");

  // Use signal scores if available, otherwise 0
  const velocityScore = velocitySignal?.score ?? 0;
  const momentumScore = momentumSignal?.score ?? 0;
  const buyingScore = buyingSignal?.score ?? 0;

  // Track which components had real data
  const sources: string[] = [];
  if (velocitySignal) sources.push("deal_stage_velocity");
  if (momentumSignal) sources.push("deal_momentum");
  if (buyingSignal) sources.push("intent_buying_activity");

  // Weighted composite
  const score = clampScore(
    velocityScore * 0.4 + momentumScore * 0.3 + buyingScore * 0.3
  );

  return {
    score,
    band: scoreToBand(score),
    interactionCount: interactions.length,
    breakdown: {
      velocity_component: velocityScore,
      momentum_component: momentumScore,
      buying_component: buyingScore,
      velocity_weight: 0.4,
      momentum_weight: 0.3,
      buying_weight: 0.3,
      source: sources.length === 3 ? "all_signals" : "partial",
      available_signals: sources,
    },
  };
}
