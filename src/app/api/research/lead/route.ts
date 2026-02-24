import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { BALBOA_ICP_CONTEXT } from "@/lib/balboa-context";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { trackEvent } from "@/lib/tracking";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type ResearchTab = "person" | "company" | "industry" | "competition" | "approach" | "all";

function buildPrompt(lead: Record<string, unknown>, tab: ResearchTab): string {
  const leadContext = `
Lead Name: ${lead.firstName} ${lead.lastName}
Company: ${lead.company}
Position: ${lead.position}
Industry: ${(lead.companyIntel as Record<string, unknown>)?.industry || "Unknown"}
Email: ${lead.email || "N/A"}
LinkedIn: ${lead.linkedinUrl || "N/A"}
ICP Tier: ${(lead.icpScore as Record<string, unknown>)?.tier || "Unknown"}
ICP Score: ${(lead.icpScore as Record<string, unknown>)?.overall || "Unknown"}
Company Revenue: ${(lead.companyIntel as Record<string, unknown>)?.estimatedRevenue || "Unknown"}
Employee Count: ${(lead.companyIntel as Record<string, unknown>)?.employeeCount || "Unknown"}
Tech Stack: ${JSON.stringify((lead.companyIntel as Record<string, unknown>)?.techStack || [])}
Pain Points: ${JSON.stringify((lead.companyIntel as Record<string, unknown>)?.painPoints || [])}
Recent News: ${JSON.stringify((lead.companyIntel as Record<string, unknown>)?.recentNews || [])}
Notes: ${lead.notes || "None"}
Status: ${lead.status || "Unknown"}
Contact Status: ${lead.contactStatus || "Unknown"}
`;

  const basePrompt = `${BALBOA_ICP_CONTEXT}

You are performing deep research on a sales lead for the Balboa sales team. Use everything you know about the person, their company, their industry, and the competitive landscape to provide extremely detailed, actionable intelligence.

${leadContext}
`;

  const tabPrompts: Record<ResearchTab, string> = {
    person: `${basePrompt}
Research this PERSON deeply. Analyze their professional background, communication patterns, what motivates them in their role, and how they make purchasing decisions.

Return ONLY valid JSON (no markdown, no code fences):
{
  "person": {
    "summary": "<2-3 sentence executive summary of who this person is and why they matter for Balboa>",
    "careerHistory": ["<career milestone 1>", "<career milestone 2>", "<career milestone 3>", "<career milestone 4>"],
    "recentActivity": ["<recent professional activity or post 1>", "<recent activity 2>", "<recent activity 3>"],
    "communicationStyle": "<description of likely communication preferences: formal/informal, data-driven/story-driven, brief/detailed>",
    "motivations": ["<professional motivation 1>", "<motivation 2>", "<motivation 3>"],
    "decisionDrivers": ["<what drives their purchasing decisions 1>", "<driver 2>", "<driver 3>"]
  }
}`,

    company: `${basePrompt}
Research this COMPANY deeply. Provide comprehensive intelligence about their business, finances, strategy, technology, and organizational structure.

Return ONLY valid JSON (no markdown, no code fences):
{
  "company": {
    "overview": "<3-4 sentence company overview covering what they do, their market position, and scale>",
    "financials": "<estimated revenue, growth trajectory, funding status, and financial health indicators>",
    "recentNews": ["<recent news item 1>", "<recent news 2>", "<recent news 3>", "<recent news 4>"],
    "strategicInitiatives": ["<strategic initiative 1>", "<initiative 2>", "<initiative 3>"],
    "painPoints": ["<supply chain or operational pain point 1>", "<pain point 2>", "<pain point 3>", "<pain point 4>"],
    "techStack": ["<likely system 1>", "<system 2>", "<system 3>", "<system 4>"],
    "competitors": ["<direct competitor 1>", "<competitor 2>", "<competitor 3>"],
    "orgStructure": "<description of organizational structure, key decision makers, reporting lines relevant to a supply chain sale>"
  }
}`,

    industry: `${basePrompt}
Research the INDUSTRY this lead operates in. Provide intelligence on market dynamics, trends, challenges, and regulatory environment that a supply chain sales team needs to know.

Return ONLY valid JSON (no markdown, no code fences):
{
  "industry": {
    "trends": ["<industry trend 1>", "<trend 2>", "<trend 3>", "<trend 4>", "<trend 5>"],
    "challenges": ["<key industry challenge 1>", "<challenge 2>", "<challenge 3>", "<challenge 4>"],
    "regulations": ["<relevant regulation or compliance requirement 1>", "<regulation 2>", "<regulation 3>"],
    "marketSize": "<estimated total addressable market size and breakdown>",
    "growthRate": "<industry growth rate and trajectory with context>"
  }
}`,

    competition: `${basePrompt}
Research the COMPETITIVE LANDSCAPE for selling Balboa to this lead's company. Identify who they might be evaluating, what solutions they currently use, and how Balboa compares.

Return ONLY valid JSON (no markdown, no code fences):
{
  "competition": {
    "mainCompetitors": [
      { "name": "<competitor 1 name>", "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"], "weaknesses": ["<weakness 1>", "<weakness 2>", "<weakness 3>"] },
      { "name": "<competitor 2 name>", "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"], "weaknesses": ["<weakness 1>", "<weakness 2>", "<weakness 3>"] },
      { "name": "<competitor 3 name>", "strengths": ["<strength 1>", "<strength 2>"], "weaknesses": ["<weakness 1>", "<weakness 2>"] }
    ],
    "competitiveAdvantage": "<why Balboa wins against these competitors for this specific account>",
    "switchingCosts": "<analysis of switching costs and barriers to adoption for this company>"
  }
}`,

    approach: `${basePrompt}
Based on all available intelligence about this lead, their company, industry, and competitive landscape, design the OPTIMAL SALES APPROACH.

Return ONLY valid JSON (no markdown, no code fences):
{
  "approach": {
    "recommendedAngle": "<the single best angle to approach this lead with, personalized to their role and pain points>",
    "keyTalkingPoints": ["<talking point 1>", "<talking point 2>", "<talking point 3>", "<talking point 4>", "<talking point 5>"],
    "objectionHandling": [
      { "objection": "<likely objection 1>", "response": "<recommended response>" },
      { "objection": "<likely objection 2>", "response": "<recommended response>" },
      { "objection": "<likely objection 3>", "response": "<recommended response>" },
      { "objection": "<likely objection 4>", "response": "<recommended response>" }
    ],
    "idealTiming": "<best time and context to reach out, considering their role, industry cycles, and recent events>",
    "suggestedChannel": "<linkedin|email|call|whatsapp>"
  }
}`,

    all: `${basePrompt}
Perform a COMPREHENSIVE deep research on this lead covering their person, company, industry, competitive landscape, and optimal sales approach. Be extremely thorough and specific.

Return ONLY valid JSON (no markdown, no code fences) with ALL of the following sections:
{
  "id": "${lead.id || "research-" + Date.now()}",
  "leadId": "${lead.id || "unknown"}",
  "generatedAt": "${new Date().toISOString()}",
  "person": {
    "summary": "<2-3 sentence executive summary>",
    "careerHistory": ["<milestone 1>", "<milestone 2>", "<milestone 3>", "<milestone 4>"],
    "recentActivity": ["<activity 1>", "<activity 2>", "<activity 3>"],
    "communicationStyle": "<description>",
    "motivations": ["<motivation 1>", "<motivation 2>", "<motivation 3>"],
    "decisionDrivers": ["<driver 1>", "<driver 2>", "<driver 3>"]
  },
  "company": {
    "overview": "<3-4 sentence overview>",
    "financials": "<financial analysis>",
    "recentNews": ["<news 1>", "<news 2>", "<news 3>"],
    "strategicInitiatives": ["<initiative 1>", "<initiative 2>", "<initiative 3>"],
    "painPoints": ["<pain 1>", "<pain 2>", "<pain 3>", "<pain 4>"],
    "techStack": ["<system 1>", "<system 2>", "<system 3>"],
    "competitors": ["<competitor 1>", "<competitor 2>", "<competitor 3>"],
    "orgStructure": "<description>"
  },
  "industry": {
    "trends": ["<trend 1>", "<trend 2>", "<trend 3>", "<trend 4>"],
    "challenges": ["<challenge 1>", "<challenge 2>", "<challenge 3>"],
    "regulations": ["<regulation 1>", "<regulation 2>"],
    "marketSize": "<market size>",
    "growthRate": "<growth rate>"
  },
  "competition": {
    "mainCompetitors": [
      { "name": "<name>", "strengths": ["<s1>", "<s2>"], "weaknesses": ["<w1>", "<w2>"] },
      { "name": "<name>", "strengths": ["<s1>", "<s2>"], "weaknesses": ["<w1>", "<w2>"] }
    ],
    "competitiveAdvantage": "<why Balboa wins>",
    "switchingCosts": "<switching analysis>"
  },
  "approach": {
    "recommendedAngle": "<best angle>",
    "keyTalkingPoints": ["<point 1>", "<point 2>", "<point 3>", "<point 4>"],
    "objectionHandling": [
      { "objection": "<obj 1>", "response": "<resp 1>" },
      { "objection": "<obj 2>", "response": "<resp 2>" },
      { "objection": "<obj 3>", "response": "<resp 3>" }
    ],
    "idealTiming": "<timing recommendation>",
    "suggestedChannel": "<linkedin|email|call>"
  }
}`,
  };

  return tabPrompts[tab] || tabPrompts.all;
}

export async function POST(req: NextRequest) {
  try {
    const { user, supabase, error: authError } = await getAuthUser();
    if (authError) return authError;

    const { lead, tab } = await req.json();

    if (!lead || !tab) {
      return NextResponse.json({ error: "Missing lead or tab parameter" }, { status: 400 });
    }

    const prompt = buildPrompt(lead, tab as ResearchTab);

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
      parsed = { error: "Failed to parse research response", raw: text };
    }

    // Track event (fire-and-forget)
    if (user && supabase) {
      trackEvent(supabase, user.id, {
        eventCategory: "analysis",
        eventAction: "research_query",
        leadId: lead.id,
        leadTier: lead.icpScore?.tier,
        metadata: { source: "deep_research", tab },
        source: "api",
      });
    }

    return NextResponse.json({ result: parsed });
  } catch (error) {
    console.error("Deep research error:", error);
    return NextResponse.json({ error: "Research failed" }, { status: 500 });
  }
}
