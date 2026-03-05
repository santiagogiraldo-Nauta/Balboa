import { SupabaseClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────

export interface TouchpointEventRow {
  id: string;
  user_id: string;
  lead_id: string | null;
  source: string;
  channel: string;
  event_type: string;
  direction: string | null;
  subject: string | null;
  body_preview: string | null;
  metadata: Record<string, unknown>;
  sentiment: string | null;
  created_at: string;
}

export interface SequenceEnrollmentRow {
  id: string;
  user_id: string;
  lead_id: string | null;
  sequence_id: string;
  sequence_name: string;
  sequence_source: string;
  current_step: number;
  total_steps: number | null;
  status: string;
  enrolled_at: string;
  last_step_at: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown>;
}

export interface DailyActionRow {
  id: string;
  user_id: string;
  lead_id: string | null;
  action_type: string;
  priority: string;
  channel: string | null;
  reason: string;
  suggested_message: string | null;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}

// ─── Touchpoint Events ───────────────────────────────────────────

export async function insertTouchpointEvent(
  supabase: SupabaseClient,
  event: Omit<TouchpointEventRow, "id" | "created_at">
): Promise<TouchpointEventRow | null> {
  const { data, error } = await supabase
    .from("touchpoint_events")
    .insert([event])
    .select()
    .single();

  if (error) {
    console.error("[db-touchpoints] Error inserting touchpoint:", error);
    return null;
  }
  return data;
}

export async function getTouchpointEvents(
  supabase: SupabaseClient,
  userId: string,
  opts?: {
    leadId?: string;
    channel?: string;
    source?: string;
    eventType?: string;
    since?: string;
    limit?: number;
  }
): Promise<TouchpointEventRow[]> {
  let query = supabase
    .from("touchpoint_events")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (opts?.leadId) query = query.eq("lead_id", opts.leadId);
  if (opts?.channel) query = query.eq("channel", opts.channel);
  if (opts?.source) query = query.eq("source", opts.source);
  if (opts?.eventType) query = query.eq("event_type", opts.eventType);
  if (opts?.since) query = query.gte("created_at", opts.since);
  if (opts?.limit) query = query.limit(opts.limit);

  const { data, error } = await query;

  if (error) {
    console.error("[db-touchpoints] Error fetching touchpoints:", error);
    return [];
  }
  return data || [];
}

export async function getTouchpointStats(
  supabase: SupabaseClient,
  userId: string,
  since?: string
): Promise<{
  totalEvents: number;
  byChannel: Record<string, number>;
  byEventType: Record<string, number>;
  bySource: Record<string, number>;
  repliesCount: number;
  sentimentBreakdown: Record<string, number>;
}> {
  const query = supabase
    .from("touchpoint_events")
    .select("channel, event_type, source, sentiment")
    .eq("user_id", userId);

  if (since) query.gte("created_at", since);

  const { data, error } = await query;

  if (error || !data) {
    console.error("[db-touchpoints] Error fetching stats:", error);
    return { totalEvents: 0, byChannel: {}, byEventType: {}, bySource: {}, repliesCount: 0, sentimentBreakdown: {} };
  }

  const byChannel: Record<string, number> = {};
  const byEventType: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const sentimentBreakdown: Record<string, number> = {};
  let repliesCount = 0;

  for (const row of data) {
    byChannel[row.channel] = (byChannel[row.channel] || 0) + 1;
    byEventType[row.event_type] = (byEventType[row.event_type] || 0) + 1;
    bySource[row.source] = (bySource[row.source] || 0) + 1;
    if (row.sentiment) {
      sentimentBreakdown[row.sentiment] = (sentimentBreakdown[row.sentiment] || 0) + 1;
    }
    if (row.event_type === "replied") repliesCount++;
  }

  return {
    totalEvents: data.length,
    byChannel,
    byEventType,
    bySource,
    repliesCount,
    sentimentBreakdown,
  };
}

// ─── Sequence Enrollments ────────────────────────────────────────

export async function insertSequenceEnrollment(
  supabase: SupabaseClient,
  enrollment: Omit<SequenceEnrollmentRow, "id" | "enrolled_at">
): Promise<SequenceEnrollmentRow | null> {
  const { data, error } = await supabase
    .from("sequence_enrollments")
    .insert([enrollment])
    .select()
    .single();

  if (error) {
    console.error("[db-touchpoints] Error inserting enrollment:", error);
    return null;
  }
  return data;
}

export async function updateSequenceEnrollment(
  supabase: SupabaseClient,
  enrollmentId: string,
  updates: Partial<Pick<SequenceEnrollmentRow, "current_step" | "status" | "last_step_at" | "completed_at" | "metadata">>
): Promise<SequenceEnrollmentRow | null> {
  const { data, error } = await supabase
    .from("sequence_enrollments")
    .update(updates)
    .eq("id", enrollmentId)
    .select()
    .single();

  if (error) {
    console.error("[db-touchpoints] Error updating enrollment:", error);
    return null;
  }
  return data;
}

export async function getSequenceEnrollments(
  supabase: SupabaseClient,
  userId: string,
  opts?: {
    leadId?: string;
    sequenceId?: string;
    status?: string;
    source?: string;
  }
): Promise<SequenceEnrollmentRow[]> {
  let query = supabase
    .from("sequence_enrollments")
    .select("*")
    .eq("user_id", userId)
    .order("enrolled_at", { ascending: false });

  if (opts?.leadId) query = query.eq("lead_id", opts.leadId);
  if (opts?.sequenceId) query = query.eq("sequence_id", opts.sequenceId);
  if (opts?.status) query = query.eq("status", opts.status);
  if (opts?.source) query = query.eq("sequence_source", opts.source);

  const { data, error } = await query;

  if (error) {
    console.error("[db-touchpoints] Error fetching enrollments:", error);
    return [];
  }
  return data || [];
}

export async function findEnrollmentByLeadAndSequence(
  supabase: SupabaseClient,
  leadId: string,
  sequenceId: string
): Promise<SequenceEnrollmentRow | null> {
  const { data, error } = await supabase
    .from("sequence_enrollments")
    .select("*")
    .eq("lead_id", leadId)
    .eq("sequence_id", sequenceId)
    .eq("status", "active")
    .single();

  if (error) return null;
  return data;
}

// ─── Daily Actions ───────────────────────────────────────────────

export async function insertDailyAction(
  supabase: SupabaseClient,
  action: Omit<DailyActionRow, "id" | "created_at" | "completed_at">
): Promise<DailyActionRow | null> {
  const { data, error } = await supabase
    .from("daily_actions")
    .insert([action])
    .select()
    .single();

  if (error) {
    console.error("[db-touchpoints] Error inserting daily action:", error);
    return null;
  }
  return data;
}

export async function getDailyActions(
  supabase: SupabaseClient,
  userId: string,
  opts?: {
    status?: string;
    priority?: string;
    dueDate?: string;
    limit?: number;
  }
): Promise<DailyActionRow[]> {
  let query = supabase
    .from("daily_actions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (opts?.status) query = query.eq("status", opts.status);
  if (opts?.priority) query = query.eq("priority", opts.priority);
  if (opts?.dueDate) query = query.lte("due_date", opts.dueDate);
  if (opts?.limit) query = query.limit(opts.limit);

  const { data, error } = await query;

  if (error) {
    console.error("[db-touchpoints] Error fetching daily actions:", error);
    return [];
  }
  return data || [];
}

export async function updateDailyActionStatus(
  supabase: SupabaseClient,
  actionId: string,
  userId: string,
  status: "completed" | "snoozed" | "dismissed"
): Promise<DailyActionRow | null> {
  const updates: Record<string, unknown> = { status };
  if (status === "completed") {
    updates.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("daily_actions")
    .update(updates)
    .eq("id", actionId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    console.error("[db-touchpoints] Error updating daily action:", error);
    return null;
  }
  return data;
}

// ─── Webhook Log ─────────────────────────────────────────────────

export async function logWebhook(
  supabase: SupabaseClient,
  source: string,
  eventType: string | null,
  payload: unknown,
  processed: boolean = false,
  error?: string
): Promise<void> {
  await supabase.from("webhook_log").insert([{
    source,
    event_type: eventType,
    payload,
    processed,
    error: error || null,
  }]);
}
