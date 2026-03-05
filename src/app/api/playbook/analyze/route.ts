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

    // ─── 1. Fetch raw data from Supabase ───────────────────────────

    // Messages: all sent and received
    const { data: messages, error: msgError } = await supabase
      .from("messages")
      .select("id, lead_id, thread_id, channel, direction, status, sent_at, replied_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (msgError) {
      console.error("Messages query error:", msgError);
    }

    // Conversations
    const { data: conversations, error: convError } = await supabase
      .from("conversations")
      .select("id, lead_id, channel, message_count, last_message_direction, last_message_date, status")
      .eq("user_id", userId)
      .limit(2000);

    if (convError) {
      console.error("Conversations query error:", convError);
    }

    // Leads: ICP tiers, positions, companies
    const { data: leads, error: leadError } = await supabase
      .from("leads")
      .select("id, first_name, last_name, company, position, icp_score, company_intel, linkedin_stage")
      .eq("user_id", userId)
      .limit(2000);

    if (leadError) {
      console.error("Leads query error:", leadError);
    }

    // Touchpoint events (from webhooks: Amplemarket, HubSpot, Aircall, LinkedIn, etc.)
    const { data: touchpoints, error: tpError } = await supabase
      .from("touchpoint_events")
      .select("id, lead_id, source, channel, event_type, direction, sentiment, created_at, metadata")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (tpError) {
      console.error("Touchpoint events query error:", tpError);
    }

    const allMessages = messages || [];
    const allConversations = conversations || [];
    const allLeads = leads || [];
    const allTouchpoints = touchpoints || [];

    // ─── 2. Check for minimum data ─────────────────────────────────

    // Include touchpoints in the total count
    const totalDataPoints = allMessages.length + allTouchpoints.length;

    if (totalDataPoints < 10) {
      return NextResponse.json({
        insufficient: true,
        message: `You have ${totalDataPoints} data points so far (${allMessages.length} messages, ${allTouchpoints.length} touchpoint events). Playbook Intelligence needs at least 10 data points to detect meaningful patterns. Keep sending outreach and check back soon.`,
      });
    }

    // ─── 3. Compute raw metrics ────────────────────────────────────

    const outbound = allMessages.filter((m) => m.direction === "outbound");
    const inbound = allMessages.filter((m) => m.direction === "inbound");

    // Response rate: threads where outbound was followed by inbound
    const outboundThreadIds = new Set(outbound.filter((m) => m.thread_id).map((m) => m.thread_id));
    const inboundThreadIds = new Set(inbound.filter((m) => m.thread_id).map((m) => m.thread_id));
    const repliedThreads = [...outboundThreadIds].filter((tid) => inboundThreadIds.has(tid));
    const overallResponseRate = outboundThreadIds.size > 0
      ? Math.round((repliedThreads.length / outboundThreadIds.size) * 100)
      : 0;

    // By channel
    const channelStats: Record<string, { sent: number; replied: number }> = {};
    for (const m of outbound) {
      const ch = m.channel || "unknown";
      if (!channelStats[ch]) channelStats[ch] = { sent: 0, replied: 0 };
      channelStats[ch].sent++;
    }
    // Count replies per channel
    for (const m of inbound) {
      if (!m.thread_id) continue;
      // Find original outbound channel for this thread
      const origOutbound = outbound.find((o) => o.thread_id === m.thread_id);
      if (origOutbound) {
        const ch = origOutbound.channel || "unknown";
        if (channelStats[ch]) channelStats[ch].replied++;
      }
    }

    // By day of week and hour
    const dayHourStats: Record<string, { sent: number; replied: number }> = {};
    const dayStats: Record<string, { sent: number; replied: number }> = {};
    const hourStats: Record<number, { sent: number; replied: number }> = {};

    for (const m of outbound) {
      const date = new Date(m.sent_at || m.created_at);
      const day = DAYS_OF_WEEK[date.getDay()];
      const hour = date.getHours();
      const key = `${day}-${hour}`;

      if (!dayHourStats[key]) dayHourStats[key] = { sent: 0, replied: 0 };
      dayHourStats[key].sent++;

      if (!dayStats[day]) dayStats[day] = { sent: 0, replied: 0 };
      dayStats[day].sent++;

      if (!hourStats[hour]) hourStats[hour] = { sent: 0, replied: 0 };
      hourStats[hour].sent++;
    }

    // Mark replies
    for (const m of inbound) {
      if (!m.thread_id) continue;
      const origOutbound = outbound.find((o) => o.thread_id === m.thread_id);
      if (!origOutbound) continue;
      const origDate = new Date(origOutbound.sent_at || origOutbound.created_at);
      const day = DAYS_OF_WEEK[origDate.getDay()];
      const hour = origDate.getHours();
      const key = `${day}-${hour}`;

      if (dayHourStats[key]) dayHourStats[key].replied++;
      if (dayStats[day]) dayStats[day].replied++;
      if (hourStats[hour]) hourStats[hour].replied++;
    }

    // By ICP tier
    const leadMap: Record<string, typeof allLeads[0]> = {};
    for (const l of allLeads) {
      leadMap[l.id] = l;
    }

    const tierStats: Record<string, { sent: number; replied: number }> = {};
    for (const m of outbound) {
      if (!m.lead_id) continue;
      const lead = leadMap[m.lead_id];
      const tier = lead?.icp_score?.tier || "unknown";
      if (!tierStats[tier]) tierStats[tier] = { sent: 0, replied: 0 };
      tierStats[tier].sent++;
    }
    for (const m of inbound) {
      if (!m.thread_id || !m.lead_id) continue;
      const origOutbound = outbound.find((o) => o.thread_id === m.thread_id);
      if (!origOutbound || !origOutbound.lead_id) continue;
      const lead = leadMap[origOutbound.lead_id];
      const tier = lead?.icp_score?.tier || "unknown";
      if (tierStats[tier]) tierStats[tier].replied++;
    }

    // Average response time (days)
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
    const avgResponseTimeDays = responseCount > 0
      ? Math.round((totalResponseTimeDays / responseCount) * 10) / 10
      : 0;

    // Position stats
    const positionStats: Record<string, { sent: number; replied: number }> = {};
    for (const m of outbound) {
      if (!m.lead_id) continue;
      const lead = leadMap[m.lead_id];
      const position = lead?.position || "Unknown";
      // Normalize position to persona bucket
      const persona = normalizePosition(position);
      if (!positionStats[persona]) positionStats[persona] = { sent: 0, replied: 0 };
      positionStats[persona].sent++;
    }
    for (const m of inbound) {
      if (!m.thread_id || !m.lead_id) continue;
      const origOutbound = outbound.find((o) => o.thread_id === m.thread_id);
      if (!origOutbound || !origOutbound.lead_id) continue;
      const lead = leadMap[origOutbound.lead_id];
      const persona = normalizePosition(lead?.position || "Unknown");
      if (positionStats[persona]) positionStats[persona].replied++;
    }

    // ─── 4. Build timing heatmap ───────────────────────────────────

    const timingHeatmap = Object.entries(dayHourStats).map(([key, stats]) => {
      const [day, hourStr] = key.split("-");
      const hour = parseInt(hourStr, 10);
      // Find channel with most sent in this slot (simplified)
      return {
        slot: `${day} ${hour}:00`,
        channel: "email" as const,
        openRate: 0, // not tracked at message level
        replyRate: stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0,
        sampleSize: stats.sent,
        recommendation: "",
      };
    }).filter((t) => t.sampleSize >= 2)
      .sort((a, b) => b.replyRate - a.replyRate);

    // ─── 5. Build channel metrics ──────────────────────────────────

    const channelMetrics = Object.entries(channelStats).map(([channel, stats]) => ({
      id: `cm-${channel}`,
      channel: channel as "linkedin" | "email" | "call",
      messageType: "all",
      totalSent: stats.sent,
      delivered: stats.sent,
      opened: 0,
      replied: stats.replied,
      positiveReplied: 0,
      booked: 0,
      openRate: 0,
      replyRate: stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0,
      positiveReplyRate: 0,
      bookingRate: 0,
      avgResponseTimeHours: avgResponseTimeDays * 24,
      period: "all" as const,
      segmentLabel: `${channel} - all messages`,
    }));

    // ─── 6. Build persona breakdown ────────────────────────────────

    const personaBreakdown = Object.entries(positionStats)
      .filter(([, stats]) => stats.sent >= 2)
      .map(([persona, stats]) => {
        const replyRate = stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0;
        // Find best channel for this persona
        const bestCh = Object.entries(channelStats)
          .sort((a, b) => {
            const rateA = a[1].sent > 0 ? a[1].replied / a[1].sent : 0;
            const rateB = b[1].sent > 0 ? b[1].replied / b[1].sent : 0;
            return rateB - rateA;
          })[0];

        return {
          persona,
          totalContacted: stats.sent,
          responseRate: replyRate,
          avgResponseTimeDays,
          bestChannel: (bestCh?.[0] || "email") as "linkedin" | "email" | "call",
          bestMessageType: "cold_outreach",
          bestTimeOfDay: getBestHour(hourStats),
          topOpeningLines: [],
          conversionToDemo: 0,
          isChampionMaterial: persona.toLowerCase().includes("procurement") || persona.toLowerCase().includes("supply chain"),
          championScore: persona.toLowerCase().includes("procurement") || persona.toLowerCase().includes("supply chain") ? 80 : 40,
        };
      })
      .sort((a, b) => b.responseRate - a.responseRate);

    // ─── 7. Build overall stats ────────────────────────────────────

    const bestChannel = Object.entries(channelStats)
      .sort((a, b) => {
        const rateA = a[1].sent > 0 ? a[1].replied / a[1].sent : 0;
        const rateB = b[1].sent > 0 ? b[1].replied / b[1].sent : 0;
        return rateB - rateA;
      })[0];

    const bestPersona = personaBreakdown.length > 0 ? personaBreakdown[0].persona : "N/A";

    // ─── 8. Call Claude for natural language insights ───────────────

    const metricsContext = `
## Raw Outreach Metrics

Total messages: ${allMessages.length}
Outbound: ${outbound.length}
Inbound (replies): ${inbound.length}
Unique threads with outbound: ${outboundThreadIds.size}
Threads that got a reply: ${repliedThreads.length}
Overall response rate: ${overallResponseRate}%
Average response time: ${avgResponseTimeDays} days

### By Channel
${Object.entries(channelStats).map(([ch, s]) =>
  `- ${ch}: ${s.sent} sent, ${s.replied} replies (${s.sent > 0 ? Math.round((s.replied / s.sent) * 100) : 0}% reply rate)`
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
${Object.entries(positionStats)
  .filter(([, s]) => s.sent >= 2)
  .map(([persona, s]) =>
    `- ${persona}: ${s.sent} sent, ${s.replied} replies (${s.sent > 0 ? Math.round((s.replied / s.sent) * 100) : 0}% reply rate)`
  ).join("\n")}

### Lead Pool
Total leads: ${allLeads.length}
Total conversations: ${allConversations.length}

### Touchpoint Events (from integrations)
Total touchpoint events: ${allTouchpoints.length}
${(() => {
  const tpBySource: Record<string, number> = {};
  const tpByChannel: Record<string, number> = {};
  const tpByType: Record<string, number> = {};
  const tpSentiment: Record<string, number> = {};
  for (const tp of allTouchpoints) {
    tpBySource[tp.source] = (tpBySource[tp.source] || 0) + 1;
    tpByChannel[tp.channel] = (tpByChannel[tp.channel] || 0) + 1;
    tpByType[tp.event_type] = (tpByType[tp.event_type] || 0) + 1;
    if (tp.sentiment) tpSentiment[tp.sentiment] = (tpSentiment[tp.sentiment] || 0) + 1;
  }
  const lines: string[] = [];
  if (Object.keys(tpBySource).length > 0) {
    lines.push("By source:");
    for (const [k, v] of Object.entries(tpBySource)) lines.push("  - " + k + ": " + v);
  }
  if (Object.keys(tpByChannel).length > 0) {
    lines.push("By channel:");
    for (const [k, v] of Object.entries(tpByChannel)) lines.push("  - " + k + ": " + v);
  }
  if (Object.keys(tpByType).length > 0) {
    lines.push("By event type:");
    for (const [k, v] of Object.entries(tpByType)) lines.push("  - " + k + ": " + v);
  }
  if (Object.keys(tpSentiment).length > 0) {
    lines.push("Sentiment breakdown:");
    for (const [k, v] of Object.entries(tpSentiment)) lines.push("  - " + k + ": " + v);
  }
  return lines.join("\n");
})()}
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
- Be specific with numbers from the data`;

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
          description: `You have ${allMessages.length} total messages with a ${overallResponseRate}% response rate. As more data comes in, deeper patterns will emerge.`,
          metric: "response_rate",
          confidence: "low",
          sampleSize: allMessages.length,
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
        description: `${allMessages.length} messages across ${Object.keys(channelStats).length} channels. ${overallResponseRate}% overall response rate.`,
        metric: "response_rate",
        confidence: "medium",
        sampleSize: allMessages.length,
        dataSource: "outreach_analytics",
        actionable: "Review channel breakdown to identify your best performing outreach method.",
        tags: ["overview"],
        trend: "stable",
        discoveredAt: new Date().toISOString(),
      }];
    }

    // ─── 9. Assemble response ──────────────────────────────────────

    const result = {
      topInsights,
      personaBreakdown,
      templateRankings: [], // templates not yet tracked at DB level
      timingHeatmap: timingHeatmap.slice(0, 50),
      outreachMetrics: channelMetrics,
      patternInsights: [], // can be populated in future iterations
      overallStats: {
        totalOutreachActions: outbound.length,
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
  const ampm = bestHour >= 12 ? "PM" : "AM";
  const displayHour = bestHour > 12 ? bestHour - 12 : bestHour === 0 ? 12 : bestHour;
  return `${displayHour}:00 ${ampm}`;
}
