import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { trackEvent } from "@/lib/tracking";
import { BALBOA_ICP_CONTEXT, LANGUAGE_MODIFIERS } from "@/lib/balboa-context";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { user, supabase, error: authError } = await getAuthUser();
    if (authError) return authError;

    const { event, attendees, language } = await req.json();

    if (!event) {
      return NextResponse.json(
        { error: "Missing event data" },
        { status: 400 }
      );
    }

    const langModifier =
      LANGUAGE_MODIFIERS[language as keyof typeof LANGUAGE_MODIFIERS] || "";

    const attendeeSummary = (attendees || event.attendees || [])
      .map(
        (a: { firstName: string; lastName: string; company: string; position: string; territory: string; icpScore?: number; tier?: string }) =>
          `- ${a.firstName} ${a.lastName}, ${a.position} at ${a.company} (Territory: ${a.territory}, ICP: ${a.icpScore ?? "N/A"}, Tier: ${a.tier ?? "N/A"})`
      )
      .join("\n");

    const prompt = `${BALBOA_ICP_CONTEXT}

## YOUR TASK
Generate a comprehensive event outreach plan for the following event. The plan should include pre-event, at-event, and post-event sequences designed to maximize meetings booked and pipeline generated.

${langModifier ? `LANGUAGE: ${langModifier}` : ""}

## EVENT DETAILS
Name: ${event.name}
Date: ${event.date}
Location: ${event.location}
Type: ${event.type}
Description: ${event.description || "N/A"}

## ATTENDEES
${attendeeSummary || "No specific attendees listed yet."}

## OUTPUT FORMAT
You MUST respond with ONLY valid JSON (no markdown, no code fences):
{
  "preEventSequence": [
    { "step": 1, "channel": "email|linkedin|call", "template": "<full message template with {firstName}, {company} placeholders>", "timing": "<e.g., '3 weeks before event'>" }
  ],
  "atEventTasks": ["<task 1>", "<task 2>"],
  "postEventSequence": [
    { "step": 1, "channel": "email|linkedin|call", "template": "<full message template>", "timing": "<e.g., '1 day after event'>" }
  ],
  "goals": {
    "meetingsTarget": <number>,
    "leadsTarget": <number>,
    "connectionsTarget": <number>
  }
}

REQUIREMENTS:
- Pre-event: 3-4 steps starting 3 weeks out, using a mix of email and LinkedIn
- At-event: 5-7 actionable tasks for the day of the event
- Post-event: 3-5 steps over the 2 weeks following the event, including at least one phone call
- Templates should be personalized with placeholders and reference Balboa's value props
- Goals should be realistic based on the number of attendees
- Channel mix: leverage email for formal outreach, LinkedIn for rapport, calls for high-priority leads`;

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
      console.error("JSON parse failed for event plan. Raw:", rawText);
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    const plan = {
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      eventId: event.id,
      preEventSequence: parsed.preEventSequence || [],
      atEventTasks: parsed.atEventTasks || [],
      postEventSequence: parsed.postEventSequence || [],
      goals: parsed.goals || {
        meetingsTarget: 5,
        leadsTarget: 10,
        connectionsTarget: 20,
      },
    };

    // Track event (fire-and-forget)
    if (user && supabase) {
      trackEvent(supabase, user.id, {
        eventCategory: "enablement",
        eventAction: "prep_kit_created",
        metadata: {
          eventId: event.id,
          eventName: event.name,
          attendeeCount: (attendees || event.attendees || []).length,
          type: "event_outreach_plan",
        },
        source: "api",
      });
    }

    return NextResponse.json({ plan });
  } catch (error) {
    console.error("Generate event plan error:", error);
    return NextResponse.json(
      { error: "Failed to generate outreach plan" },
      { status: 500 }
    );
  }
}
