import { SupabaseClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────

export type MessageChannel = "email" | "linkedin" | "sms" | "whatsapp" | "call";
export type MessageDirection = "inbound" | "outbound";

export interface Message {
  id: string;
  userId: string;
  leadId: string | null;
  threadId: string | null;
  channel: MessageChannel;
  direction: MessageDirection;
  subject: string | null;
  body: string;
  status: string;
  sender: string;
  recipient: string | null;
  attachments: unknown[];
  metadata: Record<string, unknown>;
  hasUnsubscribe: boolean;
  hasPhysicalAddress: boolean;
  complianceChecked: boolean;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  repliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  leadId: string | null;
  channel: string;
  subject: string | null;
  lastMessageBody: string | null;
  lastMessageDate: string | null;
  lastMessageDirection: string | null;
  messageCount: number;
  unreadCount: number;
  status: string;
  snoozedUntil: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationFilters {
  channel?: MessageChannel;
  status?: string;
}

export interface CreateMessageData {
  leadId?: string;
  threadId?: string;
  channel: MessageChannel;
  direction: MessageDirection;
  subject?: string;
  body: string;
  sender: string;
  recipient?: string;
  attachments?: unknown[];
  metadata?: Record<string, unknown>;
  hasUnsubscribe?: boolean;
  hasPhysicalAddress?: boolean;
  complianceChecked?: boolean;
  sentAt?: string;
}

export interface InboxStats {
  totalConversations: number;
  unreadCount: number;
  messagesToday: number;
}

// ─── Row mappers ──────────────────────────────────────────────────

function rowToMessage(row: Record<string, unknown>): Message {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    leadId: (row.lead_id as string) || null,
    threadId: (row.thread_id as string) || null,
    channel: row.channel as MessageChannel,
    direction: row.direction as MessageDirection,
    subject: (row.subject as string) || null,
    body: row.body as string,
    status: (row.status as string) || "sent",
    sender: row.sender as string,
    recipient: (row.recipient as string) || null,
    attachments: (row.attachments as unknown[]) || [],
    metadata: (row.metadata || {}) as Record<string, unknown>,
    hasUnsubscribe: (row.has_unsubscribe as boolean) || false,
    hasPhysicalAddress: (row.has_physical_address as boolean) || false,
    complianceChecked: (row.compliance_checked as boolean) || false,
    sentAt: (row.sent_at as string) || null,
    deliveredAt: (row.delivered_at as string) || null,
    readAt: (row.read_at as string) || null,
    repliedAt: (row.replied_at as string) || null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToConversation(row: Record<string, unknown>): Conversation {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    leadId: (row.lead_id as string) || null,
    channel: row.channel as string,
    subject: (row.subject as string) || null,
    lastMessageBody: (row.last_message_body as string) || null,
    lastMessageDate: (row.last_message_date as string) || null,
    lastMessageDirection: (row.last_message_direction as string) || null,
    messageCount: (row.message_count as number) || 0,
    unreadCount: (row.unread_count as number) || 0,
    status: (row.status as string) || "active",
    snoozedUntil: (row.snoozed_until as string) || null,
    metadata: (row.metadata || {}) as Record<string, unknown>,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ─── Data Access Functions ────────────────────────────────────────

/**
 * Get all conversations for a user, with optional channel/status filters.
 */
export async function getConversations(
  supabase: SupabaseClient,
  userId: string,
  filters?: ConversationFilters
): Promise<Conversation[]> {
  try {
    let query = supabase
      .from("conversations")
      .select("*")
      .eq("user_id", userId)
      .order("last_message_date", { ascending: false });

    if (filters?.channel) {
      query = query.eq("channel", filters.channel);
    }
    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[db-messages] Error fetching conversations:", error);
      return [];
    }
    return (data || []).map(rowToConversation);
  } catch (err) {
    console.error("[db-messages] Exception in getConversations:", err);
    return [];
  }
}

/**
 * Get all messages in a thread/conversation, ordered chronologically.
 */
export async function getMessages(
  supabase: SupabaseClient,
  userId: string,
  threadId: string
): Promise<Message[]> {
  try {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", userId)
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[db-messages] Error fetching messages:", error);
      return [];
    }
    return (data || []).map(rowToMessage);
  } catch (err) {
    console.error("[db-messages] Exception in getMessages:", err);
    return [];
  }
}

/**
 * Insert a new message and update the corresponding conversation.
 */
export async function createMessage(
  supabase: SupabaseClient,
  userId: string,
  messageData: CreateMessageData
): Promise<Message | null> {
  try {
    const { data, error } = await supabase
      .from("messages")
      .insert([
        {
          user_id: userId,
          lead_id: messageData.leadId || null,
          thread_id: messageData.threadId || null,
          channel: messageData.channel,
          direction: messageData.direction,
          subject: messageData.subject || null,
          body: messageData.body,
          sender: messageData.sender,
          recipient: messageData.recipient || null,
          attachments: messageData.attachments || [],
          metadata: messageData.metadata || {},
          has_unsubscribe: messageData.hasUnsubscribe || false,
          has_physical_address: messageData.hasPhysicalAddress || false,
          compliance_checked: messageData.complianceChecked || false,
          sent_at: messageData.sentAt || (messageData.direction === "outbound" ? new Date().toISOString() : null),
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("[db-messages] Error creating message:", error);
      return null;
    }

    // Update the conversation with latest message info
    if (messageData.threadId) {
      const now = new Date().toISOString();
      const unreadIncrement = messageData.direction === "inbound" ? 1 : 0;

      await supabase.rpc("update_conversation_on_message", {
        p_thread_id: messageData.threadId,
        p_user_id: userId,
        p_body: messageData.body,
        p_direction: messageData.direction,
        p_date: now,
        p_unread_increment: unreadIncrement,
      }).then(({ error: rpcError }) => {
        // Fallback: direct update if RPC doesn't exist
        if (rpcError) {
          supabase
            .from("conversations")
            .update({
              last_message_body: messageData.body,
              last_message_date: now,
              last_message_direction: messageData.direction,
              // message_count is incremented via RPC; direct update only sets other fields
              updated_at: now,
            })
            .eq("id", messageData.threadId)
            .eq("user_id", userId)
            .then(() => {});
        }
      });
    }

    return rowToMessage(data);
  } catch (err) {
    console.error("[db-messages] Exception in createMessage:", err);
    return null;
  }
}

/**
 * Get inbox stats: total conversations, unread count, messages sent today.
 */
export async function getInboxStats(
  supabase: SupabaseClient,
  userId: string
): Promise<InboxStats> {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [convResult, unreadResult, todayResult] = await Promise.all([
      supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .from("conversations")
        .select("unread_count")
        .eq("user_id", userId)
        .gt("unread_count", 0),
      supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", todayStart.toISOString()),
    ]);

    if (convResult.error) console.error("[db-messages] Error fetching conversation count:", convResult.error);
    if (unreadResult.error) console.error("[db-messages] Error fetching unread count:", unreadResult.error);
    if (todayResult.error) console.error("[db-messages] Error fetching today messages:", todayResult.error);

    const totalUnread = (unreadResult.data || []).reduce(
      (sum: number, row: Record<string, unknown>) => sum + ((row.unread_count as number) || 0),
      0
    );

    return {
      totalConversations: convResult.count || 0,
      unreadCount: totalUnread,
      messagesToday: todayResult.count || 0,
    };
  } catch (err) {
    console.error("[db-messages] Exception in getInboxStats:", err);
    return { totalConversations: 0, unreadCount: 0, messagesToday: 0 };
  }
}

/**
 * Get conversations that need follow-up:
 * - Last message was inbound with no outbound reply after
 * - Stale conversations (> 3 days since last message)
 */
export async function getFollowUpCandidates(
  supabase: SupabaseClient,
  userId: string
): Promise<Conversation[]> {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    // Get conversations where last message was inbound (awaiting reply)
    const { data: inboundPending, error: inboundError } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .eq("last_message_direction", "inbound")
      .order("last_message_date", { ascending: false });

    if (inboundError) {
      console.error("[db-messages] Error fetching inbound pending:", inboundError);
    }

    // Get stale conversations (no activity in 3+ days)
    const { data: stale, error: staleError } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .lt("last_message_date", threeDaysAgo)
      .order("last_message_date", { ascending: true });

    if (staleError) {
      console.error("[db-messages] Error fetching stale conversations:", staleError);
    }

    // Merge and deduplicate by id
    const seen = new Set<string>();
    const results: Conversation[] = [];

    for (const row of [...(inboundPending || []), ...(stale || [])]) {
      const conv = rowToConversation(row);
      if (!seen.has(conv.id)) {
        seen.add(conv.id);
        results.push(conv);
      }
    }

    return results;
  } catch (err) {
    console.error("[db-messages] Exception in getFollowUpCandidates:", err);
    return [];
  }
}
