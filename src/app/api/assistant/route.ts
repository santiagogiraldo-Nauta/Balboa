import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { trackEvent } from "@/lib/tracking";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { user, supabase, error: authError } = await getAuthUser();
    if (authError) return authError;

    const { messages, context } = await req.json();

    const systemPrompt = `You are Vasco, the AI sales navigator inside the Balboa platform. Named after Vasco Núñez de Balboa — the explorer who crossed uncharted jungle to discover the Pacific Ocean. Like your namesake, you chart the path forward through complex territory.

You have complete real-time access to the user's sales pipeline, leads, deals, and accounts.

${context}

## YOUR PERSONALITY
- Direct, confident, no fluff — like a seasoned navigator who knows the terrain
- Use data to back every recommendation
- Proactive — don't just answer, suggest the next move
- Brief but sharp. Every word earns its place.

## YOUR CAPABILITIES
1. **Pipeline Navigation** — "Who should I prioritize?" "Where are the risks?"
2. **Lead Intelligence** — Deep context on any lead, company, or stakeholder
3. **Outreach Strategy** — Draft messages, suggest channels, optimize timing
4. **Deal Strategy** — Risk assessment, next steps, stakeholder mapping
5. **Playbook Insights** — What's working, conversion patterns, best practices
6. **Action Planning** — Daily priorities, weekly action plans, follow-up reminders
7. **Sales Coaching** — Objection handling, negotiation tactics, industry intel

## RESPONSE FORMAT
- Lead with the insight or recommendation, not the data
- Use bullet points for action items
- Include specific lead/deal names when discussing pipeline
- When suggesting actions on leads, use: [ACTION:lead_id:action_type]
  Valid actions: [ACTION:lead-123:view], [ACTION:lead-123:send_email], [ACTION:lead-123:send_linkedin]
- Keep it concise. If they want more detail, they'll ask.
- Never repeat raw data back — interpret, analyze, recommend.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const assistantMessage =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Track event (fire-and-forget)
    if (user && supabase) {
      trackEvent(supabase, user.id, {
        eventCategory: "analysis",
        eventAction: "research_query",
        metadata: {
          source: "assistant",
          messageCount: messages.length,
        },
        source: "api",
      });
    }

    return NextResponse.json({ message: assistantMessage });
  } catch (error: unknown) {
    console.error("Assistant API error:", error);
    return NextResponse.json(
      {
        message:
          "I'm having trouble right now. Try again in a moment.",
        error: true,
      },
      { status: 500 }
    );
  }
}
