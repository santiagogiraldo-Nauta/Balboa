// ============================================================
// Toretto Phase 2 — Signal Computation Engine
// Orchestrates signal computation for entities.
// Deterministic, no AI. Reads interactions, writes signals.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SignalDefinition,
  SignalComputeContext,
  SignalComputeResult,
  SignalBatchResult,
  SignalEntityType,
  SignalKey,
} from "./types";
import {
  upsertSignal,
  appendSignalLog,
  getSignal,
  getSignalsForEntity,
  getInteractionsForEntity,
  getActiveAccountIds,
  getActiveDealIds,
  getActiveContactIds,
} from "./db-signals";
import {
  computeAccountEngagement,
  computeAccountChannelBreadth,
  computeAccountResponseRate,
  computeAccountContactCoverage,
} from "./compute-account";
import {
  computeDealMomentum,
  computeDealRisk,
  computeDealStageVelocity,
  computeDealActivityVolume,
} from "./compute-deal";
import {
  computeContactEngagement,
  computeContactSentimentTrend,
  computeContactResponsiveness,
} from "./compute-contact";
import {
  computeIntentBuyingActivity,
  computeIntentSilenceRisk,
  computeIntentDealProgression,
} from "./compute-intent";
import { evaluateTriggersForSignal } from "./triggers";

// ─── Signal Registry ────────────────────────────────────────
// 14 signals across 4 categories.
// Base signals compute first, composite signals (isComposite=true)
// compute in a second pass with relatedSignals populated.

const SIGNAL_REGISTRY: SignalDefinition[] = [
  // ── Account signals (4) ──────────────────────────────────
  {
    key: "account_engagement_score",
    category: "account",
    entityType: "account",
    lookbackDays: 30,
    isComposite: false,
    compute: computeAccountEngagement,
  },
  {
    key: "account_channel_breadth",
    category: "account",
    entityType: "account",
    lookbackDays: 30,
    isComposite: false,
    compute: computeAccountChannelBreadth,
  },
  {
    key: "account_response_rate",
    category: "account",
    entityType: "account",
    lookbackDays: 30,
    isComposite: false,
    compute: computeAccountResponseRate,
  },
  {
    key: "account_contact_coverage",
    category: "account",
    entityType: "account",
    lookbackDays: 90,
    isComposite: false,
    compute: computeAccountContactCoverage,
  },
  // ── Deal signals (4) ─────────────────────────────────────
  {
    key: "deal_momentum",
    category: "deal",
    entityType: "deal",
    lookbackDays: 14,
    isComposite: false,
    compute: computeDealMomentum,
  },
  {
    key: "deal_stage_velocity",
    category: "deal",
    entityType: "deal",
    lookbackDays: 90,
    isComposite: false,
    compute: computeDealStageVelocity,
  },
  {
    key: "deal_risk",
    category: "deal",
    entityType: "deal",
    lookbackDays: 30,
    isComposite: false,
    compute: computeDealRisk,
  },
  {
    key: "deal_activity_volume",
    category: "deal",
    entityType: "deal",
    lookbackDays: 30,
    isComposite: false,
    compute: computeDealActivityVolume,
  },
  // ── Relationship signals (3) ─────────────────────────────
  {
    key: "contact_engagement",
    category: "relationship",
    entityType: "contact",
    lookbackDays: 30,
    isComposite: false,
    compute: computeContactEngagement,
  },
  {
    key: "contact_sentiment_trend",
    category: "relationship",
    entityType: "contact",
    lookbackDays: 14,
    isComposite: false,
    compute: computeContactSentimentTrend,
  },
  {
    key: "contact_responsiveness",
    category: "relationship",
    entityType: "contact",
    lookbackDays: 30,
    isComposite: false,
    compute: computeContactResponsiveness,
  },
  // ── Intent signals (3) ───────────────────────────────────
  {
    key: "intent_buying_activity",
    category: "intent",
    entityType: "account",
    lookbackDays: 14,
    isComposite: false,
    compute: computeIntentBuyingActivity,
  },
  {
    key: "intent_silence_risk",
    category: "intent",
    entityType: "account",
    lookbackDays: 90,
    isComposite: false,
    compute: computeIntentSilenceRisk,
  },
  {
    key: "intent_deal_progression",
    category: "intent",
    entityType: "deal",
    lookbackDays: 30,
    isComposite: true, // computed after base signals
    compute: computeIntentDealProgression,
  },
];

// Index for quick lookup
const SIGNAL_BY_KEY = new Map<SignalKey, SignalDefinition>(
  SIGNAL_REGISTRY.map((d) => [d.key, d])
);

// ─── Single Entity Computation ──────────────────────────────

/**
 * Compute all applicable signals for a single entity.
 * After each signal is upserted, evaluates data-driven triggers
 * from toretto.signal_triggers and creates fire_actions for matches.
 *
 * @param userId — owner of the entity (passed to fire_actions)
 */
export async function computeSignalsForEntity(
  supabase: SupabaseClient,
  entityType: SignalEntityType,
  entityId: string,
  signalKeys?: SignalKey[],
  userId?: string
): Promise<{
  computed: number;
  updated: number;
  created: number;
  triggersEvaluated: number;
  actionsFired: number;
  errors: string[];
}> {
  const result = {
    computed: 0,
    updated: 0,
    created: 0,
    triggersEvaluated: 0,
    actionsFired: 0,
    errors: [] as string[],
  };

  // Separate base signals from composite signals
  const baseSignals = SIGNAL_REGISTRY.filter((def) => {
    if (def.entityType !== entityType) return false;
    if (signalKeys && !signalKeys.includes(def.key)) return false;
    if (def.isComposite) return false;
    return true;
  });

  const compositeSignals = SIGNAL_REGISTRY.filter((def) => {
    if (def.entityType !== entityType) return false;
    if (signalKeys && !signalKeys.includes(def.key)) return false;
    if (!def.isComposite) return false;
    return true;
  });

  if (baseSignals.length === 0 && compositeSignals.length === 0) return result;

  const now = new Date();

  // ─── Pass 1: Base signals ──────────────────────────────────
  for (const def of baseSignals) {
    await computeAndUpsertSignal(supabase, def, entityType, entityId, now, result, userId);
  }

  // ─── Pass 2: Composite signals (after base) ───────────────
  if (compositeSignals.length > 0) {
    // Fetch all current signals for this entity (includes freshly computed ones)
    const relatedSignals = await getSignalsForEntity(supabase, entityType, entityId);

    for (const def of compositeSignals) {
      await computeAndUpsertSignal(
        supabase, def, entityType, entityId, now, result, userId, relatedSignals
      );
    }
  }

  return result;
}

// ─── Signal Compute + Upsert Helper ─────────────────────────

/**
 * Internal helper: compute a single signal, upsert it, log it,
 * and evaluate triggers. Used by both base and composite passes.
 */
async function computeAndUpsertSignal(
  supabase: SupabaseClient,
  def: SignalDefinition,
  entityType: SignalEntityType,
  entityId: string,
  now: Date,
  result: {
    computed: number;
    updated: number;
    created: number;
    triggersEvaluated: number;
    actionsFired: number;
    errors: string[];
  },
  userId?: string,
  relatedSignals?: import("./types").SignalRow[]
): Promise<void> {
  const startMs = Date.now();

  try {
    // 1. Fetch interactions within lookback window
    const interactions = await getInteractionsForEntity(
      supabase,
      entityType,
      entityId,
      def.lookbackDays
    );

    // 2. Fetch existing signal for previous_score
    const existingSignal = await getSignal(
      supabase,
      def.key,
      entityType,
      entityId
    );

    // 3. Build context
    const ctx: SignalComputeContext = {
      entityId,
      entityType,
      interactions,
      existingSignal,
      relatedSignals,
      now,
    };

    // 4. Compute signal
    const computeResult: SignalComputeResult = def.compute(ctx);

    const computationMs = Date.now() - startMs;
    const computedAt = now.toISOString();

    // 5. Upsert into toretto.signals
    const upserted = await upsertSignal(supabase, {
      signal_key: def.key,
      entity_type: entityType,
      entity_id: entityId,
      score: computeResult.score,
      previous_score: existingSignal?.score ?? null,
      score_band: computeResult.band,
      computed_at: computedAt,
      lookback_days: def.lookbackDays,
      interaction_count: computeResult.interactionCount,
      computation_ms: computationMs,
      breakdown: computeResult.breakdown,
    });

    if (upserted) {
      result.computed++;
      if (existingSignal) {
        result.updated++;
      } else {
        result.created++;
      }

      // 6. Append to signal_log (always)
      await appendSignalLog(supabase, {
        signal_key: def.key,
        entity_type: entityType,
        entity_id: entityId,
        score: computeResult.score,
        score_band: computeResult.band,
        breakdown: computeResult.breakdown,
        interaction_count: computeResult.interactionCount,
        computed_at: computedAt,
      });

      // 7. Evaluate signal triggers → fire_actions
      if (userId) {
        try {
          const triggerResult = await evaluateTriggersForSignal(
            supabase,
            upserted,
            userId
          );
          result.triggersEvaluated += triggerResult.triggersEvaluated;
          result.actionsFired += triggerResult.actionsFired;
          if (triggerResult.errors.length > 0) {
            result.errors.push(...triggerResult.errors);
          }
        } catch (triggerErr) {
          const msg = triggerErr instanceof Error ? triggerErr.message : String(triggerErr);
          result.errors.push(`trigger-eval/${def.key}/${entityId}: ${msg}`);
        }
      }
    } else {
      result.errors.push(`Failed to upsert ${def.key} for ${entityId}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`${def.key}/${entityId}: ${msg}`);
    console.error(`[signal-engine] Error computing ${def.key} for ${entityId}:`, msg);
  }
}

// ─── Batch Computation ──────────────────────────────────────

export interface ComputeBatchOptions {
  /** Compute only for specific entity types */
  entityTypes?: SignalEntityType[];
  /** Compute only specific signals */
  signalKeys?: SignalKey[];
  /** Max entities to process per entity type */
  batchSize?: number;
  /** Lookback window for entity discovery */
  discoveryLookbackDays?: number;
  /** User ID for fire_action ownership (trigger evaluation) */
  userId?: string;
}

/**
 * Compute signals for all active entities (or a subset).
 * "Active" = has interactions within the discovery lookback window.
 *
 * Flow:
 *   1. Discover active entity IDs by type
 *   2. For each entity, compute all applicable signals
 *   3. Return batch summary
 */
export async function computeSignalsBatch(
  supabase: SupabaseClient,
  options: ComputeBatchOptions = {}
): Promise<SignalBatchResult> {
  const startMs = Date.now();
  const batchSize = options.batchSize ?? 50;
  const discoveryLookback = options.discoveryLookbackDays ?? 90;
  const entityTypes = options.entityTypes ?? ["account", "deal", "contact"];
  const signalKeys = options.signalKeys;
  const userId = options.userId;

  const batchResult: SignalBatchResult = {
    signalsComputed: 0,
    signalsUpdated: 0,
    signalsCreated: 0,
    triggersEvaluated: 0,
    actionsFired: 0,
    errors: [],
    durationMs: 0,
  };

  // Discover active entities per type
  const entityMap: Record<SignalEntityType, string[]> = {
    account: [],
    deal: [],
    contact: [],
  };

  if (entityTypes.includes("account")) {
    entityMap.account = await getActiveAccountIds(supabase, discoveryLookback, batchSize);
  }
  if (entityTypes.includes("deal")) {
    entityMap.deal = await getActiveDealIds(supabase, discoveryLookback, batchSize);
  }
  if (entityTypes.includes("contact")) {
    entityMap.contact = await getActiveContactIds(supabase, discoveryLookback, batchSize);
  }

  console.log(
    `[signal-engine] Batch starting — accounts: ${entityMap.account.length}, deals: ${entityMap.deal.length}, contacts: ${entityMap.contact.length}`
  );

  // Compute signals for each entity
  for (const entityType of entityTypes) {
    const ids = entityMap[entityType];

    for (const entityId of ids) {
      const entityResult = await computeSignalsForEntity(
        supabase,
        entityType,
        entityId,
        signalKeys,
        userId
      );

      batchResult.signalsComputed += entityResult.computed;
      batchResult.signalsUpdated += entityResult.updated;
      batchResult.signalsCreated += entityResult.created;
      batchResult.triggersEvaluated += entityResult.triggersEvaluated;
      batchResult.actionsFired += entityResult.actionsFired;
      batchResult.errors.push(...entityResult.errors);
    }
  }

  batchResult.durationMs = Date.now() - startMs;

  console.log(
    `[signal-engine] Batch complete — computed: ${batchResult.signalsComputed}, created: ${batchResult.signalsCreated}, updated: ${batchResult.signalsUpdated}, triggers: ${batchResult.triggersEvaluated}→${batchResult.actionsFired} fired, errors: ${batchResult.errors.length}, duration: ${batchResult.durationMs}ms`
  );

  return batchResult;
}

/**
 * Compute signals for a single entity by ID.
 * Convenience wrapper around computeSignalsForEntity.
 */
export async function computeSignalsForSingleEntity(
  supabase: SupabaseClient,
  entityType: SignalEntityType,
  entityId: string,
  userId?: string
): Promise<SignalBatchResult> {
  const startMs = Date.now();

  const result = await computeSignalsForEntity(
    supabase,
    entityType,
    entityId,
    undefined,
    userId
  );

  return {
    signalsComputed: result.computed,
    signalsUpdated: result.updated,
    signalsCreated: result.created,
    triggersEvaluated: result.triggersEvaluated,
    actionsFired: result.actionsFired,
    errors: result.errors,
    durationMs: Date.now() - startMs,
  };
}

// ─── Exports for external use ───────────────────────────────

export { SIGNAL_REGISTRY, SIGNAL_BY_KEY };
