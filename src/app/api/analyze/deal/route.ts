import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { getDeals } from "@/lib/db";
import { getDealCloseProbability } from "@/lib/playbook";
import { trackEvent } from "@/lib/tracking";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { dealId } = await req.json();

    if (!dealId) {
      return NextResponse.json({ error: "Missing dealId" }, { status: 400 });
    }

    const deals = await getDeals(supabase, user.id);
    const deal = deals.find((d: any) => d.id === dealId);

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const closeProbability = await getDealCloseProbability(supabase, user.id, deal.deal_stage);

    // Determine deal health
    let dealHealth = "warm";
    if (closeProbability >= 80) dealHealth = "hot";
    if (closeProbability <= 30) dealHealth = "cold";

    const daysSinceUpdate = Math.floor((Date.now() - new Date(deal.updated_at).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceUpdate > 30) dealHealth = "stalled";

    // Generate strategy
    const prompt = `
Analyze this sales deal and provide a closing strategy.

Deal: ${deal.deal_name}
Amount: $${deal.amount || "TBD"}
Stage: ${deal.deal_stage}
Days in Stage: ${daysSinceUpdate}
Close Probability: ${closeProbability}%
Deal Health: ${dealHealth}

Provide a concise strategy. Return as JSON:
{
  "strategy": "High-level strategy to close this deal",
  "nextActions": ["Action 1", "Action 2", "Action 3"],
  "risks": "Key risks to address",
  "timelineToClose": "Estimated days to close if actions are taken"
}
`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const analysis = JSON.parse(cleaned);

    // Track event (fire-and-forget)
    trackEvent(supabase, user.id, {
      eventCategory: "analysis",
      eventAction: "deal_analyzed",
      dealId,
      numericValue: deal.amount || 0,
      metadata: { dealStage: deal.deal_stage, dealHealth, closeProbability },
      source: "api",
    });

    return NextResponse.json({
      dealId,
      dealName: deal.deal_name,
      dealHealth,
      closeProbability,
      strategy: analysis.strategy,
      nextActions: analysis.nextActions || [],
      risks: analysis.risks,
      timelineToClose: analysis.timelineToClose,
    });
  } catch (error) {
    console.error("Deal analyzer error:", error);
    return NextResponse.json({ error: "Failed to analyze deal" }, { status: 500 });
  }
}
