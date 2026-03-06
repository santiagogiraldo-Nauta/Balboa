// ============================================================
// Balboa Fire — Database Access Layer
// CRUD operations for fire_actions, branching_rules, reply_classifications
// Follows same patterns as ../db-touchpoints.ts
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";
import type {
  FireActionRow,
  BranchingRuleRow,
  ReplyClassificationRow,
  FireActionStatus,
} from "./types";

// ─── Fire Actions ────────────────────────────────────────────

export async function insertFireAction(
  supabase: SupabaseClient,
  action: Omit<FireActionRow, "id" | "created_at" | "executed_at" | "execution_result" | "error_message">
): Promise<FireActionRow | null> {
  const { data, error } = await supabase
    .from("fire_actions")
    .insert([action])
    .select()
    .single();

  if (error) {
    console.error("[db-fire] Error inserting fire action:", error);
    return null;
  }
  return data;
}

export async function updateFireAction(
  supabase: SupabaseClient,
  actionId: string,
  updates: Partial<Pick<FireActionRow,
    "status" | "executed_at" | "execution_result" | "error_message" | "scheduled_for" | "metadata"
  >>
): Promise<FireActionRow | null> {
  const { data, error } = await supabase
    .from("fire_actions")
    .update(updates)
    .eq("id", actionId)
    .select()
    .single();

  if (error) {
    console.error("[db-fire] Error updating fire action:", error);
    return null;
  }
  return data;
}

export async function getFireActions(
  supabase: SupabaseClient,
  opts: {
    userId?: string;
    leadId?: string;
    status?: FireActionStatus | FireActionStatus[];
    triggerType?: string;
    since?: string;
    scheduledBefore?: string;
    limit?: number;
  }
): Promise<FireActionRow[]> {
  let query = supabase
    .from("fire_actions")
    .select("*")
    .order("created_at", { ascending: false });

  if (opts.userId) query = query.eq("user_id", opts.userId);
  if (opts.leadId) query = query.eq("lead_id", opts.leadId);
  if (opts.status) {
    if (Array.isArray(opts.status)) {
      query = query.in("status", opts.status);
    } else {
      query = query.eq("status", opts.status);
    }
  }
  if (opts.triggerType) query = query.eq("trigger_type", opts.triggerType);
  if (opts.since) query = query.gte("created_at", opts.since);
  if (opts.scheduledBefore) query = query.lte("scheduled_for", opts.scheduledBefore);
  if (opts.limit) query = query.limit(opts.limit);

  const { data, error } = await query;

  if (error) {
    console.error("[db-fire] Error fetching fire actions:", error);
    return [];
  }
  return data || [];
}

/**
 * Get pending fire actions ready for execution.
 * Returns actions where status = 'pending' AND scheduled_for <= now (or null).
 */
export async function getPendingFireActions(
  supabase: SupabaseClient,
  limit: number = 50
): Promise<FireActionRow[]> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("fire_actions")
    .select("*")
    .eq("status", "pending")
    .or(`scheduled_for.is.null,scheduled_for.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[db-fire] Error fetching pending actions:", error);
    return [];
  }
  return data || [];
}

/**
 * Check if a fire action already exists for a given trigger event.
 * Prevents duplicate/cyclic actions.
 */
export async function hasExistingFireAction(
  supabase: SupabaseClient,
  triggerEventId: string,
  actionType?: string
): Promise<boolean> {
  let query = supabase
    .from("fire_actions")
    .select("id")
    .eq("trigger_event_id", triggerEventId)
    .limit(1);

  if (actionType) query = query.eq("action_type", actionType);

  const { data } = await query;
  return (data || []).length > 0;
}

/**
 * Count fire actions for rate limiting.
 */
export async function countFireActions(
  supabase: SupabaseClient,
  userId: string,
  channel: string,
  since: string
): Promise<number> {
  const { count, error } = await supabase
    .from("fire_actions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("channel", channel)
    .in("status", ["pending", "executing", "completed"])
    .gte("created_at", since);

  if (error) {
    console.error("[db-fire] Error counting fire actions:", error);
    return 0;
  }
  return count || 0;
}

// ─── Branching Rules ─────────────────────────────────────────

export async function insertBranchingRule(
  supabase: SupabaseClient,
  rule: Omit<BranchingRuleRow, "id" | "created_at">
): Promise<BranchingRuleRow | null> {
  const { data, error } = await supabase
    .from("branching_rules")
    .insert([rule])
    .select()
    .single();

  if (error) {
    console.error("[db-fire] Error inserting branching rule:", error);
    return null;
  }
  return data;
}

export async function updateBranchingRule(
  supabase: SupabaseClient,
  ruleId: string,
  updates: Partial<Pick<BranchingRuleRow,
    "name" | "trigger_event" | "trigger_sentiment" | "trigger_classification" |
    "trigger_after_step" | "trigger_silence_days" | "action_type" | "action_target_step" |
    "action_channel" | "action_snooze_days" | "action_template" | "action_metadata" |
    "priority" | "is_active"
  >>
): Promise<BranchingRuleRow | null> {
  const { data, error } = await supabase
    .from("branching_rules")
    .update(updates)
    .eq("id", ruleId)
    .select()
    .single();

  if (error) {
    console.error("[db-fire] Error updating branching rule:", error);
    return null;
  }
  return data;
}

export async function getBranchingRules(
  supabase: SupabaseClient,
  opts: {
    userId?: string;
    sequenceId?: string;
    includeGlobal?: boolean;
    activeOnly?: boolean;
  }
): Promise<BranchingRuleRow[]> {
  let query = supabase
    .from("branching_rules")
    .select("*")
    .order("priority", { ascending: true });

  if (opts.userId) query = query.eq("user_id", opts.userId);
  if (opts.activeOnly !== false) query = query.eq("is_active", true);

  // Get sequence-specific + global rules
  if (opts.sequenceId && opts.includeGlobal !== false) {
    query = query.or(`sequence_id.eq.${opts.sequenceId},is_global.eq.true`);
  } else if (opts.sequenceId) {
    query = query.eq("sequence_id", opts.sequenceId);
  } else if (opts.includeGlobal) {
    query = query.eq("is_global", true);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[db-fire] Error fetching branching rules:", error);
    return [];
  }
  return data || [];
}

export async function deleteBranchingRule(
  supabase: SupabaseClient,
  ruleId: string,
  userId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("branching_rules")
    .delete()
    .eq("id", ruleId)
    .eq("user_id", userId);

  if (error) {
    console.error("[db-fire] Error deleting branching rule:", error);
    return false;
  }
  return true;
}

// ─── Reply Classifications ───────────────────────────────────

export async function insertReplyClassification(
  supabase: SupabaseClient,
  classification: Omit<ReplyClassificationRow, "id" | "created_at">
): Promise<ReplyClassificationRow | null> {
  const { data, error } = await supabase
    .from("reply_classifications")
    .insert([classification])
    .select()
    .single();

  if (error) {
    console.error("[db-fire] Error inserting reply classification:", error);
    return null;
  }
  return data;
}

export async function getReplyClassifications(
  supabase: SupabaseClient,
  opts: {
    userId?: string;
    leadId?: string;
    classification?: string;
    since?: string;
    limit?: number;
  }
): Promise<ReplyClassificationRow[]> {
  let query = supabase
    .from("reply_classifications")
    .select("*")
    .order("created_at", { ascending: false });

  if (opts.userId) query = query.eq("user_id", opts.userId);
  if (opts.leadId) query = query.eq("lead_id", opts.leadId);
  if (opts.classification) query = query.eq("classification", opts.classification);
  if (opts.since) query = query.gte("created_at", opts.since);
  if (opts.limit) query = query.limit(opts.limit);

  const { data, error } = await query;

  if (error) {
    console.error("[db-fire] Error fetching reply classifications:", error);
    return [];
  }
  return data || [];
}

// ─── Enrollment Helpers (Fire-specific queries) ──────────────

/**
 * Get active enrollments for a lead where the sequence has fire_enabled = true.
 * This is the key query that determines if Fire should act on an event.
 */
export async function getFireEnabledEnrollments(
  supabase: SupabaseClient,
  leadId: string
): Promise<Array<{
  enrollment_id: string;
  sequence_id: string;
  sequence_name: string;
  user_id: string;
  current_step: number;
  total_steps: number | null;
  branch_path: string;
  channel_override: string | null;
  status: string;
}>> {
  // Join sequence_enrollments with sequences to check fire_enabled
  const { data: enrollments, error: enrollError } = await supabase
    .from("sequence_enrollments")
    .select("id, sequence_id, sequence_name, user_id, current_step, total_steps, branch_path, channel_override, status")
    .eq("lead_id", leadId)
    .eq("status", "active");

  if (enrollError || !enrollments?.length) return [];

  // Get sequences with fire_enabled
  const sequenceIds = [...new Set(enrollments.map(e => e.sequence_id))];
  const { data: sequences } = await supabase
    .from("sequences")
    .select("id, fire_enabled")
    .in("id", sequenceIds)
    .eq("fire_enabled", true);

  if (!sequences?.length) return [];

  const fireSequenceIds = new Set(sequences.map(s => s.id));

  return enrollments
    .filter(e => fireSequenceIds.has(e.sequence_id))
    .map(e => ({
      enrollment_id: e.id,
      sequence_id: e.sequence_id,
      sequence_name: e.sequence_name,
      user_id: e.user_id,
      current_step: e.current_step,
      total_steps: e.total_steps,
      branch_path: e.branch_path || "main",
      channel_override: e.channel_override || null,
      status: e.status,
    }));
}

/**
 * Update enrollment state (used by branching engine).
 */
export async function updateEnrollmentForFire(
  supabase: SupabaseClient,
  enrollmentId: string,
  updates: {
    current_step?: number;
    branch_path?: string;
    channel_override?: string | null;
    silence_since?: string | null;
    status?: string;
    completed_at?: string;
    last_step_at?: string;
  }
): Promise<boolean> {
  const { error } = await supabase
    .from("sequence_enrollments")
    .update(updates)
    .eq("id", enrollmentId);

  if (error) {
    console.error("[db-fire] Error updating enrollment:", error);
    return false;
  }
  return true;
}

/**
 * Get enrollments in silence (no activity for N days).
 * Used by silence detection cron.
 */
export async function getSilentEnrollments(
  supabase: SupabaseClient,
  silenceDays: number
): Promise<Array<{
  enrollment_id: string;
  sequence_id: string;
  lead_id: string;
  user_id: string;
  current_step: number;
  last_step_at: string;
  silence_days: number;
}>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - silenceDays);

  const { data: enrollments, error } = await supabase
    .from("sequence_enrollments")
    .select("id, sequence_id, lead_id, user_id, current_step, last_step_at")
    .eq("status", "active")
    .not("last_step_at", "is", null)
    .lte("last_step_at", cutoff.toISOString());

  if (error || !enrollments?.length) return [];

  // Filter to fire-enabled sequences only
  const sequenceIds = [...new Set(enrollments.map(e => e.sequence_id))];
  const { data: sequences } = await supabase
    .from("sequences")
    .select("id")
    .in("id", sequenceIds)
    .eq("fire_enabled", true);

  if (!sequences?.length) return [];
  const fireIds = new Set(sequences.map(s => s.id));

  return enrollments
    .filter(e => fireIds.has(e.sequence_id) && e.lead_id)
    .map(e => {
      const lastStep = new Date(e.last_step_at!);
      const now = new Date();
      const daysSilent = Math.floor((now.getTime() - lastStep.getTime()) / (1000 * 60 * 60 * 24));
      return {
        enrollment_id: e.id,
        sequence_id: e.sequence_id,
        lead_id: e.lead_id!,
        user_id: e.user_id,
        current_step: e.current_step,
        last_step_at: e.last_step_at!,
        silence_days: daysSilent,
      };
    });
}

// ─── Fire Stats ──────────────────────────────────────────────

export async function getFireStats(
  supabase: SupabaseClient,
  userId: string,
  since?: string
): Promise<{
  totalActions: number;
  byStatus: Record<string, number>;
  byActionType: Record<string, number>;
  byTriggerType: Record<string, number>;
  classifications: number;
  classificationBreakdown: Record<string, number>;
}> {
  let actionQuery = supabase
    .from("fire_actions")
    .select("status, action_type, trigger_type")
    .eq("user_id", userId);

  let classQuery = supabase
    .from("reply_classifications")
    .select("classification")
    .eq("user_id", userId);

  if (since) {
    actionQuery = actionQuery.gte("created_at", since);
    classQuery = classQuery.gte("created_at", since);
  }

  const [{ data: actions }, { data: classifications }] = await Promise.all([
    actionQuery,
    classQuery,
  ]);

  const byStatus: Record<string, number> = {};
  const byActionType: Record<string, number> = {};
  const byTriggerType: Record<string, number> = {};
  const classificationBreakdown: Record<string, number> = {};

  for (const a of (actions || [])) {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    byActionType[a.action_type] = (byActionType[a.action_type] || 0) + 1;
    byTriggerType[a.trigger_type] = (byTriggerType[a.trigger_type] || 0) + 1;
  }

  for (const c of (classifications || [])) {
    classificationBreakdown[c.classification] = (classificationBreakdown[c.classification] || 0) + 1;
  }

  return {
    totalActions: (actions || []).length,
    byStatus,
    byActionType,
    byTriggerType,
    classifications: (classifications || []).length,
    classificationBreakdown,
  };
}
