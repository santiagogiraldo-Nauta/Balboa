import { createHash } from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import type { CommunicationThread } from "@/lib/types";

/**
 * Generate a deterministic UUID v5-like identifier from a string.
 * This ensures the same Gmail thread/message always maps to the same UUID,
 * allowing correct upsert behavior with Supabase UUID primary keys.
 */
function toUuid(input: string): string {
  const hash = createHash("sha256").update(input).digest("hex");
  // Format as UUID with version 5 and variant bits
  const v = "5"; // version nibble
  const variantNibble = ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    v + hash.slice(13, 16),
    variantNibble + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join("-");
}

/**
 * Persist Gmail threads into the conversations + messages tables.
 * Uses batched upserts for performance (critical on Vercel serverless).
 *
 * Gmail IDs are hashed into deterministic UUIDs so that:
 * - The UUID primary key constraint is satisfied
 * - Repeated syncs correctly upsert (no duplicates)
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
    // Deterministic UUID from user + gmail thread ID
    const convUuid = toUuid(`conv-${userId}-${thread.id}`);

    return {
      id: convUuid,
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
      metadata: {
        source: "gmail",
        gmail_thread_id: thread.id.replace("gmail-", ""),
        synced_at: now,
      },
      updated_at: now,
    };
  });

  // Build all message records at once
  const messageRecords = allThreads.flatMap((thread) => {
    const leadId = thread.leadId === "unmatched" ? null : thread.leadId;
    const convUuid = toUuid(`conv-${userId}-${thread.id}`);

    return thread.messages.map((msg) => {
      const msgUuid = toUuid(`msg-${userId}-${msg.id}`);

      return {
        id: msgUuid,
        user_id: userId,
        lead_id: leadId,
        thread_id: convUuid, // Links to conversation UUID
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
      };
    });
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
      console.error(
        `[persist] Conversations batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`,
        error
      );
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
      console.error(
        `[persist] Messages batch ${Math.floor(i / MSG_BATCH_SIZE) + 1} failed:`,
        error
      );
    } else {
      messagesUpserted += batch.length;
    }
  }

  console.log(
    `[persist] Upserted ${conversationsUpserted} conversations, ${messagesUpserted} messages`
  );

  return { conversationsUpserted, messagesUpserted };
}
