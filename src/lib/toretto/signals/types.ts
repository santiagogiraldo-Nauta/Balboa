// ============================================================
// Toretto Phase 2 — Signal Engine Type Definitions
// Matches toretto.signals, toretto.signal_log, toretto.signal_triggers
// ============================================================

import type { InteractionRow } from "../types";

// ─── Signal Keys ─────────────────────────────────────────────

export type AccountSignalKey =
  | "account_engagement_score"
  | "account_channel_breadth"
  | "account_response_rate"
  | "account_contact_coverage";

export type DealSignalKey =
  | "deal_momentum"
  | "deal_stage_velocity"
  | "deal_risk"
  | "deal_activity_volume";

export type RelationshipSignalKey =
  | "contact_engagement"
  | "contact_sentiment_trend"
  | "contact_responsiveness";

export type IntentSignalKey =
  | "intent_buying_activity"
  | "intent_deal_progression"
  | "intent_silence_risk";

export type SignalKey =
  | AccountSignalKey
  | DealSignalKey
  | RelationshipSignalKey
  | IntentSignalKey;

export type SignalCategory = "account" | "deal" | "relationship" | "intent";

export type SignalEntityType = "account" | "deal" | "contact";

export type ScoreBand = "critical" | "high" | "medium" | "low" | "inactive";

export type SignalPriority = "urgent" | "high" | "medium" | "low";

export type TriggerCondition =
  | "crosses_above"
  | "crosses_below"
  | "stays_above"
  | "stays_below"
  | "enters_band"
  | "exits_band";

// ─── Database Row Types ──────────────────────────────────────

export interface SignalRow {
  id: string;
  signal_key: SignalKey;
  entity_type: SignalEntityType;
  entity_id: string;
  score: number;
  previous_score: number | null;
  score_band: ScoreBand;
  computed_at: string;
  lookback_days: number;
  interaction_count: number;
  computation_ms: number | null;
  breakdown: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SignalLogRow {
  id: string;
  signal_key: SignalKey;
  entity_type: SignalEntityType;
  entity_id: string;
  score: number;
  score_band: ScoreBand;
  breakdown: Record<string, unknown>;
  interaction_count: number;
  computed_at: string;
}

export interface SignalTriggerRow {
  id: string;
  signal_key: SignalKey;
  condition: TriggerCondition;
  threshold: number | null;
  target_band: ScoreBand | null;
  action_type: string;
  channel: string | null;
  template_key: string | null;
  priority: SignalPriority;
  delay_minutes: number;
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

// ─── Insert Payloads ─────────────────────────────────────────

export type SignalInsert = Omit<SignalRow, "id" | "created_at" | "updated_at">;

export type SignalLogInsert = Omit<SignalLogRow, "id">;

// ─── Computation Types ───────────────────────────────────────

/** Definition of how to compute a signal */
export interface SignalDefinition {
  key: SignalKey;
  category: SignalCategory;
  entityType: SignalEntityType;
  lookbackDays: number;
  isComposite: boolean;
  compute: (ctx: SignalComputeContext) => SignalComputeResult;
}

/** Context passed to every signal compute function */
export interface SignalComputeContext {
  entityId: string;
  entityType: SignalEntityType;
  interactions: InteractionRow[];
  existingSignal: SignalRow | null;
  relatedSignals?: SignalRow[];
  now: Date;
}

/** Result from computing a signal */
export interface SignalComputeResult {
  score: number;
  band: ScoreBand;
  breakdown: Record<string, unknown>;
  interactionCount: number;
}

/** Result from a batch computation run */
export interface SignalBatchResult {
  signalsComputed: number;
  signalsUpdated: number;
  signalsCreated: number;
  triggersEvaluated: number;
  actionsFired: number;
  errors: string[];
  durationMs: number;
}
