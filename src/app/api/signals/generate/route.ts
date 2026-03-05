import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";

// ─── Types ────────────────────────────────────────────────────────

type RealSignalType =
  | "email_reply_needed"
  | "follow_up_needed"
  | "active_negotiation"
  | "new_lead_no_outreach"
  | "scheduled_action";

type SignalUrgency = "immediate" | "high" | "medium" | "low";
type SignalChannel = "email" | "linkedin" | "call";

interface GeneratedSignal {
  id: string;
  type: RealSignalType;
  title: string;
  description: string;
  leadId: string;
  leadName: string;
  company: string;
  urgency: SignalUrgency;
  channel: SignalChannel;
  recommendedAction: string;
  timestamp: string;
  signalSource: "email_activity" | "lead_data" | "conversation_data";
}

// ─── Helpers ──────────────────────────────────────────────────────

function daysBetween(dateA: Date, dateB: Date): number {
  return Math.abs(dateA.getTime() - dateB.getTime()) / (1000 * 60 * 60 * 24);
}

const URGENCY_ORDER: Record<SignalUrgency, number> = {
  immediate: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ─── GET /api/signals/generate ────────────────────────────────────

export async function GET() {
  const { user, supabase, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // ── Run all queries in parallel ──────────────────────────────

    const [
      inboundMessagesResult,
      staleConversationsResult,
      highEngagementResult,
      recentLeadsResult,
      upcomingStepsResult,
    ] = await Promise.all([
      // Signal 1: Inbound messages from last 7 days
      supabase
        .from("messages")
        .select("id, lead_id, thread_id, sender, subject, created_at, direction")
        .eq("user_id", user.id)
        .eq("direction", "inbound")
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(200),

      // Signal 2: Stale conversations (last_message_date > 5 days ago, has lead_id)
      supabase
        .from("conversations")
        .select("id, lead_id, subject, last_message_date, last_message_direction, message_count")
        .eq("user_id", user.id)
        .not("lead_id", "is", null)
        .lt("last_message_date", fiveDaysAgo)
        .order("last_message_date", { ascending: true })
        .limit(50),

      // Signal 3: High engagement conversations (message_count >= 5)
      supabase
        .from("conversations")
        .select("id, lead_id, subject, last_message_date, message_count, last_message_direction")
        .eq("user_id", user.id)
        .not("lead_id", "is", null)
        .gte("message_count", 5)
        .order("last_message_date", { ascending: false })
        .limit(50),

      // Signal 4: Recent leads (last 7 days)
      supabase
        .from("leads")
        .select("id, first_name, last_name, company, icp_score, created_at")
        .eq("user_id", user.id)
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(100),

      // Signal 5: Leads with upcoming next steps (within 2 days)
      supabase
        .from("leads")
        .select("id, first_name, last_name, company, next_action, next_action_date, icp_score")
        .eq("user_id", user.id)
        .not("next_action_date", "is", null)
        .lte("next_action_date", twoDaysFromNow)
        .gte("next_action_date", now.toISOString())
        .order("next_action_date", { ascending: true })
        .limit(50),
    ]);

    // ── Fetch lead details for cross-referencing ──────────────────

    // Collect all lead_ids from conversations we need to look up
    const leadIdsFromConversations = new Set<string>();
    for (const conv of staleConversationsResult.data || []) {
      if (conv.lead_id) leadIdsFromConversations.add(conv.lead_id as string);
    }
    for (const conv of highEngagementResult.data || []) {
      if (conv.lead_id) leadIdsFromConversations.add(conv.lead_id as string);
    }
    for (const msg of inboundMessagesResult.data || []) {
      if (msg.lead_id) leadIdsFromConversations.add(msg.lead_id as string);
    }

    // Fetch lead details for all referenced leads
    let leadLookup: Record<string, { firstName: string; lastName: string; company: string; tier: string }> = {};
    if (leadIdsFromConversations.size > 0) {
      const { data: leadsData } = await supabase
        .from("leads")
        .select("id, first_name, last_name, company, icp_score")
        .eq("user_id", user.id)
        .in("id", Array.from(leadIdsFromConversations));

      for (const lead of leadsData || []) {
        const icpScore = lead.icp_score as { tier?: string } | null;
        leadLookup[lead.id as string] = {
          firstName: lead.first_name as string,
          lastName: lead.last_name as string,
          company: lead.company as string,
          tier: icpScore?.tier || "cold",
        };
      }
    }

    const signals: GeneratedSignal[] = [];
    let signalCounter = 0;

    // ── Signal 1: Unanswered inbound emails ──────────────────────

    if (inboundMessagesResult.data && inboundMessagesResult.data.length > 0) {
      // Group inbound messages by thread_id
      const threadInboundMessages: Record<string, typeof inboundMessagesResult.data> = {};
      for (const msg of inboundMessagesResult.data) {
        const threadId = msg.thread_id as string;
        if (!threadId) continue;
        if (!threadInboundMessages[threadId]) {
          threadInboundMessages[threadId] = [];
        }
        threadInboundMessages[threadId].push(msg);
      }

      // For each thread with inbound messages, check if there's a subsequent outbound reply
      // We need to fetch outbound messages for these threads
      const threadIds = Object.keys(threadInboundMessages);
      if (threadIds.length > 0) {
        const { data: outboundMessages } = await supabase
          .from("messages")
          .select("thread_id, created_at")
          .eq("user_id", user.id)
          .eq("direction", "outbound")
          .in("thread_id", threadIds)
          .gte("created_at", sevenDaysAgo)
          .order("created_at", { ascending: false });

        // Build a map of thread_id -> latest outbound message date
        const latestOutbound: Record<string, string> = {};
        for (const msg of outboundMessages || []) {
          const tid = msg.thread_id as string;
          if (!latestOutbound[tid] || (msg.created_at as string) > latestOutbound[tid]) {
            latestOutbound[tid] = msg.created_at as string;
          }
        }

        // Find inbound messages with no subsequent outbound reply within 24h
        for (const [threadId, msgs] of Object.entries(threadInboundMessages)) {
          // Get the latest inbound message in this thread
          const latestInbound = msgs.reduce((latest, m) =>
            (m.created_at as string) > (latest.created_at as string) ? m : latest
          );

          const inboundDate = new Date(latestInbound.created_at as string);
          const lastOutboundDate = latestOutbound[threadId]
            ? new Date(latestOutbound[threadId])
            : null;

          // No outbound reply, or outbound was before the latest inbound
          const hasNoReply =
            !lastOutboundDate || lastOutboundDate < inboundDate;

          // Only flag if the inbound message is older than 24 hours (gives user time to reply naturally)
          const isOlderThan24h = inboundDate < new Date(oneDayAgo);

          if (hasNoReply && isOlderThan24h) {
            const leadId = latestInbound.lead_id as string;
            const lead = leadId ? leadLookup[leadId] : null;
            const senderStr = (latestInbound.sender as string) || "Unknown sender";
            const subjectStr = (latestInbound.subject as string) || "No subject";
            const leadName = lead
              ? `${lead.firstName} ${lead.lastName}`.trim()
              : senderStr.split("@")[0] || "Unknown";
            const company = lead?.company || "";
            const hoursAgo = Math.round(
              (now.getTime() - inboundDate.getTime()) / (1000 * 60 * 60)
            );

            signalCounter++;
            signals.push({
              id: `sig-email-${signalCounter}`,
              type: "email_reply_needed",
              title: "Unanswered inbound email",
              description: `${leadName} sent "${subjectStr}" ${hoursAgo}h ago with no reply`,
              leadId: leadId || threadId,
              leadName,
              company,
              urgency: hoursAgo > 48 ? "immediate" : "high",
              channel: "email",
              recommendedAction: `Reply to "${subjectStr}" -- this message has been waiting ${hoursAgo} hours`,
              timestamp: latestInbound.created_at as string,
              signalSource: "email_activity",
            });
          }
        }
      }
    }

    // ── Signal 2: Stale leads needing follow-up ──────────────────

    if (staleConversationsResult.data) {
      for (const conv of staleConversationsResult.data) {
        const leadId = conv.lead_id as string;
        if (!leadId) continue;

        const lead = leadLookup[leadId];
        if (!lead) continue;

        // Only include hot or warm tier leads
        if (lead.tier !== "hot" && lead.tier !== "warm") continue;

        const lastDate = new Date(conv.last_message_date as string);
        const daysStale = Math.round(daysBetween(now, lastDate));
        const leadName = `${lead.firstName} ${lead.lastName}`.trim();

        signalCounter++;
        signals.push({
          id: `sig-stale-${signalCounter}`,
          type: "follow_up_needed",
          title: "Lead going cold",
          description: `No contact with ${leadName} for ${daysStale} days (${lead.tier} tier)`,
          leadId,
          leadName,
          company: lead.company,
          urgency: daysStale > 10 ? "immediate" : "high",
          channel: "email",
          recommendedAction: `Re-engage ${leadName} with a value-add touchpoint. Last thread: "${(conv.subject as string) || "unknown"}"`,
          timestamp: conv.last_message_date as string,
          signalSource: "conversation_data",
        });
      }
    }

    // ── Signal 3: High engagement threads ────────────────────────

    if (highEngagementResult.data) {
      for (const conv of highEngagementResult.data) {
        const leadId = conv.lead_id as string;
        if (!leadId) continue;

        const lead = leadLookup[leadId];
        if (!lead) continue;

        const messageCount = conv.message_count as number;
        const leadName = `${lead.firstName} ${lead.lastName}`.trim();

        signalCounter++;
        signals.push({
          id: `sig-engage-${signalCounter}`,
          type: "active_negotiation",
          title: "Active negotiation thread",
          description: `${messageCount} messages exchanged with ${leadName} on "${(conv.subject as string) || "unknown"}"`,
          leadId,
          leadName,
          company: lead.company,
          urgency: "medium",
          channel: "email",
          recommendedAction: `Monitor this active thread and prepare next steps for ${leadName}`,
          timestamp: conv.last_message_date as string,
          signalSource: "conversation_data",
        });
      }
    }

    // ── Signal 4: New leads without outreach ─────────────────────

    if (recentLeadsResult.data && recentLeadsResult.data.length > 0) {
      const recentLeadIds = recentLeadsResult.data.map((l) => l.id as string);

      // Check which of these leads have any messages
      const { data: leadsWithMessages } = await supabase
        .from("messages")
        .select("lead_id")
        .eq("user_id", user.id)
        .in("lead_id", recentLeadIds);

      const leadsWithMessageSet = new Set(
        (leadsWithMessages || []).map((m) => m.lead_id as string)
      );

      for (const lead of recentLeadsResult.data) {
        const leadId = lead.id as string;
        if (leadsWithMessageSet.has(leadId)) continue;

        const leadName = `${lead.first_name as string} ${lead.last_name as string}`.trim();
        const createdAt = new Date(lead.created_at as string);
        const daysOld = Math.round(daysBetween(now, createdAt));

        signalCounter++;
        signals.push({
          id: `sig-new-${signalCounter}`,
          type: "new_lead_no_outreach",
          title: "New lead awaiting outreach",
          description: `${leadName} at ${lead.company as string} was added ${daysOld} day${daysOld !== 1 ? "s" : ""} ago with no outreach`,
          leadId,
          leadName,
          company: lead.company as string,
          urgency: "medium",
          channel: "email",
          recommendedAction: `Send initial outreach to ${leadName} at ${lead.company as string}`,
          timestamp: lead.created_at as string,
          signalSource: "lead_data",
        });
      }
    }

    // ── Signal 5: Leads with upcoming next steps ─────────────────

    if (upcomingStepsResult.data) {
      for (const lead of upcomingStepsResult.data) {
        const leadName = `${lead.first_name as string} ${lead.last_name as string}`.trim();
        const stepDate = new Date(lead.next_action_date as string);
        const daysUntil = Math.round(daysBetween(stepDate, now));
        const isToday = stepDate.toDateString() === now.toDateString();

        signalCounter++;
        signals.push({
          id: `sig-step-${signalCounter}`,
          type: "scheduled_action",
          title: "Scheduled action due",
          description: `"${lead.next_action as string}" for ${leadName} is ${isToday ? "due today" : `due in ${daysUntil} day${daysUntil !== 1 ? "s" : ""}`}`,
          leadId: lead.id as string,
          leadName,
          company: lead.company as string,
          urgency: isToday ? "immediate" : "high",
          channel: "email",
          recommendedAction: `Complete: "${lead.next_action as string}" for ${leadName}`,
          timestamp: lead.next_action_date as string,
          signalSource: "lead_data",
        });
      }
    }

    // ── Sort and limit ───────────────────────────────────────────

    signals.sort((a, b) => {
      // Primary: urgency (immediate first)
      const urgencyDiff = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
      if (urgencyDiff !== 0) return urgencyDiff;

      // Secondary: timestamp (newest first)
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return NextResponse.json({ signals: signals.slice(0, 50) });
  } catch (err) {
    console.error("[signals/generate] Error:", err);
    return NextResponse.json(
      { error: "Failed to generate signals" },
      { status: 500 }
    );
  }
}
