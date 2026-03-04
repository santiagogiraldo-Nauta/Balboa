import { SupabaseClient } from "@supabase/supabase-js";
import type { CommunicationThread } from "@/lib/types";

/**
 * Persist Gmail threads into the conversations + messages tables.
 * Uses batched upserts for performance (critical on Vercel serverless).
 *
 * This bridges Gmail live-fetched data into the DB so that:
 * - Vasco can query email history
 * - Follow-up recommendations use real email data
 * - Email metrics can be computed from DB
 */
export async function persistGmailThreads(
  supabase: SupabaseClient,
  userId: string,
  matchedThreads: Record<string, CommunicationThread[]>,
  unmatchedThreads: CommunicationThread[]
): Promise<{ conversationsUpserted: number; messagesUpserted: number }> {
  // Collect all threads (matched + unmatched)
  const allThreads: CommunicationThread[] = [
    ...Object.values(matchedThreads).flat(),
    ...unmatchedThreads,
  ];

  if (allThreads.length === 0) {
    return { conversationsUpserted: 0, messagesUpserted: 0 };
  }

  const now = new Date().toISOString();

  // Build all conversation records at once
  const conversationRecords = allThreads.map((thread) => {
    const leadId = thread.leadId === "unmatched" ? null : thread.leadId;
    const lastMsg = thread.messages[thread.messages.length - 1];

    return {
      id: thread.id,
      user_id: userId,
      lead_id: leadId,
      channel: "email",
      subject: thread.subject || null,
      last_message_body: lastMsg?.body?.slice(0, 500) || null,
      last_message_date: thread.lastMessageDate || null,
      last_message_direction: lastMsg?.direction || null,
      message_count: thread.messages.length,
      unread_count: thread.unreadCount || 0,
      status: "active",
      metadata: { source: "gmail", synced_at: now },
      updated_at: now,
    };
  });

  // Build all message records at once
  const messageRecords = allThreads.flatMap((thread) => {
    const leadId = thread.leadId === "unmatched" ? null : thread.leadId;

    return thread.messages.map((msg) => ({
      id: msg.id,
      user_id: userId,
      lead_id: leadId,
      thread_id: thread.id,
      channel: "email",
      direction: msg.direction || "inbound",
      subject: msg.subject || null,
      body: msg.body || "",
      status: msg.status || "delivered",
      sender: msg.sender || "",
      recipient: null,
      attachments: [],
      metadata: {
        source: "gmail",
        gmail_thread_id: thread.id.replace("gmail-", ""),
        gmail_message_id: msg.id.replace("gmail-", ""),
      },
      has_unsubscribe: false,
      has_physical_address: false,
      compliance_checked: false,
      sent_at: msg.direction === "outbound" ? msg.date : null,
      created_at: msg.date || now,
      updated_at: now,
    }));
  });

  // Batch upsert conversations (50 at a time)
  let conversationsUpserted = 0;
  const BATCH_SIZE = 50;

  for (let i = 0; i < conversationRecords.length; i += BATCH_SIZE) {
    const batch = conversationRecords.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("conversations")
      .upsert(batch, { onConflict: "id" });

    if (error) {
      console.error(`[persist] Conversations batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error);
    } else {
      conversationsUpserted += batch.length;
    }
  }

  // Batch upsert messages (100 at a time)
  let messagesUpserted = 0;
  const MSG_BATCH_SIZE = 100;

  for (let i = 0; i < messageRecords.length; i += MSG_BATCH_SIZE) {
    const batch = messageRecords.slice(i, i + MSG_BATCH_SIZE);
    const { error } = await supabase
      .from("messages")
      .upsert(batch, { onConflict: "id" });

    if (error) {
      console.error(`[persist] Messages batch ${Math.floor(i / MSG_BATCH_SIZE) + 1} failed:`, error);
    } else {
      messagesUpserted += batch.length;
    }
  }

  console.log(
    `[persist] Upserted ${conversationsUpserted} conversations, ${messagesUpserted} messages`
  );

  return { conversationsUpserted, messagesUpserted };
}
