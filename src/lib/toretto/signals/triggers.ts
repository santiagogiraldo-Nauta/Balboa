// ============================================================
// Toretto Phase 2 — Signal Trigger Evaluation
// Data-driven: reads trigger rules from toretto.signal_triggers,
// evaluates threshold crossings, creates fire_actions.
//
// Replaces hardcoded SIGNAL_TRIGGERS from fire/signal-triggers.ts
// for Toretto-computed signals.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SignalRow, SignalTriggerRow } from "./types";
import { insertFireAction } from "../../fire/db-fire";
import type { FireActionType, FireChannel } from "../../fire/types";

// ─── Trigger Evaluation ─────────────────────────────────────

export interface TriggerEvaluationResult {
  triggersEvaluated: number;
  actionsFired: number;
  errors: string[];
}

/**
 * Evaluate all active triggers against a freshly computed signal.
 *
 * Called after every signal upsert. Compares the new score against
 * the previous_score to detect threshold crossings and band transitions.
 *
 * Creates fire_actions for any matching triggers.
 *
 * @param supabase  — service-role client
 * @param signal    — the signal row AFTER upsert (has score + previous_score)
 * @param userId    — owner of the entity (for fire_action.user_id)
 */
export async function evaluateTriggersForSignal(
  supabase: SupabaseClient,
  signal: SignalRow,
  userId: string
): Promise<TriggerEvaluationResult> {
  const result: TriggerEvaluationResult = {
    triggersEvaluated: 0,
    actionsFired: 0,
    errors: [],
  };

  // 1. Fetch active triggers for this signal key
  const triggers = await getActiveTriggersForKey(supabase, signal.signal_key);
  if (triggers.length === 0) return result;

  result.triggersEvaluated = triggers.length;

  const prevScore = signal.previous_score;
  const newScore = signal.score;
  const newBand = signal.score_band;

  for (const trigger of triggers) {
    try {
      const shouldFire = evaluateCondition(trigger, newScore, prevScore, newBand);

      if (shouldFire) {
        // Calculate scheduled time if delay is configured
        const scheduledFor = trigger.delay_minutes > 0
          ? new Date(Date.now() + trigger.delay_minutes * 60 * 1000).toISOString()
          : null;

        const action = await insertFireAction(supabase, {
          user_id: userId,
          lead_id: null, // signal triggers are entity-level, not lead-level
          enrollment_id: null,
          trigger_event_id: signal.id, // link back to the signal that triggered this
          trigger_rule_id: trigger.id,
          trigger_type: "signal_trigger",
          action_type: trigger.action_type as FireActionType,
          channel: (trigger.channel as FireChannel) || null,
          subject: null,
          body: null,
          template_key: trigger.template_key,
          status: "pending",
          scheduled_for: scheduledFor,
          reply_classification: null,
          reply_confidence: null,
          metadata: {
            signal_key: signal.signal_key,
            entity_type: signal.entity_type,
            entity_id: signal.entity_id,
            signal_score: newScore,
            previous_score: prevScore,
            signal_band: newBand,
            trigger_condition: trigger.condition,
            trigger_threshold: trigger.threshold,
            trigger_priority: trigger.priority,
            ...(trigger.metadata || {}),
          },
        });

        if (action) {
          result.actionsFired++;
          console.log(
            `[signal-triggers] FIRED: ${signal.signal_key} ` +
            `${trigger.condition} ${trigger.threshold ?? trigger.target_band} → ` +
            `${trigger.action_type} (${trigger.channel || "n/a"}) ` +
            `for ${signal.entity_type}:${signal.entity_id} ` +
            `[score: ${prevScore ?? "null"} → ${newScore}]`
          );
        } else {
          result.errors.push(
            `Failed to create fire_action for trigger ${trigger.id}`
          );
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Trigger ${trigger.id}: ${msg}`);
    }
  }

  return result;
}

// ─── Condition Evaluation ───────────────────────────────────

/**
 * Evaluate whether a trigger condition is met.
 *
 * Conditions:
 *   crosses_above:  previous < threshold AND current >= threshold
 *   crosses_below:  previous > threshold AND current <= threshold
 *   stays_above:    current >= threshold (every computation)
 *   stays_below:    current <= threshold (every computation)
 *   enters_band:    previous band != target AND current band == target
 *   exits_band:     previous band == target AND current band != target
 *
 * For crosses_* conditions: if previous_score is null (first computation),
 * we treat it as a crossing if the threshold condition is met.
 */
function evaluateCondition(
  trigger: SignalTriggerRow,
  newScore: number,
  prevScore: number | null,
  newBand: string
): boolean {
  const threshold = trigger.threshold;
  const targetBand = trigger.target_band;

  switch (trigger.condition) {
    case "crosses_above": {
      if (threshold === null) return false;
      // First computation: treat as crossing if above threshold
      if (prevScore === null) return newScore >= threshold;
      return prevScore < threshold && newScore >= threshold;
    }

    case "crosses_below": {
      if (threshold === null) return false;
      // First computation: treat as crossing if below threshold
      if (prevScore === null) return newScore <= threshold;
      return prevScore > threshold && newScore <= threshold;
    }

    case "stays_above": {
      if (threshold === null) return false;
      return newScore >= threshold;
    }

    case "stays_below": {
      if (threshold === null) return false;
      return newScore <= threshold;
    }

    case "enters_band": {
      if (!targetBand) return false;
      // Need previous band — derive from previous score
      if (prevScore === null) return newBand === targetBand;
      const prevBand = scoreToBandLocal(prevScore);
      return prevBand !== targetBand && newBand === targetBand;
    }

    case "exits_band": {
      if (!targetBand) return false;
      if (prevScore === null) return false; // can't exit if never entered
      const prevBand = scoreToBandLocal(prevScore);
      return prevBand === targetBand && newBand !== targetBand;
    }

    default:
      return false;
  }
}

/**
 * Local band derivation (mirrors helpers.ts scoreToBand).
 * Duplicated here to avoid circular dependency.
 */
function scoreToBandLocal(score: number): string {
  if (score >= 81) return "critical";
  if (score >= 61) return "high";
  if (score >= 31) return "medium";
  if (score >= 11) return "low";
  return "inactive";
}

// ─── DB Queries ─────────────────────────────────────────────

/**
 * Fetch active trigger rules for a specific signal key.
 */
async function getActiveTriggersForKey(
  supabase: SupabaseClient,
  signalKey: string
): Promise<SignalTriggerRow[]> {
  const { data, error } = await supabase
    .schema("toretto")
    .from("signal_triggers")
    .select("*")
    .eq("signal_key", signalKey)
    .eq("is_active", true);

  if (error) {
    console.error("[signal-triggers] Error fetching triggers:", error.message);
    return [];
  }
  return (data || []) as SignalTriggerRow[];
}

// ─── Batch Trigger Evaluation ───────────────────────────────

/**
 * Evaluate triggers for multiple signals at once.
 * Used after a batch computation run.
 */
export async function evaluateTriggersForBatch(
  supabase: SupabaseClient,
  signals: SignalRow[],
  userId: string
): Promise<TriggerEvaluationResult> {
  const batchResult: TriggerEvaluationResult = {
    triggersEvaluated: 0,
    actionsFired: 0,
    errors: [],
  };

  for (const signal of signals) {
    const result = await evaluateTriggersForSignal(supabase, signal, userId);
    batchResult.triggersEvaluated += result.triggersEvaluated;
    batchResult.actionsFired += result.actionsFired;
    batchResult.errors.push(...result.errors);
  }

  if (batchResult.actionsFired > 0) {
    console.log(
      `[signal-triggers] Batch: ${batchResult.triggersEvaluated} triggers evaluated, ` +
      `${batchResult.actionsFired} actions fired, ${batchResult.errors.length} errors`
    );
  }

  return batchResult;
}
