import { SupabaseClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────

export interface SequenceRow {
  id: string;
  user_id: string;
  external_id: string | null;
  source: string;
  name: string;
  description: string | null;
  status: string;
  total_steps: number | null;
  steps: Array<{
    step_number: number;
    channel: string;
    type: string;
    subject?: string;
    body?: string;
    delay_days: number;
  }>;
  stats: {
    enrolled?: number;
    completed?: number;
    replied?: number;
    meetings?: number;
    open_rate?: number;
    click_rate?: number;
    reply_rate?: number;
    bounce_rate?: number;
  };
  synced_at: string;
  created_at: string;
}

// ─── CRUD ─────────────────────────────────────────────────────────

export async function upsertSequence(
  supabase: SupabaseClient,
  sequence: Omit<SequenceRow, "id" | "created_at">
): Promise<SequenceRow | null> {
  // Try to find existing by external_id + source
  if (sequence.external_id) {
    const { data: existing } = await supabase
      .from("sequences")
      .select("id")
      .eq("external_id", sequence.external_id)
      .eq("source", sequence.source)
      .eq("user_id", sequence.user_id)
      .single();

    if (existing) {
      const { data, error } = await supabase
        .from("sequences")
        .update({
          name: sequence.name,
          description: sequence.description,
          status: sequence.status,
          total_steps: sequence.total_steps,
          steps: sequence.steps,
          stats: sequence.stats,
          synced_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        console.error("[db-sequences] Error updating sequence:", error);
        return null;
      }
      return data;
    }
  }

  const { data, error } = await supabase
    .from("sequences")
    .insert([sequence])
    .select()
    .single();

  if (error) {
    console.error("[db-sequences] Error inserting sequence:", error);
    return null;
  }
  return data;
}

export async function getSequences(
  supabase: SupabaseClient,
  userId: string,
  opts?: {
    source?: string;
    status?: string;
    externalId?: string;
  }
): Promise<SequenceRow[]> {
  let query = supabase
    .from("sequences")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (opts?.source) query = query.eq("source", opts.source);
  if (opts?.status) query = query.eq("status", opts.status);
  if (opts?.externalId) query = query.eq("external_id", opts.externalId);

  const { data, error } = await query;

  if (error) {
    console.error("[db-sequences] Error fetching sequences:", error);
    return [];
  }
  return data || [];
}

export async function getSequenceById(
  supabase: SupabaseClient,
  sequenceId: string
): Promise<SequenceRow | null> {
  const { data, error } = await supabase
    .from("sequences")
    .select("*")
    .eq("id", sequenceId)
    .single();

  if (error) return null;
  return data;
}

export async function getSequenceByExternalId(
  supabase: SupabaseClient,
  userId: string,
  externalId: string,
  source: string
): Promise<SequenceRow | null> {
  const { data, error } = await supabase
    .from("sequences")
    .select("*")
    .eq("user_id", userId)
    .eq("external_id", externalId)
    .eq("source", source)
    .single();

  if (error) return null;
  return data;
}

export async function updateSequenceStats(
  supabase: SupabaseClient,
  sequenceId: string,
  stats: SequenceRow["stats"]
): Promise<void> {
  const { error } = await supabase
    .from("sequences")
    .update({ stats, synced_at: new Date().toISOString() })
    .eq("id", sequenceId);

  if (error) {
    console.error("[db-sequences] Error updating sequence stats:", error);
  }
}

export async function deleteSequence(
  supabase: SupabaseClient,
  sequenceId: string,
  userId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("sequences")
    .delete()
    .eq("id", sequenceId)
    .eq("user_id", userId);

  if (error) {
    console.error("[db-sequences] Error deleting sequence:", error);
    return false;
  }
  return true;
}

// ─── Aggregation helpers ─────────────────────────────────────────

export async function getSequenceWithEnrollments(
  supabase: SupabaseClient,
  userId: string,
  sequenceExternalId: string,
  source: string
): Promise<{ sequence: SequenceRow | null; enrollments: Array<Record<string, unknown>> }> {
  const sequence = await getSequenceByExternalId(supabase, userId, sequenceExternalId, source);

  if (!sequence) return { sequence: null, enrollments: [] };

  const { data: enrollments, error } = await supabase
    .from("sequence_enrollments")
    .select("*")
    .eq("sequence_id", sequenceExternalId)
    .eq("user_id", userId)
    .order("enrolled_at", { ascending: false });

  if (error) {
    console.error("[db-sequences] Error fetching enrollments:", error);
    return { sequence, enrollments: [] };
  }

  return { sequence, enrollments: enrollments || [] };
}
