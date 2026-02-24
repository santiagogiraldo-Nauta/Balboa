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

    const { query, type } = await req.json();

    let prompt = BALBOA_ICP_CONTEXT + "\n\n";

    if (type === "company_research") {
      prompt += `Research this company as a potential Nauta prospect. Based on what you know, provide:
1. Company overview and likely size
2. Likely tech stack based on industry/size
3. Potential pain points Nauta solves
4. Key personas to target
5. Recommended approach
6. Conversation starters

Company: ${query}

Return JSON:
{
  "companyName": "<name>",
  "overview": "<2-3 sentences>",
  "estimatedRevenue": "<range>",
  "industry": "<industry>",
  "likelyTechStack": [<systems>],
  "painPoints": [<pain points>],
  "targetPersonas": [<titles to target>],
  "approach": "<recommended sales approach>",
  "conversationStarters": [<3 opening questions>],
  "icpFitScore": <0-100>,
  "reasoning": "<why they are/aren't a fit>"
}`;
    } else if (type === "industry_trends") {
      prompt += `Identify current industry trends and opportunities for Nauta in: ${query}

Return JSON:
{
  "trends": [{"trend": "<name>", "relevance": "<how it connects to Nauta>", "talkingPoint": "<what to say>"}],
  "eventOpportunities": [<industry events worth attending>],
  "contentIdeas": [<topics to post about>]
}`;
    } else {
      prompt += `Answer this sales intelligence question for the Nauta team: ${query}

Provide actionable insights, not generic advice. Be specific to Nauta's product and ICP.`;
    }

    prompt += "\n\nReturn ONLY valid JSON, no markdown formatting.";

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { response: text };
    }

    // Track research event (fire-and-forget)
    if (user && supabase) {
      trackEvent(supabase, user.id, {
        eventCategory: "analysis",
        eventAction: "research_query",
        metadata: { queryType: type, queryLength: query?.length },
        source: "api",
      });
    }

    return NextResponse.json({ result: parsed });
  } catch (error) {
    console.error("Research error:", error);
    return NextResponse.json({ error: "Failed to run research" }, { status: 500 });
  }
}
