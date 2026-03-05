import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { BALBOA_ICP_CONTEXT } from "@/lib/balboa-context";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function GET() {
  try {
    const { user, supabase, error: authError } = await getAuthUser();
    if (authError) return authError;
    const userId = user!.id;

    // ─── 1. Fetch raw data from all sources in parallel ──────────

    const [
      { data: messages, error: msgError },
      { data: conversations, error: convError },
      { data: leads, error: leadError },
      { data: touchpoints, error: tpError },
      { data: playbookMetrics, error: pmError },
      { data: playbookSummary, error: psError },
      { data: sequenceEnrollments, error: seError },
      { data: draftTemplates, error: dtError },
    ] = await Promise.all([
      // Messages: all sent and received
      supabase
        .from("messages")
        .select("id, lead_id, thread_id, channel, direction, status, sent_at, replied_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5000),

      // Conversations
      supabase
        .from("conversations")
        .select("id, lead_id, channel, message_count, last_message_direction, last_message_date, status")
        .eq("user_id", userId)
        .limit(2000),

      // Leads: ICP tiers, positions, companies
      supabase
        .from("leads")
        .select("id, first_name, last_name, company, position, icp_score, company_intel, linkedin_stage")
        .eq("user_id", userId)
        .limit(2000),

      // Touchpoint events (from webhooks: Amplemarket, HubSpot, Aircall, LinkedIn, etc.)
      supabase
        .from("touchpoint_events")
        .select("id, lead_id, source, channel, event_type, direction, sentiment, created_at, metadata")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5000),

      // Playbook metrics (individual action records with outcomes)
      supabase
        .from("playbook_metrics")
        .select("id, action_type, channel, timing_day, timing_hour, sequence_number, lead_id, reply_received, meeting_booked, deal_closed, deal_amount, days_to_reply, days_to_meeting, days_to_close, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5000),

      // Playbook metrics summary (pre-aggregated stats)
      supabase
        .from("playbook_metrics_summary")
        .select("*")
        .eq("user_id", userId),

      // Sequence enrollments (which leads are in which sequences)
      supabase
        .from("sequence_enrollments")
        .select("id, lead_id, sequence_id, sequence_name, sequence_source, current_step, total_steps, status, enrolled_at, last_step_at, completed_at, metadata")
        .eq("user_id", userId)
        .limit(2000),

      // Draft templates (email/linkedin templates with performance data)
      supabase
        .from("draft_templates")
        .select("id, template_name, channel, subject_line, body_text, avg_reply_rate, avg_meeting_rate, usage_count, created_at")
        .eq("user_id", userId),
    ]);

    if (msgError) console.error("Messages query error:", msgError);
    if (convError) console.error("Conversations query error:", convError);
    if (leadError) console.error("Leads query error:", leadError);
    if (tpError) console.error("Touchpoint events query error:", tpError);
    if (pmError) console.error("Playbook metrics query error:", pmError);
    if (psError) console.error("Playbook summary query error:", psError);
    if (seError) console.error("Sequence enrollments query error:", seError);
    if (dtError) console.error("Draft templates query error:", dtError);

    const allMessages = messages || [];
    const allConversations = conversations || [];
    const allLeads = leads || [];
    const allTouchpoints = touchpoints || [];
    const allPlaybookMetrics = playbookMetrics || [];
    const allPlaybookSummary = playbookSummary || [];
    const allSequenceEnrollments = sequenceEnrollments || [];
    const allDraftTemplates = draftTemplates || [];

    // ─── 2. Check for minimum data ─────────────────────────────────

    const totalDataPoints = allMessages.length + allTouchpoints.length + allPlaybookMetrics.length;

    if (totalDataPoints < 10) {
      return NextResponse.json({
        insufficient: true,
        message: `You have ${totalDataPoints} data points so far (${allMessages.length} messages, ${allTouchpoints.length} touchpoint events, ${allPlaybookMetrics.length} playbook metrics). Playbook Intelligence needs at least 10 data points to detect meaningful patterns. Keep sending outreach and check back soon.`,
      });
    }

    // ─── 3. Build lead map ─────────────────────────────────────────

    const leadMap: Record<string, (typeof allLeads)[0]> = {};
    for (const l of allLeads) {
      leadMap[l.id] = l;
    }

    // ─── 4. Compute message-based metrics ──────────────────────────

    const outbound = allMessages.filter((m) => m.direction === "outbound");
    const inbound = allMessages.filter((m) => m.direction === "inbound");

    // Response rate: threads where outbound was followed by inbound
    const outboundThreadIds = new Set(outbound.filter((m) => m.thread_id).map((m) => m.thread_id));
    const inboundThreadIds = new Set(inbound.filter((m) => m.thread_id).map((m) => m.thread_id));
    const repliedThreads = [...outboundThreadIds].filter((tid) => inboundThreadIds.has(tid));

    // Channel stats from messages
    const channelStats: Record<string, { sent: number; replied: number; positive: number; booked: number }> = {};
    for (const m of outbound) {
      const ch = m.channel || "unknown";
      if (!channelStats[ch]) channelStats[ch] = { sent: 0, replied: 0, positive: 0, booked: 0 };
      channelStats[ch].sent++;
    }
    for (const m of inbound) {
      if (!m.thread_id) continue;
      const origOutbound = outbound.find((o) => o.thread_id === m.thread_id);
      if (origOutbound) {
        const ch = origOutbound.channel || "unknown";
        if (channelStats[ch]) channelStats[ch].replied++;
      }
    }

    // ─── 5. Enrich channel stats with touchpoint events ────────────

    // Track touchpoint-based outbound and replies per channel
    const tpOutbound = allTouchpoints.filter((tp) => tp.direction === "outbound" || tp.event_type === "sent" || tp.event_type === "email_sent" || tp.event_type === "message_sent");
    const tpReplies = allTouchpoints.filter((tp) => tp.event_type === "replied" || tp.event_type === "email_replied" || tp.event_type === "response_received");
    const tpPositive = allTouchpoints.filter((tp) => tp.sentiment === "positive" || tp.sentiment === "interested");
    const tpMeetings = allTouchpoints.filter((tp) => tp.event_type === "meeting_booked" || tp.event_type === "demo_booked" || tp.event_type === "demo_scheduled");

    for (const tp of tpOutbound) {
      const ch = normalizeChannel(tp.channel);
      if (!channelStats[ch]) channelStats[ch] = { sent: 0, replied: 0, positive: 0, booked: 0 };
      channelStats[ch].sent++;
    }
    for (const tp of tpReplies) {
      const ch = normalizeChannel(tp.channel);
      if (channelStats[ch]) channelStats[ch].replied++;
    }
    for (const tp of tpPositive) {
      const ch = normalizeChannel(tp.channel);
      if (channelStats[ch]) channelStats[ch].positive++;
    }
    for (const tp of tpMeetings) {
      const ch = normalizeChannel(tp.channel);
      if (channelStats[ch]) channelStats[ch].booked++;
    }

    // Also enrich from playbook_metrics
    for (const pm of allPlaybookMetrics) {
      const ch = normalizeChannel(pm.channel || "unknown");
      if (!channelStats[ch]) channelStats[ch] = { sent: 0, replied: 0, positive: 0, booked: 0 };
      channelStats[ch].sent++;
      if (pm.reply_received) channelStats[ch].replied++;
      if (pm.meeting_booked) channelStats[ch].booked++;
    }

    // ─── 6. Compute timing stats (messages + touchpoints + playbook_metrics) ──

    const dayHourChannelStats: Record<string, { sent: number; replied: number }> = {};
    const dayStats: Record<string, { sent: number; replied: number }> = {};
    const hourStats: Record<number, { sent: number; replied: number }> = {};

    // Helper to record a timing datapoint
    function recordTiming(dateStr: string, channel: string, isReply: boolean) {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return;
      const day = DAYS_OF_WEEK[date.getDay()];
      const hour = date.getHours();
      const ch = normalizeChannel(channel);

      // day-hour-channel key for heatmap
      const dhcKey = `${day}-${hour}-${ch}`;
      if (!dayHourChannelStats[dhcKey]) dayHourChannelStats[dhcKey] = { sent: 0, replied: 0 };
      if (isReply) {
        dayHourChannelStats[dhcKey].replied++;
      } else {
        dayHourChannelStats[dhcKey].sent++;
      }

      // day-level
      if (!dayStats[day]) dayStats[day] = { sent: 0, replied: 0 };
      if (isReply) dayStats[day].replied++;
      else dayStats[day].sent++;

      // hour-level
      if (!hourStats[hour]) hourStats[hour] = { sent: 0, replied: 0 };
      if (isReply) hourStats[hour].replied++;
      else hourStats[hour].sent++;
    }

    // From messages
    for (const m of outbound) {
      recordTiming(m.sent_at || m.created_at, m.channel || "email", false);
    }
    for (const m of inbound) {
      if (!m.thread_id) continue;
      const origOutbound = outbound.find((o) => o.thread_id === m.thread_id);
      if (!origOutbound) continue;
      recordTiming(origOutbound.sent_at || origOutbound.created_at, origOutbound.channel || "email", true);
    }

    // From touchpoints
    for (const tp of tpOutbound) {
      recordTiming(tp.created_at, tp.channel, false);
    }
    for (const tp of tpReplies) {
      recordTiming(tp.created_at, tp.channel, true);
    }

    // From playbook_metrics (use timing_day and timing_hour if available)
    for (const pm of allPlaybookMetrics) {
      if (pm.timing_day && pm.timing_hour !== null && pm.timing_hour !== undefined) {
        const ch = normalizeChannel(pm.channel || "email");
        const dhcKey = `${pm.timing_day}-${pm.timing_hour}-${ch}`;
        if (!dayHourChannelStats[dhcKey]) dayHourChannelStats[dhcKey] = { sent: 0, replied: 0 };
        dayHourChannelStats[dhcKey].sent++;
        if (pm.reply_received) dayHourChannelStats[dhcKey].replied++;

        if (!dayStats[pm.timing_day]) dayStats[pm.timing_day] = { sent: 0, replied: 0 };
        dayStats[pm.timing_day].sent++;
        if (pm.reply_received) dayStats[pm.timing_day].replied++;

        if (!hourStats[pm.timing_hour]) hourStats[pm.timing_hour] = { sent: 0, replied: 0 };
        hourStats[pm.timing_hour].sent++;
        if (pm.reply_received) hourStats[pm.timing_hour].replied++;
      }
    }

    // Also blend in playbook_metrics_summary timing data
    for (const ps of allPlaybookSummary) {
      if (ps.timing_day && ps.timing_hour !== null && ps.timing_hour !== undefined && ps.sample_size) {
        const ch = normalizeChannel(ps.channel || "email");
        const dhcKey = `${ps.timing_day}-${ps.timing_hour}-${ch}`;
        if (!dayHourChannelStats[dhcKey]) dayHourChannelStats[dhcKey] = { sent: 0, replied: 0 };
        dayHourChannelStats[dhcKey].sent += ps.sample_size;
        dayHourChannelStats[dhcKey].replied += Math.round((ps.reply_rate || 0) * ps.sample_size);
      }
    }

    // ─── 7. Per-persona stats (messages + touchpoints + playbook_metrics) ──

    // Build a lead_id -> persona map
    function getPersonaForLeadId(leadId: string | null | undefined): string {
      if (!leadId) return "Unknown";
      const lead = leadMap[leadId];
      return normalizePosition(lead?.position || "Unknown");
    }

    // Per-persona stats: { sent, replied, booked, byChannel: { ch: {sent, replied} }, hours: { h: {sent, replied} } }
    interface PersonaStats {
      sent: number;
      replied: number;
      booked: number;
      totalResponseTimeDays: number;
      responseCount: number;
      byChannel: Record<string, { sent: number; replied: number }>;
      hours: Record<number, { sent: number; replied: number }>;
    }
    const personaStatsMap: Record<string, PersonaStats> = {};

    function ensurePersona(persona: string): PersonaStats {
      if (!personaStatsMap[persona]) {
        personaStatsMap[persona] = { sent: 0, replied: 0, booked: 0, totalResponseTimeDays: 0, responseCount: 0, byChannel: {}, hours: {} };
      }
      return personaStatsMap[persona];
    }

    // From messages
    for (const m of outbound) {
      const persona = getPersonaForLeadId(m.lead_id);
      const ps = ensurePersona(persona);
      ps.sent++;
      const ch = normalizeChannel(m.channel || "email");
      if (!ps.byChannel[ch]) ps.byChannel[ch] = { sent: 0, replied: 0 };
      ps.byChannel[ch].sent++;
      const hour = new Date(m.sent_at || m.created_at).getHours();
      if (!isNaN(hour)) {
        if (!ps.hours[hour]) ps.hours[hour] = { sent: 0, replied: 0 };
        ps.hours[hour].sent++;
      }
    }
    for (const m of inbound) {
      if (!m.thread_id) continue;
      const origOutbound = outbound.find((o) => o.thread_id === m.thread_id);
      if (!origOutbound) continue;
      const persona = getPersonaForLeadId(origOutbound.lead_id);
      const ps = ensurePersona(persona);
      ps.replied++;
      const ch = normalizeChannel(origOutbound.channel || "email");
      if (ps.byChannel[ch]) ps.byChannel[ch].replied++;
      const hour = new Date(origOutbound.sent_at || origOutbound.created_at).getHours();
      if (!isNaN(hour) && ps.hours[hour]) ps.hours[hour].replied++;

      // Response time
      const sentDate = new Date(origOutbound.sent_at || origOutbound.created_at);
      const replyDate = new Date(m.created_at);
      const diffDays = (replyDate.getTime() - sentDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays >= 0 && diffDays < 60) {
        ps.totalResponseTimeDays += diffDays;
        ps.responseCount++;
      }
    }

    // From touchpoints
    for (const tp of tpOutbound) {
      const persona = getPersonaForLeadId(tp.lead_id);
      const ps = ensurePersona(persona);
      ps.sent++;
      const ch = normalizeChannel(tp.channel);
      if (!ps.byChannel[ch]) ps.byChannel[ch] = { sent: 0, replied: 0 };
      ps.byChannel[ch].sent++;
    }
    for (const tp of tpReplies) {
      const persona = getPersonaForLeadId(tp.lead_id);
      const ps = ensurePersona(persona);
      ps.replied++;
      const ch = normalizeChannel(tp.channel);
      if (ps.byChannel[ch]) ps.byChannel[ch].replied++;
    }
    for (const tp of tpMeetings) {
      const persona = getPersonaForLeadId(tp.lead_id);
      const ps = ensurePersona(persona);
      ps.booked++;
    }

    // From playbook_metrics
    for (const pm of allPlaybookMetrics) {
      const persona = getPersonaForLeadId(pm.lead_id);
      const ps = ensurePersona(persona);
      ps.sent++;
      if (pm.reply_received) ps.replied++;
      if (pm.meeting_booked) ps.booked++;
      if (pm.days_to_reply && pm.days_to_reply > 0) {
        ps.totalResponseTimeDays += pm.days_to_reply;
        ps.responseCount++;
      }
      const ch = normalizeChannel(pm.channel || "email");
      if (!ps.byChannel[ch]) ps.byChannel[ch] = { sent: 0, replied: 0 };
      ps.byChannel[ch].sent++;
      if (pm.reply_received) ps.byChannel[ch].replied++;
    }

    // ─── 8. ICP tier stats ─────────────────────────────────────────

    const tierStats: Record<string, { sent: number; replied: number }> = {};
    for (const m of outbound) {
      if (!m.lead_id) continue;
      const lead = leadMap[m.lead_id];
      const tier = (lead?.icp_score as { tier?: string } | null)?.tier || "unknown";
      if (!tierStats[tier]) tierStats[tier] = { sent: 0, replied: 0 };
      tierStats[tier].sent++;
    }
    for (const m of inbound) {
      if (!m.thread_id || !m.lead_id) continue;
      const origOutbound = outbound.find((o) => o.thread_id === m.thread_id);
      if (!origOutbound || !origOutbound.lead_id) continue;
      const lead = leadMap[origOutbound.lead_id];
      const tier = (lead?.icp_score as { tier?: string } | null)?.tier || "unknown";
      if (tierStats[tier]) tierStats[tier].replied++;
    }

    // ─── 9. Average response time (global) ─────────────────────────

    let totalResponseTimeDays = 0;
    let responseCount = 0;
    for (const m of inbound) {
      if (!m.thread_id) continue;
      const origOutbound = outbound.find((o) => o.thread_id === m.thread_id);
      if (!origOutbound) continue;
      const sentDate = new Date(origOutbound.sent_at || origOutbound.created_at);
      const replyDate = new Date(m.created_at);
      const diffDays = (replyDate.getTime() - sentDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays >= 0 && diffDays < 60) {
        totalResponseTimeDays += diffDays;
        responseCount++;
      }
    }
    // Also include from playbook_metrics
    for (const pm of allPlaybookMetrics) {
      if (pm.days_to_reply && pm.days_to_reply > 0 && pm.days_to_reply < 60) {
        totalResponseTimeDays += pm.days_to_reply;
        responseCount++;
      }
    }
    const avgResponseTimeDays = responseCount > 0
      ? Math.round((totalResponseTimeDays / responseCount) * 10) / 10
      : 0;

    // ─── 10. Overall response rate ─────────────────────────────────

    const totalSent = Object.values(channelStats).reduce((s, c) => s + c.sent, 0);
    const totalReplied = Object.values(channelStats).reduce((s, c) => s + c.replied, 0);
    const overallResponseRate = totalSent > 0
      ? Math.round((totalReplied / totalSent) * 100)
      : 0;

    // ─── 11. Build timing heatmap (per channel) ────────────────────

    const timingHeatmap = Object.entries(dayHourChannelStats)
      .map(([key, stats]) => {
        const parts = key.split("-");
        const ch = parts.pop() as string;
        const hourStr = parts.pop() as string;
        const day = parts.join("-"); // handles edge case
        const hour = parseInt(hourStr, 10);
        const hourSlot = getHourSlotLabel(hour);
        return {
          slot: `${day} ${hourSlot}`,
          channel: (ch === "linkedin" ? "linkedin" : "email") as "linkedin" | "email",
          openRate: 0,
          replyRate: stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0,
          sampleSize: stats.sent,
          recommendation: "",
        };
      })
      .filter((t) => t.sampleSize >= 2)
      .sort((a, b) => b.replyRate - a.replyRate);

    // ─── 12. Build channel metrics ─────────────────────────────────

    const channelMetrics = Object.entries(channelStats).map(([channel, stats]) => ({
      id: `cm-${channel}`,
      channel: channel as "linkedin" | "email" | "call",
      messageType: "all",
      totalSent: stats.sent,
      delivered: stats.sent,
      opened: 0,
      replied: stats.replied,
      positiveReplied: stats.positive,
      booked: stats.booked,
      openRate: 0,
      replyRate: stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0,
      positiveReplyRate: stats.sent > 0 ? Math.round((stats.positive / stats.sent) * 100) : 0,
      bookingRate: stats.sent > 0 ? Math.round((stats.booked / stats.sent) * 100) : 0,
      avgResponseTimeHours: avgResponseTimeDays * 24,
      period: "all" as const,
      segmentLabel: `${channel} - all messages`,
    }));

    // ─── 13. Build persona breakdown ───────────────────────────────

    const personaBreakdown = Object.entries(personaStatsMap)
      .filter(([, stats]) => stats.sent >= 2)
      .map(([persona, stats]) => {
        const replyRate = stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0;
        const personaAvgReplyTime = stats.responseCount > 0
          ? Math.round((stats.totalResponseTimeDays / stats.responseCount) * 10) / 10
          : avgResponseTimeDays;

        // Find best channel for this persona
        let bestChannel = "email";
        let bestChannelRate = 0;
        for (const [ch, chStats] of Object.entries(stats.byChannel)) {
          const rate = chStats.sent > 0 ? chStats.replied / chStats.sent : 0;
          if (rate > bestChannelRate || (rate === bestChannelRate && chStats.sent > (stats.byChannel[bestChannel]?.sent || 0))) {
            bestChannelRate = rate;
            bestChannel = ch;
          }
        }

        // Find best hour for this persona
        let bestHour = 9;
        let bestHourRate = 0;
        for (const [hour, hStats] of Object.entries(stats.hours)) {
          if (hStats.sent < 2) continue;
          const rate = hStats.replied / hStats.sent;
          if (rate > bestHourRate) {
            bestHourRate = rate;
            bestHour = parseInt(hour, 10);
          }
        }

        // Demo conversion rate for this persona
        const demoRate = stats.sent > 0 ? Math.round((stats.booked / stats.sent) * 100) : 0;

        // Champion scoring
        const isChampion = persona.toLowerCase().includes("procurement")
          || persona.toLowerCase().includes("supply chain")
          || persona.toLowerCase().includes("operations");
        const championScore = Math.min(100, Math.round(
          (replyRate * 0.4) + (demoRate * 3) + (isChampion ? 30 : 0) + (stats.sent >= 10 ? 10 : 0)
        ));

        return {
          persona,
          totalContacted: stats.sent,
          responseRate: replyRate,
          avgResponseTimeDays: personaAvgReplyTime,
          bestChannel: (bestChannel || "email") as "linkedin" | "email" | "call",
          bestMessageType: "cold_outreach",
          bestTimeOfDay: formatHour(bestHour),
          topOpeningLines: [] as string[],
          conversionToDemo: demoRate,
          isChampionMaterial: isChampion || championScore >= 60,
          championScore,
        };
      })
      .sort((a, b) => b.responseRate - a.responseRate);

    // ─── 14. Build template rankings ───────────────────────────────

    const templateRankings = allDraftTemplates
      .filter((t) => (t.usage_count || 0) > 0)
      .map((t) => {
        // Find the best persona from playbook metrics summary for this channel
        const channelSummary = allPlaybookSummary.filter((s) => s.channel === t.channel);
        const bestPersonaSummary = channelSummary.sort((a, b) => (b.reply_rate || 0) - (a.reply_rate || 0))[0];
        const bestTimingSummary = channelSummary.sort((a, b) => (b.reply_rate || 0) - (a.reply_rate || 0))[0];

        return {
          templateId: t.id,
          templateName: t.template_name || "Untitled Template",
          channel: (t.channel === "linkedin" ? "linkedin" : "email") as "linkedin" | "email",
          totalSent: t.usage_count || 0,
          openRate: 0,
          replyRate: Math.round((t.avg_reply_rate || 0) * 100),
          positiveReplyRate: 0,
          avgReplyTimeDays: avgResponseTimeDays,
          bestPersona: bestPersonaSummary?.lead_tier || personaBreakdown[0]?.persona || "N/A",
          bestIndustry: "N/A",
          bestTimeSlot: bestTimingSummary?.timing_day
            ? `${bestTimingSummary.timing_day} ${formatHour(bestTimingSummary.timing_hour || 10)}`
            : getBestHour(hourStats),
          sampleResponses: [] as string[],
        };
      })
      .sort((a, b) => b.replyRate - a.replyRate);

    // ─── 15. Sequence stage conversion rates ───────────────────────

    const sequenceStats: Record<string, { enrolled: number; completed: number; replied: number; name: string }> = {};
    for (const se of allSequenceEnrollments) {
      if (!sequenceStats[se.sequence_id]) {
        sequenceStats[se.sequence_id] = { enrolled: 0, completed: 0, replied: 0, name: se.sequence_name };
      }
      sequenceStats[se.sequence_id].enrolled++;
      if (se.status === "completed") sequenceStats[se.sequence_id].completed++;
      if (se.status === "replied") sequenceStats[se.sequence_id].replied++;
    }

    // ─── 16. Sentiment breakdown from touchpoints ──────────────────

    const sentimentBreakdown: Record<string, number> = {};
    for (const tp of allTouchpoints) {
      if (tp.sentiment) {
        sentimentBreakdown[tp.sentiment] = (sentimentBreakdown[tp.sentiment] || 0) + 1;
      }
    }

    // ─── 17. Build overall stats ───────────────────────────────────

    const bestChannel = Object.entries(channelStats)
      .filter(([ch]) => ch !== "unknown")
      .sort((a, b) => {
        const rateA = a[1].sent > 0 ? a[1].replied / a[1].sent : 0;
        const rateB = b[1].sent > 0 ? b[1].replied / b[1].sent : 0;
        return rateB - rateA;
      })[0];

    const bestPersona = personaBreakdown.length > 0 ? personaBreakdown[0].persona : "N/A";

    // ─── 18. Call Claude for natural language insights ──────────────

    const metricsContext = `
## Raw Outreach Metrics

Total messages: ${allMessages.length}
Outbound: ${outbound.length}
Inbound (replies): ${inbound.length}
Overall response rate: ${overallResponseRate}%
Average response time: ${avgResponseTimeDays} days
Total touchpoint events: ${allTouchpoints.length}
Total playbook metrics records: ${allPlaybookMetrics.length}

### By Channel (combined from all sources)
${Object.entries(channelStats).map(([ch, s]) =>
  `- ${ch}: ${s.sent} sent, ${s.replied} replies (${s.sent > 0 ? Math.round((s.replied / s.sent) * 100) : 0}% reply rate), ${s.positive} positive, ${s.booked} meetings booked`
).join("\n")}

### By Day of Week
${Object.entries(dayStats).map(([day, s]) =>
  `- ${day}: ${s.sent} sent, ${s.replied} replies (${s.sent > 0 ? Math.round((s.replied / s.sent) * 100) : 0}% reply rate)`
).join("\n")}

### By Hour
${Object.entries(hourStats)
  .sort(([a], [b]) => parseInt(a) - parseInt(b))
  .map(([hour, s]) =>
    `- ${hour}:00: ${s.sent} sent, ${s.replied} replies (${s.sent > 0 ? Math.round((s.replied / s.sent) * 100) : 0}% reply rate)`
  ).join("\n")}

### By ICP Tier
${Object.entries(tierStats).map(([tier, s]) =>
  `- ${tier}: ${s.sent} sent, ${s.replied} replies (${s.sent > 0 ? Math.round((s.replied / s.sent) * 100) : 0}% reply rate)`
).join("\n")}

### By Persona (Position)
${Object.entries(personaStatsMap)
  .filter(([, s]) => s.sent >= 2)
  .map(([persona, s]) =>
    `- ${persona}: ${s.sent} sent, ${s.replied} replies (${s.sent > 0 ? Math.round((s.replied / s.sent) * 100) : 0}% reply rate), ${s.booked} meetings booked`
  ).join("\n")}

### Touchpoint Sentiment
${Object.entries(sentimentBreakdown).map(([k, v]) => `- ${k}: ${v}`).join("\n") || "No sentiment data yet"}

### Touchpoint Events by Source
${(() => {
  const tpBySource: Record<string, number> = {};
  for (const tp of allTouchpoints) { tpBySource[tp.source] = (tpBySource[tp.source] || 0) + 1; }
  return Object.entries(tpBySource).map(([k, v]) => `- ${k}: ${v}`).join("\n") || "No data";
})()}

### Touchpoint Events by Type
${(() => {
  const tpByType: Record<string, number> = {};
  for (const tp of allTouchpoints) { tpByType[tp.event_type] = (tpByType[tp.event_type] || 0) + 1; }
  return Object.entries(tpByType).map(([k, v]) => `- ${k}: ${v}`).join("\n") || "No data";
})()}

### Sequence Enrollments
Total sequences: ${Object.keys(sequenceStats).length}
${Object.entries(sequenceStats).map(([, s]) =>
  `- "${s.name}": ${s.enrolled} enrolled, ${s.completed} completed, ${s.replied} replied (${s.enrolled > 0 ? Math.round(((s.completed + s.replied) / s.enrolled) * 100) : 0}% conversion)`
).join("\n") || "No sequence data yet"}

### Templates
${allDraftTemplates.filter(t => (t.usage_count || 0) > 0).map((t) =>
  `- "${t.template_name}" (${t.channel}): used ${t.usage_count}x, ${Math.round((t.avg_reply_rate || 0) * 100)}% reply rate`
).join("\n") || "No template data yet"}

### Playbook Metrics Summary (from aggregated action_events)
${allPlaybookSummary.length > 0
  ? allPlaybookSummary.slice(0, 20).map((s) =>
      `- ${s.action_type} via ${s.channel || 'unknown'} (${s.timing_day || 'any day'} ${s.timing_hour !== null ? s.timing_hour + ':00' : 'any hour'}): ${Math.round((s.reply_rate || 0) * 100)}% reply, ${Math.round((s.meeting_rate || 0) * 100)}% meeting, n=${s.sample_size}`
    ).join("\n")
  : "No summary data yet"
}

### Lead Pool
Total leads: ${allLeads.length}
Total conversations: ${allConversations.length}
`;

    const insightsPrompt = `${BALBOA_ICP_CONTEXT}

## YOUR TASK
Analyze the following real outreach performance data for a Balboa sales team member. Generate 3-5 actionable insights based on the patterns you see in the data.

Each insight should be:
- Based on actual data patterns (not generic advice)
- Actionable (the rep can implement it today)
- Specific to their outreach performance
- Tied to a concrete metric

${metricsContext}

You MUST respond with ONLY valid JSON (no markdown, no code fences):
[
  {
    "id": "<unique id>",
    "category": "<messaging|timing|persona|channel|demo|call_script|opener>",
    "title": "<short insight title, max 8 words>",
    "description": "<2-3 sentence actionable description>",
    "metric": "<which metric this relates to>",
    "confidence": "<high|medium|low>",
    "sampleSize": <number of data points backing this>,
    "dataSource": "outreach_analytics",
    "actionable": "<one concrete next step>",
    "tags": ["<tag1>", "<tag2>"],
    "trend": "<improving|stable|declining>",
    "discoveredAt": "${new Date().toISOString()}"
  }
]

IMPORTANT:
- Only generate insights supported by the data
- If the data is sparse, acknowledge uncertainty in confidence level
- Include both positive patterns (what's working) and areas for improvement
- Be specific with numbers from the data
- Reference touchpoint events, sequence data, and template performance where relevant`;

    let topInsights = [];
    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{ role: "user", content: insightsPrompt }],
      });

      const rawText = response.content[0].type === "text" ? response.content[0].text : "";
      let jsonStr = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, "");
      const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (jsonMatch) jsonStr = jsonMatch[0];
      jsonStr = jsonStr.trim();

      try {
        topInsights = JSON.parse(jsonStr);
      } catch {
        console.error("Failed to parse insights JSON:", rawText);
        topInsights = [{
          id: "insight-fallback-1",
          category: "channel",
          title: "Outreach data is accumulating",
          description: `You have ${totalDataPoints} total data points with a ${overallResponseRate}% response rate across ${Object.keys(channelStats).length} channels. As more data comes in, deeper patterns will emerge.`,
          metric: "response_rate",
          confidence: "low",
          sampleSize: totalDataPoints,
          dataSource: "outreach_analytics",
          actionable: "Continue outreach to build a statistically significant dataset.",
          tags: ["data_collection"],
          trend: "stable",
          discoveredAt: new Date().toISOString(),
        }];
      }
    } catch (aiError) {
      console.error("Claude insights generation error:", aiError);
      topInsights = [{
        id: "insight-fallback-1",
        category: "channel",
        title: "Outreach data collected",
        description: `${totalDataPoints} data points across ${Object.keys(channelStats).length} channels. ${overallResponseRate}% overall response rate.`,
        metric: "response_rate",
        confidence: "medium",
        sampleSize: totalDataPoints,
        dataSource: "outreach_analytics",
        actionable: "Review channel breakdown to identify your best performing outreach method.",
        tags: ["overview"],
        trend: "stable",
        discoveredAt: new Date().toISOString(),
      }];
    }

    // ─── 19. Build pattern insights from sequence data ─────────────

    const patternInsights = Object.entries(sequenceStats)
      .filter(([, s]) => s.enrolled >= 3)
      .map(([seqId, s]) => {
        const conversionRate = s.enrolled > 0 ? (s.completed + s.replied) / s.enrolled : 0;
        return {
          id: `pattern-seq-${seqId}`,
          pattern: `Sequence "${s.name}" has a ${Math.round(conversionRate * 100)}% conversion rate`,
          impact: conversionRate >= 0.3 ? "high" as const : conversionRate >= 0.15 ? "medium" as const : "low" as const,
          direction: conversionRate >= 0.2 ? "positive" as const : "neutral" as const,
          metric: "sequence_conversion",
          baseline: 20,
          observed: Math.round(conversionRate * 100),
          lift: Math.round((conversionRate * 100) - 20),
          sampleSize: s.enrolled,
          confidence: s.enrolled >= 10 ? 0.8 : s.enrolled >= 5 ? 0.5 : 0.3,
          recommendation: conversionRate >= 0.3
            ? `"${s.name}" is performing well. Consider enrolling more leads.`
            : `"${s.name}" may need optimization. Review messaging at each step.`,
          relatedPersonas: [] as string[],
          relatedChannels: [] as ("linkedin" | "email" | "call")[],
          discoveredAt: new Date().toISOString(),
        };
      });

    // ─── 20. Assemble response ─────────────────────────────────────

    const result = {
      topInsights,
      personaBreakdown,
      templateRankings,
      timingHeatmap: timingHeatmap.slice(0, 100),
      outreachMetrics: channelMetrics,
      patternInsights,
      overallStats: {
        totalOutreachActions: totalSent,
        avgResponseRate: overallResponseRate,
        bestPerformingChannel: bestChannel?.[0] || "N/A",
        bestPerformingPersona: bestPersona,
        bestPerformingOpener: "N/A",
        topChampionPersona: personaBreakdown.find((p) => p.isChampionMaterial)?.persona || "N/A",
        insightsGenerated: topInsights.length,
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Playbook analyze error:", error);
    return NextResponse.json(
      { error: "Failed to analyze playbook data" },
      { status: 500 }
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function normalizeChannel(channel: string): string {
  const lower = (channel || "").toLowerCase().trim();
  if (lower.includes("linkedin")) return "linkedin";
  if (lower.includes("email") || lower.includes("mail")) return "email";
  if (lower.includes("call") || lower.includes("phone") || lower.includes("aircall")) return "call";
  return lower || "unknown";
}

function normalizePosition(position: string): string {
  const lower = position.toLowerCase();
  if (lower.includes("ceo") || lower.includes("chief executive")) return "CEO";
  if (lower.includes("coo") || lower.includes("chief operating")) return "COO";
  if (lower.includes("cfo") || lower.includes("chief financial") || lower.includes("controller")) return "CFO";
  if (lower.includes("cio") || lower.includes("cto") || lower.includes("chief technology") || lower.includes("chief information")) return "CIO/CTO";
  if (lower.includes("procurement") || lower.includes("purchasing") || lower.includes("sourcing")) return "VP Procurement";
  if (lower.includes("supply chain") || lower.includes("logistics") || lower.includes("scm")) return "VP Supply Chain";
  if (lower.includes("operations") || lower.includes("ops")) return "VP Operations";
  if (lower.includes("import") || lower.includes("trade")) return "Import/Trade Manager";
  if (lower.includes("director")) return "Director";
  if (lower.includes("vp") || lower.includes("vice president")) return "VP";
  if (lower.includes("manager")) return "Manager";
  return "Other";
}

function formatHour(hour: number): string {
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:00 ${ampm}`;
}

function getHourSlotLabel(hour: number): string {
  return `${hour}:00`;
}

function getBestHour(hourStats: Record<number, { sent: number; replied: number }>): string {
  let bestHour = 9;
  let bestRate = 0;
  for (const [hour, stats] of Object.entries(hourStats)) {
    if (stats.sent < 2) continue;
    const rate = stats.replied / stats.sent;
    if (rate > bestRate) {
      bestRate = rate;
      bestHour = parseInt(hour, 10);
    }
  }
  return formatHour(bestHour);
}
