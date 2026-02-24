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

    const systemPrompt = `You are Balboa AI, the internal sales intelligence assistant for the Balboa platform. You have complete access to the user's sales pipeline data.

${context}

## YOUR CAPABILITIES
You can help the user with:
1. **Pipeline Analysis** — "Who should I reach out to first?" "Which deals are at risk?"
2. **Lead Intelligence** — "Tell me about Sarah Chen" "What's the best approach for US Foods?"
3. **Outreach Strategy** — "Draft an email for this lead" "What channel should I use?"
4. **Deal Strategy** — "How should I close this deal?" "What's the risk on this pipeline?"
5. **Playbook Insights** — "What's working best?" "What time should I send emails?"
6. **Action Recommendations** — "What should I do today?" "What's my priority list?"
7. **General Sales Coaching** — Ask about objection handling, negotiation tips, industry intel

## RESPONSE FORMAT
Always respond in a conversational, helpful tone. When relevant, include:
- **Action items** the user can take immediately
- **Specific lead/deal names** when discussing pipeline
- **Data points** to support recommendations
- **Quick wins** the user can act on right now

When suggesting actions on specific leads, format them as clickable suggestions like:
[ACTION:lead_id:action_type] — e.g., [ACTION:lead-123:send_email] or [ACTION:lead-123:view]

Keep responses concise but valuable. Don't repeat the data back — interpret it, analyze it, and recommend.`;

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
