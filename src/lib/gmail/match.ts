import type { Lead, CommunicationThread } from "@/lib/types";
import type { ParsedGmailThread } from "./service";

/**
 * Match Gmail threads to leads by email address.
 * Returns conversations in the format the Inbox already expects:
 * - matched: Record<leadId, CommunicationThread[]>
 * - unmatched: CommunicationThread[] (threads with no matching lead)
 */
export function matchGmailToLeads(
  gmailThreads: ParsedGmailThread[],
  leads: Pick<Lead, "id" | "email">[],
  userEmail: string
): {
  matched: Record<string, CommunicationThread[]>;
  unmatched: CommunicationThread[];
} {
  // Build email → leadId lookup
  const emailToLeadId = new Map<string, string>();
  for (const lead of leads) {
    if (lead.email) {
      emailToLeadId.set(lead.email.toLowerCase(), lead.id);
    }
  }

  const matched: Record<string, CommunicationThread[]> = {};
  const unmatched: CommunicationThread[] = [];
  const normalizedUserEmail = userEmail.toLowerCase();

  for (const gmailThread of gmailThreads) {
    let leadId: string | null = null;

    // Determine direction for each message and find matching lead
    for (const msg of gmailThread.messages) {
      if (msg.fromEmail === normalizedUserEmail) {
        msg.direction = "outbound";
        // For outbound: match on recipient
        if (!leadId) leadId = emailToLeadId.get(msg.toEmail) || null;
      } else {
        msg.direction = "inbound";
        // For inbound: match on sender
        if (!leadId) leadId = emailToLeadId.get(msg.fromEmail) || null;
      }
    }

    // Convert to CommunicationThread format
    const thread: CommunicationThread = {
      id: `gmail-${gmailThread.threadId}`,
      leadId: leadId || "unmatched",
      channel: "email",
      subject: gmailThread.subject,
      messages: gmailThread.messages.map((msg) => ({
        id: `gmail-${msg.gmailId}`,
        leadId: leadId || "unmatched",
        channel: "email" as const,
        direction: msg.direction,
        subject: msg.subject,
        body: msg.snippet, // Snippet for list view; full body fetched on demand
        date: msg.date,
        status: msg.isRead ? ("read" as const) : ("delivered" as const),
        threadId: `gmail-${msg.threadId}`,
        sender: msg.direction === "inbound" ? msg.from : "You",
      })),
      lastMessageDate: gmailThread.lastMessageDate,
      unreadCount: gmailThread.messages.filter((m) => !m.isRead).length,
    };

    if (leadId) {
      if (!matched[leadId]) matched[leadId] = [];
      matched[leadId].push(thread);
    } else {
      unmatched.push(thread);
    }
  }

  return { matched, unmatched };
}
