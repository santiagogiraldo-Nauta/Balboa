// ============================================================
// Toretto Phase 2 — Account Signal Computations
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
 * account_engagement_score
 *
 * Overall account health measured by interaction volume and recency.
 * Interactions in last 7d weighted 3x, 8-14d weighted 2x, 15-30d weighted 1x.
 * Normalized to 0-100 scale.
 *
 * Score mapping:
 *   0 weighted interactions → 0
 *   1-3  → 10-30
 *   4-8  → 30-50
 *   9-15 → 50-70
 *   16-25 → 70-90
 *   26+  → 90-100
 */
export function computeAccountEngagement(
  ctx: SignalComputeContext
): SignalComputeResult {
  const { interactions, now } = ctx;

  let weightedCount = 0;
  let raw7d = 0;
  let raw14d = 0;
  let raw30d = 0;

  for (const ix of interactions) {
    const daysAgo = daysBetween(new Date(ix.occurred_at), now);

    if (daysAgo <= 7) {
      weightedCount += 3;
      raw7d++;
    } else if (daysAgo <= 14) {
      weightedCount += 2;
      raw14d++;
    } else {
      weightedCount += 1;
      raw30d++;
    }
  }

  const score = clampScore(
    countToScore(weightedCount, [
      [0, 0],
      [3, 20],
      [8, 40],
      [15, 60],
      [25, 80],
      [40, 100],
    ])
  );

  return {
    score,
    band: scoreToBand(score),
    interactionCount: interactions.length,
    breakdown: {
      weighted_count: weightedCount,
      interactions_7d: raw7d,
      interactions_8_14d: raw14d,
      interactions_15_30d: raw30d,
      total_interactions: interactions.length,
    },
  };
}

// ─── account_channel_breadth ────────────────────────────────

/**
 * Multi-channel coverage within the lookback window.
 *
 * Scoring:
 *   1 channel  → 25
 *   2 channels → 50
 *   3 channels → 75
 *   4+ channels → 100
 *
 * Available channels: email, call, linkedin, meeting
 */
export function computeAccountChannelBreadth(
  ctx: SignalComputeContext
): SignalComputeResult {
  const { interactions } = ctx;

  if (interactions.length === 0) {
    return {
      score: 0,
      band: "inactive",
      interactionCount: 0,
      breakdown: {
        distinct_channels: 0,
        channels_used: [],
        total_interactions: 0,
      },
    };
  }

  const channels = new Set(interactions.map((ix) => ix.channel));
  const count = channels.size;

  let score: number;
  if (count >= 4) score = 100;
  else if (count === 3) score = 75;
  else if (count === 2) score = 50;
  else score = 25;

  return {
    score,
    band: scoreToBand(score),
    interactionCount: interactions.length,
    breakdown: {
      distinct_channels: count,
      channels_used: [...channels],
      total_interactions: interactions.length,
    },
  };
}

// ─── account_response_rate ──────────────────────────────────

/**
 * Buyer responsiveness: inbound / outbound ratio.
 *
 * Minimum 3 outbound interactions to activate.
 *
 * Scoring:
 *   0% inbound/outbound → 0
 *   10% → 30
 *   20% → 50
 *   50%+ → 100
 */
export function computeAccountResponseRate(
  ctx: SignalComputeContext
): SignalComputeResult {
  const { interactions } = ctx;

  const outbound = interactions.filter((ix) => ix.direction === "outbound");
  const inbound = interactions.filter((ix) => ix.direction === "inbound");

  // Not enough outbound to judge responsiveness
  if (outbound.length < 3) {
    return {
      score: 0,
      band: "inactive",
      interactionCount: interactions.length,
      breakdown: {
        outbound_count: outbound.length,
        inbound_count: inbound.length,
        response_rate: null,
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
      response_rate: Math.round(rate * 1000) / 10, // e.g. 33.3%
    },
  };
}

// ─── account_contact_coverage ───────────────────────────────

/**
 * Multi-threading depth: how many distinct contacts have interactions.
 *
 * Scoring:
 *   0 contacts → 0
 *   1 contact  → 20
 *   2 contacts → 40
 *   3 contacts → 60
 *   4 contacts → 80
 *   5+ contacts → 100
 */
export function computeAccountContactCoverage(
  ctx: SignalComputeContext
): SignalComputeResult {
  const { interactions } = ctx;

  if (interactions.length === 0) {
    return {
      score: 0,
      band: "inactive",
      interactionCount: 0,
      breakdown: {
        distinct_contacts: 0,
        total_interactions: 0,
      },
    };
  }

  // Count distinct contact_ids (skip null)
  const contactIds = new Set(
    interactions
      .map((ix) => ix.contact_id)
      .filter((id): id is string => id !== null)
  );
  const count = contactIds.size;

  let score: number;
  if (count >= 5) score = 100;
  else if (count === 4) score = 80;
  else if (count === 3) score = 60;
  else if (count === 2) score = 40;
  else if (count === 1) score = 20;
  else score = 0; // all interactions have null contact_id

  return {
    score,
    band: scoreToBand(score),
    interactionCount: interactions.length,
    breakdown: {
      distinct_contacts: count,
      contact_ids: [...contactIds],
      total_interactions: interactions.length,
    },
  };
}
