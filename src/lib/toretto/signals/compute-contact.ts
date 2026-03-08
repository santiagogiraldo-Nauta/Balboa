// ============================================================
// Toretto Phase 2 — Contact Signal Computations
// Deterministic, no AI. Reads from interactions only.
// ============================================================

import type { SignalComputeContext, SignalComputeResult } from "./types";
import { clampScore, scoreToBand, daysBetween, countToScore } from "./helpers";

/**
 * contact_engagement
 *
 * Contact-level engagement score.
 * Weighted composite of three factors:
 *   - Recency (×0.4):  How recently was the last interaction?
 *   - Frequency (×0.4): How many interactions in the lookback window?
 *   - Channel diversity (×0.2): How many distinct channels?
 *
 * Recency scoring:
 *   Last 1d → 100
 *   Last 3d → 80
 *   Last 7d → 60
 *   Last 14d → 35
 *   Last 30d → 15
 *   30d+ (or none) → 0
 *
 * Frequency scoring: countToScore mapped via thresholds.
 *
 * Channel diversity:
 *   1 channel → 25
 *   2 channels → 50
 *   3 channels → 75
 *   4+ channels → 100
 */
export function computeContactEngagement(
  ctx: SignalComputeContext
): SignalComputeResult {
  const { interactions, now } = ctx;

  // No interactions = inactive
  if (interactions.length === 0) {
    return {
      score: 0,
      band: "inactive",
      interactionCount: 0,
      breakdown: {
        recency_score: 0,
        frequency_score: 0,
        channel_score: 0,
        days_since_last: null,
        total_interactions: 0,
        distinct_channels: 0,
        reason: "no_interactions",
      },
    };
  }

  // ─── Factor 1: Recency ───────────────────────────────────────
  const lastInteraction = new Date(interactions[0].occurred_at); // sorted desc
  const daysSinceLast = daysBetween(lastInteraction, now);

  let recencyScore: number;
  if (daysSinceLast <= 1) recencyScore = 100;
  else if (daysSinceLast <= 3) recencyScore = 80;
  else if (daysSinceLast <= 7) recencyScore = 60;
  else if (daysSinceLast <= 14) recencyScore = 35;
  else if (daysSinceLast <= 30) recencyScore = 15;
  else recencyScore = 0;

  // ─── Factor 2: Frequency ─────────────────────────────────────
  const frequencyScore = clampScore(
    countToScore(interactions.length, [
      [0, 0],
      [1, 15],
      [3, 35],
      [6, 55],
      [10, 75],
      [20, 100],
    ])
  );

  // ─── Factor 3: Channel diversity ─────────────────────────────
  const channels = new Set(interactions.map((ix) => ix.channel));
  const channelCount = channels.size;
  let channelScore: number;
  if (channelCount >= 4) channelScore = 100;
  else if (channelCount === 3) channelScore = 75;
  else if (channelCount === 2) channelScore = 50;
  else channelScore = 25;

  // ─── Weighted composite ──────────────────────────────────────
  const score = clampScore(
    recencyScore * 0.4 + frequencyScore * 0.4 + channelScore * 0.2
  );

  return {
    score,
    band: scoreToBand(score),
    interactionCount: interactions.length,
    breakdown: {
      recency_score: Math.round(recencyScore),
      frequency_score: Math.round(frequencyScore),
      channel_score: Math.round(channelScore),
      days_since_last: Math.round(daysSinceLast * 10) / 10,
      total_interactions: interactions.length,
      distinct_channels: channelCount,
      channels_used: [...channels],
    },
  };
}

// ─── contact_sentiment_trend ────────────────────────────────

/**
 * contact_sentiment_trend
 *
 * Sentiment trajectory for a specific contact.
 * Maps average sentiment to 0-100 scale:
 *   positive = +1, neutral = 0, negative = -1
 *   avg mapped: -1 → 0, 0 → 50, +1 → 100
 *
 * Trend modifier: compares first half vs second half of interactions.
 *   Improving trend → +10
 *   Declining trend → -10
 *
 * Minimum 3 interactions with sentiment to activate.
 */
export function computeContactSentimentTrend(
  ctx: SignalComputeContext
): SignalComputeResult {
  const { interactions } = ctx;

  // Filter to interactions with sentiment
  const withSentiment = interactions.filter((ix) => ix.sentiment);

  if (withSentiment.length < 3) {
    return {
      score: 50, // neutral default
      band: "medium",
      interactionCount: interactions.length,
      breakdown: {
        sentiment_count: withSentiment.length,
        total_interactions: interactions.length,
        average_sentiment: null,
        trend: null,
        reason: "insufficient_sentiment_data",
      },
    };
  }

  // Calculate sentiment values
  const sentimentValue = (s: string): number => {
    if (s === "positive") return 1;
    if (s === "negative") return -1;
    return 0; // neutral
  };

  const values = withSentiment.map((ix) => sentimentValue(ix.sentiment!));
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  // Map -1..+1 to 0..100
  let baseScore = Math.round((avg + 1) * 50);

  // Trend modifier: compare first half (older) vs second half (newer)
  // interactions are sorted desc, so first half = newer, second half = older
  const mid = Math.floor(values.length / 2);
  const newerValues = values.slice(0, mid);
  const olderValues = values.slice(mid);

  let trend = "stable";
  let trendModifier = 0;

  if (newerValues.length > 0 && olderValues.length > 0) {
    const newerAvg = newerValues.reduce((a, b) => a + b, 0) / newerValues.length;
    const olderAvg = olderValues.reduce((a, b) => a + b, 0) / olderValues.length;
    const diff = newerAvg - olderAvg;

    if (diff > 0.3) {
      trend = "improving";
      trendModifier = 10;
    } else if (diff < -0.3) {
      trend = "declining";
      trendModifier = -10;
    }
  }

  const score = clampScore(baseScore + trendModifier);

  return {
    score,
    band: scoreToBand(score),
    interactionCount: interactions.length,
    breakdown: {
      sentiment_count: withSentiment.length,
      positive_count: values.filter((v) => v === 1).length,
      neutral_count: values.filter((v) => v === 0).length,
      negative_count: values.filter((v) => v === -1).length,
      average_sentiment: Math.round(avg * 100) / 100,
      trend,
      trend_modifier: trendModifier,
      total_interactions: interactions.length,
    },
  };
}

// ─── contact_responsiveness ─────────────────────────────────

/**
 * contact_responsiveness
 *
 * Reply rate for a single contact.
 * Measures inbound/outbound ratio — how responsive is this person?
 *
 * Minimum 2 outbound interactions to activate.
 *
 * Scoring (same curve as account_response_rate):
 *   0% → 0
 *   10% → 30
 *   20% → 50
 *   50%+ → 100
 */
export function computeContactResponsiveness(
  ctx: SignalComputeContext
): SignalComputeResult {
  const { interactions } = ctx;

  const outbound = interactions.filter((ix) => ix.direction === "outbound");
  const inbound = interactions.filter((ix) => ix.direction === "inbound");

  // Not enough outbound to judge responsiveness
  if (outbound.length < 2) {
    return {
      score: 0,
      band: "inactive",
      interactionCount: interactions.length,
      breakdown: {
        outbound_count: outbound.length,
        inbound_count: inbound.length,
        response_rate: null,
        total_interactions: interactions.length,
        reason: "insufficient_outbound",
      },
    };
  }

  const rate = inbound.length / outbound.length;

  const score = clampScore(
    countToScore(Math.round(rate * 100), [
      [0, 0],
      [5, 15],
      [10, 30],
      [20, 50],
      [35, 75],
      [50, 100],
    ])
  );

  return {
    score,
    band: scoreToBand(score),
    interactionCount: interactions.length,
    breakdown: {
      outbound_count: outbound.length,
      inbound_count: inbound.length,
      response_rate: Math.round(rate * 1000) / 10,
      total_interactions: interactions.length,
    },
  };
}
