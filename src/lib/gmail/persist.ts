import { SupabaseClient } from "@supabase/supabase-js";
import type { CommunicationThread } from "@/lib/types";

/**
 * Persist Gmail threads into the conversations + messages tables.
 * Uses upsert to avoid duplicates on re-sync.
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
  let conversationsUpserted = 0;
  let messagesUpserted = 0;

  // Collect all threads (matched + unmatched)
  const allThreads: CommunicationThread[] = [
    ...Object.values(matchedThreads).flat(),
    ...unmatchedThreads,
  ];

  for (const thread of allThreads) {
    try {
      const leadId = thread.leadId === "unmatched" ? null : thread.leadId;
      const lastMsg = thread.messages[thread.messages.length - 1];

      // Upsert conversation
      const { error: convError } = await supabase
        .from("conversations")
        .upsert(
          {
            id: thread.id, // "gmail-{threadId}"
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
            metadata: { source: "gmail", synced_at: new Date().toISOString() },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );

      if (convError) {
        console.error(`[persist] Failed to upsert conversation ${thread.id}:`, convError);
        continue;
      }
      conversationsUpserted++;

      // Upsert messages
      for (const msg of thread.messages) {
        const { error: msgError } = await supabase
          .from("messages")
          .upsert(
            {
              id: msg.id, // "gmail-{messageId}"
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
              created_at: msg.date || new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );

        if (msgError) {
          console.error(`[persist] Failed to upsert message ${msg.id}:`, msgError);
        } else {
          messagesUpserted++;
        }
      }
    } catch (err) {
      console.error(`[persist] Error persisting thread ${thread.id}:`, err);
    }
  }

  console.log(
    `[persist] Upserted ${conversationsUpserted} conversations, ${messagesUpserted} messages`
  );

  return { conversationsUpserted, messagesUpserted };
}
