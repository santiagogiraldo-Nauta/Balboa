import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { MESSAGE_GENERATION_PROMPT, LANGUAGE_MODIFIERS } from "@/lib/balboa-context";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { trackEvent } from "@/lib/tracking";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { user, supabase, error: authError } = await getAuthUser();
    if (authError) return authError;

    const { lead, messageType, context, language, channel } = await req.json();

    const langModifier = LANGUAGE_MODIFIERS[language as keyof typeof LANGUAGE_MODIFIERS] || "";

    const leadInfo = `
Name: ${lead.firstName} ${lead.lastName}
Company: ${lead.company}
Position: ${lead.position}
ICP Score: ${lead.icpScore?.overall || "Unknown"}/100
Tier: ${lead.icpScore?.tier || "Unknown"}
Company Intel: ${JSON.stringify(lead.companyIntel || {})}
Message Type: ${messageType}
Additional Context: ${context || "None"}
`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: MESSAGE_GENERATION_PROMPT + leadInfo + `
${langModifier ? `\nLANGUAGE INSTRUCTION: ${langModifier}\n` : ""}
Generate a ${messageType} message. Return ONLY valid JSON:
{
  "type": "${messageType}",
  "subject": "<subject line if InMail>",
  "body": "<the message>",
  "personalization": [<what makes this specific to them>]
}`
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const generatedChannel = channel || (messageType.startsWith("email") ? "email" : "linkedin");

    // Track event (fire-and-forget)
    if (user && supabase) {
      trackEvent(supabase, user.id, {
        eventCategory: "outreach",
        eventAction: "message_generated",
        leadId: lead?.id,
        channel: generatedChannel as "email" | "linkedin",
        leadTier: lead?.icpScore?.tier,
        templateType: messageType,
        source: "api",
      });
    }

    return NextResponse.json({
      message: {
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ...parsed,
        channel: generatedChannel,
        status: "draft",
        createdAt: new Date().toISOString(),
      }
    });
  } catch (error) {
    console.error("Message generation error:", error);
    return NextResponse.json({ error: "Failed to generate message" }, { status: 500 });
  }
}
