import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { trackEvent } from "@/lib/tracking";
import { BATTLE_CARD_PROMPT, BALBOA_ICP_CONTEXT } from "@/lib/balboa-context";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const KNOWN_COMPETITORS = [
  "sap", "oracle", "blue yonder", "e2open", "fourkites",
  "project44", "flexport", "descartes", "coupa",
];

export async function POST(req: NextRequest) {
  try {
    const { user, supabase, error: authError } = await getAuthUser();
    if (authError) return authError;

    const { leadId, competitor } = await req.json();

    if (!leadId) {
      return NextResponse.json({ error: "Missing leadId" }, { status: 400 });
    }

    // Fetch the lead from Supabase
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("user_id", user!.id)
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    // Parse company intel from JSONB
    const companyIntel = lead.company_intel || lead.companyIntel || {};
    const techStack: string[] = companyIntel.techStack || [];

    // Auto-detect competitor from techStack if not provided
    let resolvedCompetitor = competitor;
    if (!resolvedCompetitor || resolvedCompetitor === "auto") {
      const detected = techStack.find((t: string) =>
        KNOWN_COMPETITORS.some((c) => t.toLowerCase().includes(c))
      );
      resolvedCompetitor = detected || "other";
    }

    const displayName =
      resolvedCompetitor.charAt(0).toUpperCase() + resolvedCompetitor.slice(1);

    // Build lead context for the prompt
    const icpScore = lead.icp_score || lead.icpScore || {};
    const leadContext = `
Company: ${lead.company || "Unknown"}
Industry: ${companyIntel.industry || "Unknown"}
Position: ${lead.position || "Unknown"}
Name: ${lead.first_name || ""} ${lead.last_name || ""}
ICP Score: ${icpScore.overall ?? "Unknown"}/100
Tier: ${icpScore.tier ?? "Unknown"}
Company Revenue: ${companyIntel.estimatedRevenue || "Unknown"}
Employee Count: ${companyIntel.employeeCount || "Unknown"}
Tech Stack: ${techStack.join(", ") || "Unknown"}
Pain Points: ${(companyIntel.painPoints || []).join(", ") || "Unknown"}
Recent News: ${(companyIntel.recentNews || []).join("; ") || "None"}
Balboa Fit Reason: ${companyIntel.balboaFitReason || "Unknown"}
`;

    const prompt = `${BATTLE_CARD_PROMPT}
${resolvedCompetitor}

LEAD CONTEXT (personalize the battle card for this prospect):
${leadContext}

You MUST respond with ONLY valid JSON (no markdown, no code fences, no explanation):
{
  "strengths": ["<Competitor strength 1>", "..."],
  "weaknesses": ["<Competitor weakness 1>", "..."],
  "balboaDifferentiators": ["<Why Balboa wins 1>", "..."],
  "killerQuestions": ["<Question that exposes competitor weakness 1>", "..."],
  "landmines": ["<Trap to set early 1>", "..."]
}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Robust JSON extraction
    let jsonStr = rawText
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "");

    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    jsonStr = jsonStr.trim();

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("JSON parse failed for battle card. Raw:", rawText);
      parsed = {
        strengths: ["Established market presence", "Existing customer integrations"],
        weaknesses: ["Slow implementation timelines", "Limited mid-market focus"],
        balboaDifferentiators: [
          "6-8 week deployment vs 6+ months",
          "Purpose-built for mid-market distributors",
          "Autonomous action on alerts, not just visibility",
        ],
        killerQuestions: [
          "How long did implementation take, and what % of features are you using?",
          "When an alert fires, how quickly does someone act on it?",
        ],
        landmines: [
          "Ask about autonomous action capabilities early in evaluation",
          "Request a mid-market reference customer with similar revenue range",
        ],
      };
    }

    // Map to KnownCompetitor type
    const competitorKey = KNOWN_COMPETITORS.find((c) =>
      resolvedCompetitor.toLowerCase().includes(c.replace(/\s/g, ""))
    ) || "other";

    const battleCard = {
      id: `bc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      leadId,
      competitor: competitorKey,
      competitorDisplayName: displayName,
      strengths: parsed.strengths || [],
      weaknesses: parsed.weaknesses || [],
      balboaDifferentiators: parsed.balboaDifferentiators || parsed.differentiators || [],
      killerQuestions: parsed.killerQuestions || [],
      landmines: parsed.landmines || [],
      autoDetectedFrom: (!competitor || competitor === "auto") ? "companyIntel.techStack" : undefined,
      createdAt: new Date().toISOString(),
    };

    // Track event (fire-and-forget)
    if (user && supabase) {
      trackEvent(supabase, user.id, {
        eventCategory: "enablement",
        eventAction: "battle_card_created",
        leadId,
        leadTier: icpScore.tier,
        leadIndustry: companyIntel.industry,
        leadPosition: lead.position,
        metadata: { competitor: resolvedCompetitor },
        source: "api",
      });
    }

    return NextResponse.json({ battleCard });
  } catch (error) {
    console.error("Battle card generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate battle card" },
      { status: 500 }
    );
  }
}
