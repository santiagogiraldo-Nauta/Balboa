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

    const { lead, language, context } = await req.json();

    if (!lead) {
      return NextResponse.json(
        { error: "Missing lead data" },
        { status: 400 }
      );
    }

    const langModifier =
      LANGUAGE_MODIFIERS[language as keyof typeof LANGUAGE_MODIFIERS] || "";

    const leadInfo = `
Name: ${lead.firstName} ${lead.lastName}
Company: ${lead.company}
Position: ${lead.position}
ICP Score: ${lead.icpScore?.overall ?? "Unknown"}/100
Tier: ${lead.icpScore?.tier ?? "Unknown"}
Industry: ${lead.companyIntel?.industry ?? "Unknown"}
Company Revenue: ${lead.companyIntel?.estimatedRevenue ?? "Unknown"}
Employee Count: ${lead.companyIntel?.employeeCount ?? "Unknown"}
Pain Points: ${(lead.companyIntel?.painPoints || []).join(", ") || "Unknown"}
Tech Stack: ${(lead.companyIntel?.techStack || []).join(", ") || "Unknown"}
Contact Status: ${lead.contactStatus || "not_contacted"}
Previous Notes: ${lead.notes || "None"}
Email: ${lead.email || "N/A"}
LinkedIn: ${lead.linkedinUrl || "N/A"}
`;

    const prompt = `${BALBOA_ICP_CONTEXT}

## YOUR TASK
Generate a comprehensive cold call script for a Balboa sales rep calling this prospect. The script should be natural, conversational, and designed to book a meeting within the first 2-3 minutes.

${langModifier ? `LANGUAGE: ${langModifier}` : ""}

## LEAD DETAILS
${leadInfo}

${context ? `## ADDITIONAL CONTEXT\n${context}` : ""}

## OUTPUT FORMAT
You MUST respond with ONLY valid JSON (no markdown, no code fences):
{
  "opener": "<Strong opening line, 2-3 sentences max. Reference something specific about their company or role. This is the most critical part.>",
  "valueProposition": "<2-3 sentences that clearly articulate what Balboa does and why it matters to THEM specifically. Use their industry/company context.>",
  "talkingPoints": [
    "<Point 1: specific to their industry/pain>",
    "<Point 2: relevant Balboa metric or case study>",
    "<Point 3: competitive differentiator>",
    "<Point 4: urgency driver>"
  ],
  "questions": [
    "<Discovery question 1: open-ended about their current process>",
    "<Question 2: about pain points>",
    "<Question 3: about decision timeline>",
    "<Question 4: about current tools>"
  ],
  "objectionHandlers": [
    { "objection": "<Common objection 1>", "response": "<Prepared response>" },
    { "objection": "<Common objection 2>", "response": "<Prepared response>" },
    { "objection": "<Common objection 3>", "response": "<Prepared response>" },
    { "objection": "<Common objection 4>", "response": "<Prepared response>" }
  ],
  "closeAttempt": "<Natural close attempt to book a meeting. Offer specific time slots. Maximum 2-3 sentences.>",
  "voicemailScript": "<30-second voicemail script. Hook + one value prop + callback CTA. Under 80 words.>",
  "gatekeeperScript": "<Script for getting past an assistant/receptionist. Professional, brief, implies urgency without being pushy.>"
}

REQUIREMENTS:
- Opener must mention their name and company in a natural way
- Value proposition must reference at least one specific pain point from their industry
- Objection handlers should cover: "not interested", "already have a solution", "no budget", "send me an email"
- Voicemail should be concise enough to leave in 30 seconds
- Gatekeeper script should sound like you have an existing relationship or scheduled callback
- All language should be conversational, NOT scripted-sounding`;

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
      console.error("JSON parse failed for call script. Raw:", rawText);
      // Fallback: return raw text as the opener
      parsed = {
        opener: rawText.slice(0, 500),
        valueProposition: "Balboa helps distributors like yours reduce emergency POs by 92% and free up millions in working capital.",
        talkingPoints: ["AI-powered supply chain control tower", "Sits on top of your existing ERP/WMS/TMS", "Real-time visibility with autonomous action"],
        questions: ["How are you managing procurement today?", "What's your biggest supply chain challenge right now?"],
        objectionHandlers: [
          { objection: "Not interested", response: "Totally understand. Quick question - are emergency POs eating into your margins? Most of our customers didn't think they needed us either until they saw the data." },
        ],
        closeAttempt: "Would it make sense to do a quick 15-minute walkthrough? I can show you exactly how this would work with your current setup.",
        voicemailScript: "Hi, this is [rep] from Balboa. I'm reaching out because we've been helping companies like yours reduce emergency POs by 92%. I'd love to share how. My number is [number].",
        gatekeeperScript: "Hi, I'm following up with [name] regarding our supply chain optimization conversation. Is [he/she] available?",
      };
    }

    const script = {
      id: `script-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      leadId: lead.id,
      generatedAt: new Date().toISOString(),
      opener: parsed.opener || "",
      valueProposition: parsed.valueProposition || "",
      talkingPoints: parsed.talkingPoints || [],
      questions: parsed.questions || [],
      objectionHandlers: parsed.objectionHandlers || [],
      closeAttempt: parsed.closeAttempt || "",
      voicemailScript: parsed.voicemailScript || "",
      gatekeeperScript: parsed.gatekeeperScript || "",
    };

    // Track event (fire-and-forget)
    if (user && supabase) {
      trackEvent(supabase, user.id, {
        eventCategory: "call" as const,
        eventAction: "call_script_generated" as const,
        leadId: lead.id,
        channel: "call",
        leadTier: lead.icpScore?.tier,
        leadIndustry: lead.companyIntel?.industry,
        leadPosition: lead.position,
        source: "api",
      });
    }

    return NextResponse.json({ script });
  } catch (error) {
    console.error("Call script generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate call script" },
      { status: 500 }
    );
  }
}
