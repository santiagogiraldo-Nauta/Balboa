import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { MESSAGE_GENERATION_PROMPT } from "@/lib/nauta-context";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { lead, messageType, context } = await req.json();

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

    return NextResponse.json({
      message: {
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ...parsed,
        status: "draft",
        createdAt: new Date().toISOString(),
      }
    });
  } catch (error) {
    console.error("Message generation error:", error);
    return NextResponse.json({ error: "Failed to generate message" }, { status: 500 });
  }
}
