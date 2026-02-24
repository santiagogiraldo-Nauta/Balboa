import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { BALBOA_ICP_CONTEXT, LANGUAGE_MODIFIERS } from "@/lib/balboa-context";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { trackEvent } from "@/lib/tracking";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MESSAGE_TYPE_INSTRUCTIONS: Record<string, string> = {
  connection_followup: "Write a short LinkedIn connection message (<300 chars). Casual, curious tone. Reference something specific about them.",
  cold_outreach: "Write a cold outreach LinkedIn InMail (<1000 chars). Provide value first, soft CTA.",
  warm_intro: "Write a warm intro message referencing mutual connections or shared context.",
  engagement_reply: "Write a reply to their recent LinkedIn post/activity showing genuine interest.",
  value_share: "Share a relevant insight or resource they'd find valuable based on their role/industry.",
  email_followup: "Write a follow-up email. Brief, add new value, clear but soft CTA.",
  email_initial: "Write an initial cold email. Subject line that gets opened, body that provides value and earns a reply. 150-250 words max.",
  call_followup: "Write a follow-up email after a phone call. Reference what was discussed, propose next steps.",
  meeting_request: "Write a meeting request that demonstrates you understand their challenges.",
  sms_outreach: "Write a short SMS message (<160 chars). Direct, conversational. Include a clear CTA.",
  whatsapp_outreach: "Write a WhatsApp message (<500 chars). Professional but friendly. Can include emojis. Clear next step.",
};

export async function POST(req: NextRequest) {
  try {
    const { user, supabase, error: authError } = await getAuthUser();
    if (authError) return authError;

    const { lead, messageType, context, language, channel } = await req.json();

    if (!lead || !messageType) {
      return NextResponse.json({ error: "Missing lead or messageType" }, { status: 400 });
    }

    const langModifier = LANGUAGE_MODIFIERS[language as keyof typeof LANGUAGE_MODIFIERS] || "";
    const typeInstruction = MESSAGE_TYPE_INSTRUCTIONS[messageType] || MESSAGE_TYPE_INSTRUCTIONS.cold_outreach;

    const leadInfo = `
Name: ${lead.firstName} ${lead.lastName}
Company: ${lead.company}
Position: ${lead.position}
ICP Score: ${lead.icpScore?.overall || "Unknown"}/100
Tier: ${lead.icpScore?.tier || "Unknown"}
Industry: ${lead.companyIntel?.industry || "Unknown"}
Company Revenue: ${lead.companyIntel?.estimatedRevenue || "Unknown"}
Pain Points: ${(lead.companyIntel?.painPoints || []).join(", ") || "Unknown"}
Contact Status: ${lead.contactStatus || "new"}
Notes: ${lead.notes || "None"}
Channel: ${channel || "linkedin"}
`;

    const prompt = `${BALBOA_ICP_CONTEXT}

## YOUR TASK
${typeInstruction}

${langModifier ? `LANGUAGE: ${langModifier}` : ""}

## LEAD DETAILS
${leadInfo}

${context ? `## ADDITIONAL CONTEXT\n${context}` : ""}

You MUST respond with ONLY valid JSON in this exact format (no markdown, no code fences, no explanation):
{"type":"${messageType}","subject":"<subject line for emails, or empty for LinkedIn>","body":"<the full message>","personalization":["<reason 1 this is specific to them>","<reason 2>"]}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = response.content[0].type === "text" ? response.content[0].text : "";

    // Robust JSON extraction — handle code fences, leading text, etc.
    let jsonStr = rawText;

    // Remove markdown code fences
    jsonStr = jsonStr.replace(/```json\s*/gi, "").replace(/```\s*/g, "");

    // Try to extract JSON object if there's surrounding text
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    jsonStr = jsonStr.trim();

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("JSON parse failed. Raw response:", rawText);
      // Fallback: construct a message from raw text
      parsed = {
        type: messageType,
        subject: channel === "email" ? `Reaching out — ${lead.company}` : "",
        body: rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim() || rawText,
        personalization: ["AI-generated based on lead profile"],
      };
    }

    const generatedChannel = channel || (messageType.startsWith("email") ? "email" : messageType.startsWith("sms") ? "sms" : messageType.startsWith("whatsapp") ? "whatsapp" : "linkedin");

    // Track event (fire-and-forget)
    if (user && supabase) {
      trackEvent(supabase, user.id, {
        eventCategory: "outreach",
        eventAction: "message_generated",
        leadId: lead?.id,
        channel: generatedChannel as "email" | "linkedin" | "sms" | "whatsapp",
        leadTier: lead?.icpScore?.tier,
        templateType: messageType,
        source: "api",
      });
    }

    return NextResponse.json({
      message: {
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: parsed.type || messageType,
        subject: parsed.subject || "",
        body: parsed.body || "",
        personalization: parsed.personalization || [],
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
