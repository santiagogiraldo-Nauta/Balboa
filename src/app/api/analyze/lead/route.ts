import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { getLeads, getPlaybookMetrics, getPlaybookMetricsSummary } from "@/lib/db";
import { createClient } from "@/lib/supabase/client";
import { getBestChannel, getBestTiming, getExpectedOutcomes } from "@/lib/playbook";
import { trackEvent } from "@/lib/tracking";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { leadId } = await req.json();

    if (!leadId) {
      return NextResponse.json({ error: "Missing leadId" }, { status: 400 });
    }

    // Get lead data
    const leads = await getLeads(supabase, user.id);
    const lead = leads.find((l) => l.id === leadId);

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Get playbook metrics
    const { channel, replyRate } = await getBestChannel(supabase, user.id, lead.icpScore.tier, 1);
    const timing = await getBestTiming(supabase, user.id, channel, lead.icpScore.tier);
    const outcomes = await getExpectedOutcomes(supabase, user.id, channel, lead.icpScore.tier);

    // Generate AI recommendation
    const prompt = `
Analyze this lead and provide a strategic recommendation for the next action.

Lead: ${lead.firstName} ${lead.lastName}
Company: ${lead.company}
Position: ${lead.position}
ICP Tier: ${lead.icpScore.tier}
Company Fit: ${lead.icpScore.companyFit}%

Recommended Channel: ${channel} (${replyRate * 100}% reply rate)
Best Timing: ${timing.day} at ${timing.hour}:00
Expected Outcomes:
- Reply Rate: ${outcomes.replyRate * 100}%
- Meeting Rate: ${outcomes.meetingRate * 100}%
- Close Probability: ${outcomes.closeRate * 100}%

Provide a concise recommendation for immediate action. Return as JSON:
{
  "urgency": "immediate|high|medium|low",
  "action": "Specific action to take",
  "reasoning": "Why this action now"
}
`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const analysis = JSON.parse(cleaned);

    // Track event (fire-and-forget)
    trackEvent(supabase, user.id, {
      eventCategory: "analysis",
      eventAction: "lead_analyzed",
      leadId,
      leadTier: lead.icpScore.tier,
      channel: channel as "email" | "linkedin",
      source: "api",
    });

    return NextResponse.json({
      leadId,
      leadName: `${lead.firstName} ${lead.lastName}`,
      urgency: analysis.urgency || "medium",
      recommendedAction: analysis.action,
      recommendedChannel: channel,
      recommendedTiming: `${timing.day} at ${timing.hour}:00`,
      reasoning: analysis.reasoning,
      expectedOutcomes: outcomes,
    });
  } catch (error) {
    console.error("Analyzer error:", error);
    return NextResponse.json({ error: "Failed to analyze lead" }, { status: 500 });
  }
}
