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

    const deals = await getDeals(supabase, user.id);

    // Analyze each deal
    const analyzed = await Promise.all(
      deals.map(async (deal: any) => ({
        id: deal.id,
        name: deal.deal_name,
        amount: deal.amount || 0,
        stage: deal.deal_stage,
        closeProbability: await getDealCloseProbability(supabase, user.id, deal.deal_stage),
        daysInStage: Math.floor((Date.now() - new Date(deal.updated_at).getTime()) / (1000 * 60 * 60 * 24)),
      }))
    );

    // Sort by close probability × amount (weighted)
    const ranked = analyzed.sort((a, b) => {
      const scoreA = (a.closeProbability / 100) * a.amount;
      const scoreB = (b.closeProbability / 100) * b.amount;
      return scoreB - scoreA;
    });

    // Identify urgent actions
    const urgent = ranked
      .filter((d: any) => d.daysInStage > 30 || d.closeProbability < 30)
      .slice(0, 5);

    const hotDeals = ranked.filter((d: any) => d.closeProbability > 70).slice(0, 5);

    // Total pipeline value
    const totalPipelineValue = ranked.reduce((sum: number, d: any) => sum + d.amount, 0);
    const avgCloseProb = ranked.length > 0 ? ranked.reduce((sum: number, d: any) => sum + d.closeProbability, 0) / ranked.length : 0;

    // Track event (fire-and-forget)
    trackEvent(supabase, user.id, {
      eventCategory: "analysis",
      eventAction: "pipeline_analyzed",
      numericValue: totalPipelineValue,
      metadata: { totalDeals: ranked.length, urgentCount: urgent.length, hotDeals: hotDeals.length },
      source: "api",
    });

    return NextResponse.json({
      summary: {
        totalDeals: ranked.length,
        pipelineValue: totalPipelineValue,
        avgCloseProbability: Math.round(avgCloseProb),
        urgentCount: urgent.length,
        hotDealsCount: hotDeals.length,
      },
      urgentActions: urgent.map((d: any) => ({
        dealId: d.id,
        dealName: d.name,
        action: d.daysInStage > 30 ? "Re-engage: No activity in 30+ days" : "At risk: Low close probability",
      })),
      topDeals: ranked.slice(0, 10).map((d: any) => ({
        dealId: d.id,
        dealName: d.name,
        amount: d.amount,
        closeProbability: d.closeProbability,
      })),
    });
  } catch (error) {
    console.error("Pipeline analyzer error:", error);
    return NextResponse.json({ error: "Failed to analyze pipeline" }, { status: 500 });
  }
}
