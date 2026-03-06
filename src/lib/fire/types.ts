// ============================================================
// Balboa Fire — Type Definitions
// Autonomous execution queue, branching rules, reply classification
// ============================================================

// ─── Database Row Types ──────────────────────────────────────

export interface FireActionRow {
  id: string;
  user_id: string;
  lead_id: string | null;
  enrollment_id: string | null;
  trigger_event_id: string | null;
  trigger_rule_id: string | null;
  trigger_type: FireTriggerType;
  action_type: FireActionType;
  channel: FireChannel | null;
  subject: string | null;
  body: string | null;
  template_key: string | null;
  status: FireActionStatus;
  scheduled_for: string | null;
  executed_at: string | null;
  execution_result: Record<string, unknown> | null;
  error_message: string | null;
  reply_classification: ReplyClassificationType | null;
  reply_confidence: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BranchingRuleRow {
  id: string;
  user_id: string;
  sequence_id: string | null;
  name: string;
  trigger_event: string;
  trigger_sentiment: string | null;
  trigger_classification: ReplyClassificationType | null;
  trigger_after_step: number | null;
  trigger_silence_days: number | null;
  action_type: BranchingActionType;
  action_target_step: number | null;
  action_channel: string | null;
  action_snooze_days: number | null;
  action_template: string | null;
  action_metadata: Record<string, unknown>;
  priority: number;
  is_active: boolean;
  is_global: boolean;
  created_at: string;
}

export interface ReplyClassificationRow {
  id: string;
  user_id: string;
  lead_id: string | null;
  touchpoint_event_id: string | null;
  classification: ReplyClassificationType;
  confidence: number;
  sub_classification: string | null;
  email_subject: string | null;
  email_body_preview: string | null;
  routed_action: string | null;
  fire_action_id: string | null;
  classified_by: "rules" | "ai";
  created_at: string;
}

// ─── Enums / Union Types ─────────────────────────────────────

export type FireTriggerType =
  | "rule_match"
  | "signal_trigger"
  | "reply_classification"
  | "scheduled";

export type FireActionType =
  | "send_email"
  | "send_linkedin"
  | "create_call_task"
  | "snooze"
  | "update_status"
  | "notify"
  | "switch_channel";

export type FireActionStatus =
  | "pending"
  | "approved"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

export type FireChannel = "email" | "linkedin" | "call" | "slack";

export type BranchingActionType =
  | "advance"
  | "branch"
  | "pause"
  | "complete"
  | "switch_channel"
  | "snooze"
  | "create_task"
  | "send_message";

export type ReplyClassificationType =
  | "interested"
  | "objection"
  | "not_now"
  | "wrong_person"
  | "auto_reply"
  | "referral"
  | "unsubscribe";

export type ObjectionSubType = "price" | "timing" | "authority" | "need";

// ─── Engine Input/Output Types ───────────────────────────────

/** Result from classifying a reply */
export interface ClassificationResult {
  classification: ReplyClassificationType;
  confidence: number;
  subClassification?: ObjectionSubType;
  classifiedBy: "rules" | "ai";
  routedAction?: string;
}

/** Configuration for a signal trigger */
export interface TriggerConfig {
  action: FireActionType;
  channel?: FireChannel;
  template?: string;
  delayMinutes?: number;
  priority?: "urgent" | "high" | "medium" | "low";
  metadata?: Record<string, unknown>;
}

/** Result from the Fire orchestrator */
export interface FireEngineResult {
  actionsCreated: number;
  classificationsCreated: number;
  rulesEvaluated: number;
  errors: string[];
}

/** Result from branching engine evaluation */
export interface BranchingResult {
  matched: boolean;
  rule?: BranchingRuleRow;
  fireActionId?: string;
  enrollmentUpdated?: boolean;
  action?: BranchingActionType;
}

/** Rate limit configuration for Fire actions */
export interface FireRateLimits {
  maxEmailsPerHour: number;
  maxEmailsPerDay: number;
  maxLinkedInPerDay: number;
  maxActionsPerHour: number;
}

export const DEFAULT_FIRE_RATE_LIMITS: FireRateLimits = {
  maxEmailsPerHour: 20,
  maxEmailsPerDay: 50,
  maxLinkedInPerDay: 25,
  maxActionsPerHour: 40,
};

/** Fire execution payload returned to n8n */
export interface FireExecutionPayload {
  actionId: string;
  actionType: FireActionType;
  channel: FireChannel | null;
  leadId: string | null;
  userId: string;
  subject: string | null;
  body: string | null;
  templateKey: string | null;
  metadata: Record<string, unknown>;
}
