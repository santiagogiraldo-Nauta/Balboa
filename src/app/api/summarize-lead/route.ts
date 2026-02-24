import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { BALBOA_ICP_CONTEXT } from "@/lib/balboa-context";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { trackEvent } from "@/lib/tracking";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { user, supabase, error: authError } = await getAuthUser();
    if (authError) return authError;

    const { lead } = await req.json();

    if (!lead) {
      return NextResponse.json({ error: "Missing lead data" }, { status: 400 });
    }

    const prompt = `${BALBOA_ICP_CONTEXT}

You are generating a comprehensive lead summary for the Balboa sales team. Analyze ALL available data about this lead and produce a detailed intelligence brief.

## LEAD DATA

Name: ${lead.firstName} ${lead.lastName}
Company: ${lead.company}
Position: ${lead.position}
Email: ${lead.email || "N/A"}
LinkedIn: ${lead.linkedinUrl || "N/A"}
Status: ${lead.status || "Unknown"}
Contact Status: ${lead.contactStatus || "not_contacted"}
ICP Score: ${JSON.stringify(lead.icpScore || {})}
Notes: ${lead.notes || "None"}

## TOUCHPOINT TIMELINE
${JSON.stringify(lead.touchpointTimeline || [], null, 2)}

## DRAFT MESSAGES
${JSON.stringify(lead.draftMessages || [], null, 2)}

## CALL LOGS
${JSON.stringify(lead.callLogs || [], null, 2)}

## EMAIL CAMPAIGNS
${JSON.stringify(lead.emailCampaigns || [], null, 2)}

## COMPANY INTEL
${JSON.stringify(lead.companyIntel || {}, null, 2)}

## ENGAGEMENT ACTIONS
${JSON.stringify(lead.engagementActions || [], null, 2)}

## ADDITIONAL CONTEXT
- LinkedIn Stage: ${lead.linkedinStage || "N/A"}
- Emails Sent: ${lead.emailsSentCount || 0}
- Email Status: ${lead.emailStatus || "N/A"}
- Last Outreach Method: ${lead.lastOutreachMethod || "N/A"}
- Meeting Scheduled: ${lead.meetingScheduled || false}
- Next Step: ${lead.nextStep || "N/A"}
- Disqualify Reason: ${lead.disqualifyReason || "N/A"}

## TASK

Analyze everything above and produce a comprehensive lead summary. Calculate real metrics from the data provided. Be specific and data-driven.

Return ONLY valid JSON (no markdown, no code fences):
{
  "id": "summary-${Date.now()}",
  "leadId": "${lead.id || "unknown"}",
  "generatedAt": "${new Date().toISOString()}",
  "executiveSummary": "<2-4 sentence summary of the entire relationship, current state, and recommended path forward>",
  "sentimentTimeline": [
    { "date": "<YYYY-MM-DD>", "sentiment": "<positive|neutral|negative>", "reason": "<why this sentiment at this time>" }
  ],
  "keyMilestones": ["<milestone 1>", "<milestone 2>", "<milestone 3>"],
  "totalTouchpoints": <number - count from timeline>,
  "totalEmails": <number>,
  "totalLinkedIn": <number>,
  "totalCalls": <number>,
  "totalSms": <number>,
  "totalWhatsApp": <number>,
  "responseRate": <0.0-1.0 - fraction of outreach that got a response>,
  "avgResponseTime": "<human readable like '2.5 days' or '4 hours'>",
  "callRecordingHighlights": ["<key insight from calls 1>", "<insight 2>"],
  "nextRecommendedAction": "<specific, actionable next step with timing>",
  "dealProbability": <0.0-1.0 - likelihood this becomes a deal>,
  "riskFactors": ["<risk 1>", "<risk 2>"]
}

IMPORTANT:
- Calculate real numbers from the data, don't make them up
- Sentiment timeline should have 3-8 entries based on actual touchpoints
- Deal probability should reflect the actual engagement level and ICP fit
- Risk factors should be specific to this lead's situation
- If data is sparse, note that as a risk factor
`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { error: "Failed to parse summary response", raw: text };
    }

    // Track event (fire-and-forget)
    if (user && supabase) {
      trackEvent(supabase, user.id, {
        eventCategory: "analysis",
        eventAction: "lead_analyzed",
        leadId: lead.id,
        leadTier: lead.icpScore?.tier,
        metadata: { source: "lead_summarizer" },
        source: "api",
      });
    }

    return NextResponse.json({ result: parsed });
  } catch (error) {
    console.error("Lead summarize error:", error);
    return NextResponse.json({ error: "Summarization failed" }, { status: 500 });
  }
}
