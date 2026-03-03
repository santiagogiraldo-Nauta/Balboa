import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { trackEvent } from "@/lib/tracking";
import { BALBOA_ICP_CONTEXT } from "@/lib/balboa-context";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { user, supabase, error: authError } = await getAuthUser();
    if (authError) return authError;

    const { leads, conversationSummaries } = await req.json();

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json(
        { error: "Missing or empty leads array" },
        { status: 400 }
      );
    }

    const leadsInfo = leads
      .map(
        (lead: {
          id: string;
          firstName: string;
          lastName: string;
          company: string;
          position: string;
          icpScore: { overall?: number; tier?: string } | null;
          status: string;
          contactStatus: string;
          touchpointTimeline: unknown[];
          draftMessages: unknown[];
          channels: Record<string, unknown>;
          lastOutreachMethod: string | null;
          nextStep: string | null;
        }) => `
- ID: ${lead.id}
  Name: ${lead.firstName} ${lead.lastName}
  Company: ${lead.company}
  Position: ${lead.position}
  ICP Score: ${lead.icpScore?.overall ?? "Unknown"}/100
  Tier: ${lead.icpScore?.tier ?? "Unknown"}
  Status: ${lead.status}
  Contact Status: ${lead.contactStatus}
  Touchpoints: ${JSON.stringify(lead.touchpointTimeline || [])}
  Draft Messages: ${JSON.stringify(lead.draftMessages || [])}
  Channels: ${JSON.stringify(lead.channels || {})}
  Last Outreach Method: ${lead.lastOutreachMethod || "None"}
  Next Step: ${lead.nextStep || "None"}`
      )
      .join("\n");

    const prompt = `${BALBOA_ICP_CONTEXT}

## YOUR TASK
You are Vasco, the AI sales intelligence assistant for Balboa. Analyze these leads and their recent activity. Determine which leads need follow-up today and why. For each recommendation: suggest the best channel (email/linkedin/sms), urgency level (urgent/high/medium/low), reason for follow-up, and a brief suggested message approach.

Return JSON: { "followUps": [{ "leadId": "<id>", "leadName": "<full name>", "company": "<company>", "channel": "<email|linkedin|sms>", "urgency": "<urgent|high|medium|low>", "reason": "<why follow-up is needed>", "suggestedAction": "<what to do>", "suggestedMessage": "<brief message approach>" }] }

## LEADS DATA
${leadsInfo}

${conversationSummaries ? `## CONVERSATION SUMMARIES\n${conversationSummaries}` : ""}

## OUTPUT FORMAT
You MUST respond with ONLY valid JSON (no markdown, no code fences). Return an empty followUps array if no leads need follow-up today.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
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
      console.error("JSON parse failed for follow-ups. Raw:", rawText);
      parsed = { followUps: [] };
    }

    const result = {
      followUps: Array.isArray(parsed.followUps) ? parsed.followUps : [],
      generatedAt: new Date().toISOString(),
      leadsAnalyzed: leads.length,
    };

    // Track event (fire-and-forget)
    if (user && supabase) {
      trackEvent(supabase, user.id, {
        eventCategory: "analysis" as const,
        eventAction: "pipeline_analyzed" as const,
        numericValue: leads.length,
        metadata: {
          type: "follow_up_analysis",
          followUpsGenerated: result.followUps.length,
        },
        source: "api",
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Follow-up analysis error:", error);
    return NextResponse.json(
      { error: "Failed to analyze follow-ups" },
      { status: 500 }
    );
  }
}
