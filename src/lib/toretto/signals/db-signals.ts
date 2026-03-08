// ============================================================
// Toretto Phase 2 — Signal Database Access Layer
// Reads/writes to toretto.signals and toretto.signal_log.
// Follows same pattern as ../db-toretto.ts
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";
import type {
  SignalRow,
  SignalLogRow,
  SignalInsert,
  SignalLogInsert,
  SignalKey,
  SignalEntityType,
} from "./types";

// Schema-qualified client helper
function t(supabase: SupabaseClient) {
  return supabase.schema("toretto");
}

// ─── Signals (upsert / read) ─────────────────────────────────

/**
 * Upsert a signal. If it already exists for (signal_key, entity_type, entity_id),
 * the existing row is updated and previous_score is preserved.
 */
export async function upsertSignal(
  supabase: SupabaseClient,
  signal: SignalInsert
): Promise<SignalRow | null> {
  const { data, error } = await t(supabase)
    .from("signals")
    .upsert(
      {
        signal_key: signal.signal_key,
        entity_type: signal.entity_type,
        entity_id: signal.entity_id,
        score: signal.score,
        previous_score: signal.previous_score,
        score_band: signal.score_band,
        computed_at: signal.computed_at,
        lookback_days: signal.lookback_days,
        interaction_count: signal.interaction_count,
        computation_ms: signal.computation_ms,
        breakdown: signal.breakdown,
      },
      { onConflict: "signal_key,entity_type,entity_id" }
    )
    .select()
    .single();

  if (error) {
    console.error(`[db-signals] upsert error for ${signal.signal_key}:`, error.message);
    return null;
  }
  return data as SignalRow;
}

/**
 * Append a row to the signal_log (never updates, always inserts).
 */
export async function appendSignalLog(
  supabase: SupabaseClient,
  entry: SignalLogInsert
): Promise<void> {
  const { error } = await t(supabase)
    .from("signal_log")
    .insert([{
      signal_key: entry.signal_key,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      score: entry.score,
      score_band: entry.score_band,
      breakdown: entry.breakdown,
      interaction_count: entry.interaction_count,
      computed_at: entry.computed_at,
    }]);

  if (error) {
    console.error(`[db-signals] signal_log insert error:`, error.message);
  }
}

/**
 * Get all signals for a specific entity.
 */
export async function getSignalsForEntity(
  supabase: SupabaseClient,
  entityType: SignalEntityType,
  entityId: string
): Promise<SignalRow[]> {
  const { data, error } = await t(supabase)
    .from("signals")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);

  if (error) {
    console.error(`[db-signals] getSignalsForEntity error:`, error.message);
    return [];
  }
  return (data || []) as SignalRow[];
}

/**
 * Get a specific signal for an entity.
 */
export async function getSignal(
  supabase: SupabaseClient,
  signalKey: SignalKey,
  entityType: SignalEntityType,
  entityId: string
): Promise<SignalRow | null> {
  const { data, error } = await t(supabase)
    .from("signals")
    .select("*")
    .eq("signal_key", signalKey)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // not found
    console.error(`[db-signals] getSignal error:`, error.message);
    return null;
  }
  return data as SignalRow;
}

/**
 * Get signal history for trend analysis.
 */
export async function getSignalHistory(
  supabase: SupabaseClient,
  signalKey: SignalKey,
  entityType: SignalEntityType,
  entityId: string,
  limit = 30
): Promise<SignalLogRow[]> {
  const { data, error } = await t(supabase)
    .from("signal_log")
    .select("*")
    .eq("signal_key", signalKey)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("computed_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`[db-signals] getSignalHistory error:`, error.message);
    return [];
  }
  return (data || []) as SignalLogRow[];
}

// ─── Interactions (read-only queries for signal computation) ──

/**
 * Fetch interactions for an entity within a lookback window.
 * This is the primary data source for all signal computations.
 */
export async function getInteractionsForEntity(
  supabase: SupabaseClient,
  entityType: SignalEntityType,
  entityId: string,
  lookbackDays: number
): Promise<import("../types").InteractionRow[]> {
  const cutoff = new Date(
    Date.now() - lookbackDays * 24 * 60 * 60 * 1000
  ).toISOString();

  // Map entity type to the correct FK column
  const fkColumn =
    entityType === "account"
      ? "account_id"
      : entityType === "deal"
        ? "deal_id"
        : "contact_id";

  const { data, error } = await t(supabase)
    .from("interactions")
    .select("*")
    .eq(fkColumn, entityId)
    .gte("occurred_at", cutoff)
    .order("occurred_at", { ascending: false });

  if (error) {
    console.error(`[db-signals] getInteractionsForEntity error:`, error.message);
    return [];
  }
  return (data || []) as import("../types").InteractionRow[];
}

// ─── Entity Discovery (find entities to compute signals for) ─

/**
 * Get account IDs that have interactions in the given lookback window.
 */
export async function getActiveAccountIds(
  supabase: SupabaseClient,
  lookbackDays: number,
  limit: number
): Promise<string[]> {
  const cutoff = new Date(
    Date.now() - lookbackDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await t(supabase)
    .from("interactions")
    .select("account_id")
    .not("account_id", "is", null)
    .gte("occurred_at", cutoff)
    .order("occurred_at", { ascending: false })
    .limit(limit * 10); // over-fetch to account for duplicates

  if (error) {
    console.error(`[db-signals] getActiveAccountIds error:`, error.message);
    return [];
  }

  const unique = [...new Set((data || []).map((r) => r.account_id as string))];
  return unique.slice(0, limit);
}

/**
 * Get deal IDs that have interactions in the given lookback window.
 */
export async function getActiveDealIds(
  supabase: SupabaseClient,
  lookbackDays: number,
  limit: number
): Promise<string[]> {
  const cutoff = new Date(
    Date.now() - lookbackDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await t(supabase)
    .from("interactions")
    .select("deal_id")
    .not("deal_id", "is", null)
    .gte("occurred_at", cutoff)
    .order("occurred_at", { ascending: false })
    .limit(limit * 10);

  if (error) {
    console.error(`[db-signals] getActiveDealIds error:`, error.message);
    return [];
  }

  const unique = [...new Set((data || []).map((r) => r.deal_id as string))];
  return unique.slice(0, limit);
}

/**
 * Get contact IDs that have interactions in the given lookback window.
 */
export async function getActiveContactIds(
  supabase: SupabaseClient,
  lookbackDays: number,
  limit: number
): Promise<string[]> {
  const cutoff = new Date(
    Date.now() - lookbackDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await t(supabase)
    .from("interactions")
    .select("contact_id")
    .not("contact_id", "is", null)
    .gte("occurred_at", cutoff)
    .order("occurred_at", { ascending: false })
    .limit(limit * 10);

  if (error) {
    console.error(`[db-signals] getActiveContactIds error:`, error.message);
    return [];
  }

  const unique = [...new Set((data || []).map((r) => r.contact_id as string))];
  return unique.slice(0, limit);
}
