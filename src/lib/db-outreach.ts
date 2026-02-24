// CRUD functions for outreach_queue table
import { SupabaseClient } from "@supabase/supabase-js";
import { OutreachStatus } from "./outreach-gate";

export interface OutreachQueueItem {
  id: string;
  userId: string;
  leadId: string;
  channel: "email" | "linkedin" | "call";
  subject?: string;
  body: string;
  status: OutreachStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
  sentAt?: string;
  sendError?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function rowToItem(row: Record<string, unknown>): OutreachQueueItem {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    leadId: row.lead_id as string,
    channel: row.channel as "email" | "linkedin" | "call",
    subject: row.subject as string | undefined,
    body: row.body as string,
    status: row.status as OutreachStatus,
    reviewedAt: row.reviewed_at as string | undefined,
    reviewedBy: row.reviewed_by as string | undefined,
    reviewNote: row.review_note as string | undefined,
    sentAt: row.sent_at as string | undefined,
    sendError: row.send_error as string | undefined,
    metadata: (row.metadata || {}) as Record<string, unknown>,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Fetch outreach queue items for a user, optionally filtered by status.
 */
export async function getQueueItems(
  supabase: SupabaseClient,
  userId: string,
  status?: OutreachStatus
): Promise<OutreachQueueItem[]> {
  let query = supabase
    .from("outreach_queue")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching outreach queue:", error);
    return [];
  }
  return (data || []).map(rowToItem);
}

/**
 * Approve a queued outreach item.
 */
export async function approveQueueItem(
  supabase: SupabaseClient,
  userId: string,
  queueId: string
): Promise<OutreachQueueItem | null> {
  const { data, error } = await supabase
    .from("outreach_queue")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
    })
    .eq("id", queueId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    console.error("Error approving queue item:", error);
    return null;
  }
  return rowToItem(data);
}

/**
 * Reject a queued outreach item.
 */
export async function rejectQueueItem(
  supabase: SupabaseClient,
  userId: string,
  queueId: string,
  reason?: string
): Promise<OutreachQueueItem | null> {
  const { data, error } = await supabase
    .from("outreach_queue")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
      review_note: reason || null,
    })
    .eq("id", queueId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    console.error("Error rejecting queue item:", error);
    return null;
  }
  return rowToItem(data);
}

/**
 * Mark a queued item as sent.
 */
export async function markQueueItemSent(
  supabase: SupabaseClient,
  userId: string,
  queueId: string
): Promise<OutreachQueueItem | null> {
  const { data, error } = await supabase
    .from("outreach_queue")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .eq("id", queueId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    console.error("Error marking queue item as sent:", error);
    return null;
  }
  return rowToItem(data);
}

/**
 * Cancel a queued item.
 */
export async function cancelQueueItem(
  supabase: SupabaseClient,
  userId: string,
  queueId: string
): Promise<OutreachQueueItem | null> {
  const { data, error } = await supabase
    .from("outreach_queue")
    .update({ status: "cancelled" })
    .eq("id", queueId)
    .eq("user_id", userId)
    .eq("status", "pending_approval") // can only cancel pending items
    .select()
    .single();

  if (error) {
    console.error("Error cancelling queue item:", error);
    return null;
  }
  return rowToItem(data);
}

/**
 * Get count of pending items (for badge display).
 */
export async function getPendingCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("outreach_queue")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "pending_approval");

  if (error) {
    console.error("Error counting pending queue:", error);
    return 0;
  }
  return count || 0;
}
