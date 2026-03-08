// ============================================================
// Toretto Phase 2 — Deal Signal Computations
// Deterministic, no AI. Reads from interactions only.
// ============================================================

import type { SignalComputeContext, SignalComputeResult } from "./types";
import {
  clampScore,
  scoreToBand,
  daysBetween,
  countToScore,
} from "./helpers";

/**
 * deal_momentum
 *
 * Is this deal accelerating or stalling?
 * Compares interaction count in last 7d vs previous 7d (days 8-14).
 *
 * Score mapping:
 *   0 interactions in last 7d → 0
 *   ratio 0.5 → 30 (decelerating)
 *   ratio 1.0 → 50 (steady)
 *   ratio 1.5 → 70 (accelerating)
 *   ratio 2.0+ → 90 (surging)
 *
 * Minimum 2 total interactions to activate.
 */
export function computeDealMomentum(
  ctx: SignalComputeContext
): SignalComputeResult {
  const { interactions, now } = ctx;

  let recent = 0; // last 7d
  let prior = 0;  // 8-14d

  for (const ix of interactions) {
    const daysAgo = daysBetween(new Date(ix.occurred_at), now);
    if (daysAgo <= 7) recent++;
    else if (daysAgo <= 14) prior++;
  }

  const total = recent + prior;

  // Not enough data
  if (total < 2) {
    return {
      score: 0,
      band: "inactive",
      interactionCount: interactions.length,
      breakdown: {
        interactions_0_7d: recent,
        interactions_8_14d: prior,
        total,
        ratio: null,
        reason: "insufficient_data",
      },
    };
  }

  // No recent activity
  if (recent === 0) {
    return {
      score: 0,
      band: "inactive",
      interactionCount: interactions.length,
      breakdown: {
        interactions_0_7d: 0,
        interactions_8_14d: prior,
        total,
        ratio: 0,
        reason: "no_recent_activity",
      },
    };
  }

  // Compute ratio (avoid division by zero: if prior=0 but recent>0, treat as surge)
  const ratio = prior === 0 ? 3.0 : recent / prior;

  let score: number;
  if (ratio <= 0.5) score = 20;
  else if (ratio <= 0.75) score = 30;
  else if (ratio <= 1.0) score = 45;
  else if (ratio <= 1.25) score = 55;
  else if (ratio <= 1.5) score = 65;
  else if (ratio <= 2.0) score = 80;
  else score = 95;

  score = clampScore(score);

  return {
    score,
    band: scoreToBand(score),
    interactionCount: interactions.length,
    breakdown: {
      interactions_0_7d: recent,
      interactions_8_14d: prior,
      total,
      ratio: Math.round(ratio * 100) / 100,
      direction:
        ratio > 1.2
          ? "accelerating"
          : ratio < 0.8
            ? "decelerating"
            : "steady",
    },
  };
}

/**
 * deal_risk
 *
 * Composite risk score. High score = high risk of deal going dark.
 *
 * Three factors (weighted):
 *   1. Days since last interaction (×0.5) — silence is the #1 risk signal
 *   2. Negative sentiment ratio (×0.3) — bad conversations
 *   3. Bounce rate (×0.2) — can't even reach them
 *
 * Score mapping:
 *   0-30  → low risk
 *   31-60 → moderate risk
 *   61-80 → high risk
 *   81-100 → critical risk
 */
export function computeDealRisk(
  ctx: SignalComputeContext
): SignalComputeResult {
  const { interactions, now } = ctx;

  // No interactions at all = max risk if the deal exists
  if (interactions.length === 0) {
    return {
      score: 100,
      band: "critical",
      interactionCount: 0,
      breakdown: {
        silence_factor: 100,
        sentiment_factor: 0,
        bounce_factor: 0,
        days_since_last: null,
        reason: "no_interactions",
      },
    };
  }

  // Factor 1: Days since last interaction
  const lastInteraction = new Date(interactions[0].occurred_at); // sorted desc
  const daysSilent = daysBetween(lastInteraction, now);
  let silenceFactor: number;
  if (daysSilent <= 1) silenceFactor = 0;
  else if (daysSilent <= 3) silenceFactor = 15;
  else if (daysSilent <= 7) silenceFactor = 35;
  else if (daysSilent <= 14) silenceFactor = 60;
  else if (daysSilent <= 21) silenceFactor = 80;
  else silenceFactor = 100;

  // Factor 2: Negative sentiment ratio
  const withSentiment = interactions.filter((ix) => ix.sentiment);
  let sentimentFactor = 0;
  if (withSentiment.length >= 2) {
    const negativeCount = withSentiment.filter(
      (ix) => ix.sentiment === "negative"
    ).length;
    sentimentFactor = clampScore((negativeCount / withSentiment.length) * 100);
  }

  // Factor 3: Bounce rate
  const outbound = interactions.filter((ix) => ix.direction === "outbound");
  let bounceFactor = 0;
  if (outbound.length >= 2) {
    const bounced = interactions.filter(
      (ix) => ix.interaction_type === "bounced"
    ).length;
    bounceFactor = clampScore((bounced / outbound.length) * 100);
  }

  // Weighted composite
  const score = clampScore(
    silenceFactor * 0.5 + sentimentFactor * 0.3 + bounceFactor * 0.2
  );

  return {
    score,
    band: scoreToBand(score),
    interactionCount: interactions.length,
    breakdown: {
      silence_factor: Math.round(silenceFactor),
      sentiment_factor: Math.round(sentimentFactor),
      bounce_factor: Math.round(bounceFactor),
      days_since_last: Math.round(daysSilent * 10) / 10,
      negative_count: withSentiment.filter((ix) => ix.sentiment === "negative")
        .length,
      sentiment_total: withSentiment.length,
      outbound_count: outbound.length,
      bounced_count: interactions.filter(
        (ix) => ix.interaction_type === "bounced"
      ).length,
    },
  };
}

// ─── deal_stage_velocity ──────────────────────────────────

/**
 * deal_stage_velocity
 *
 * Pipeline progression pace — how recently did the deal stage change?
 * Looks for interactions with interaction_type "deal_stage_change".
 *
 * Score mapping (recency of last stage change):
 *   Last 3d  → 100 (active progression)
 *   Last 7d  → 80
 *   Last 14d → 50
 *   Last 30d → 30
 *   30d+     → 10 (stagnant)
 *   No stage changes → 0 (no pipeline activity)
 */
export function computeDealStageVelocity(
  ctx: SignalComputeContext
): SignalComputeResult {
  const { interactions, now } = ctx;

  // Filter to stage change interactions only
  const stageChanges = interactions.filter(
    (ix) => ix.interaction_type === "deal_stage_change"
  );

  if (stageChanges.length === 0) {
    return {
      score: 0,
      band: "inactive",
      interactionCount: interactions.length,
      breakdown: {
        stage_changes: 0,
        days_since_last_change: null,
        total_interactions: interactions.length,
        reason: "no_stage_changes",
      },
    };
  }

  // interactions are sorted desc, so first stage change is most recent
  const lastChange = new Date(stageChanges[0].occurred_at);
  const daysSinceChange = daysBetween(lastChange, now);

  let score: number;
  if (daysSinceChange <= 3) score = 100;
  else if (daysSinceChange <= 7) score = 80;
  else if (daysSinceChange <= 14) score = 50;
  else if (daysSinceChange <= 30) score = 30;
  else score = 10;

  score = clampScore(score);

  return {
    score,
    band: scoreToBand(score),
    interactionCount: interactions.length,
    breakdown: {
      stage_changes: stageChanges.length,
      days_since_last_change: Math.round(daysSinceChange * 10) / 10,
      total_interactions: interactions.length,
    },
  };
}

// ─── deal_activity_volume ─────────────────────────────────

/**
 * deal_activity_volume
 *
 * Raw activity level for a deal within the lookback window.
 * Simple interaction count mapped to 0-100 score.
 *
 * Score mapping:
 *   0       → 0
 *   1-2     → 20
 *   3-5     → 40
 *   6-10    → 60
 *   11-20   → 80
 *   21+     → 100
 */
export function computeDealActivityVolume(
  ctx: SignalComputeContext
): SignalComputeResult {
  const { interactions } = ctx;

  const count = interactions.length;

  if (count === 0) {
    return {
      score: 0,
      band: "inactive",
      interactionCount: 0,
      breakdown: {
        interaction_count: 0,
        reason: "no_interactions",
      },
    };
  }

  const score = clampScore(
    countToScore(count, [
      [0, 0],
      [1, 15],
      [2, 25],
      [5, 45],
      [10, 65],
      [20, 85],
      [30, 100],
    ])
  );

  return {
    score,
    band: scoreToBand(score),
    interactionCount: count,
    breakdown: {
      interaction_count: count,
    },
  };
}
