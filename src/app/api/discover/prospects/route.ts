import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { BALBOA_ICP_CONTEXT } from "@/lib/balboa-context";
import { getAuthUser } from "@/lib/supabase/auth-check";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const APIFY_BASE = "https://api.apify.com/v2";

interface ApifySearchResult {
  url?: string;
  title?: string;
  description?: string;
  organicResults?: Array<{
    url?: string;
    title?: string;
    description?: string;
  }>;
}

// Run an Apify actor synchronously and return dataset items
async function runApifyActor(actorId: string, input: Record<string, unknown>): Promise<unknown[]> {
  const res = await fetch(
    `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(120_000), // 2 min timeout
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Apify actor ${actorId} failed: ${res.status} ${errText}`);
  }

  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const { error: authError } = await getAuthUser();
    if (authError) return authError;

    if (!APIFY_TOKEN) {
      return NextResponse.json(
        {
          error: "apify_not_connected",
          message:
            "Apify API token is not configured. Connect Apify in Settings to enable real prospect discovery.",
        },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const limit = body.limit || 15;

    // ICP-based Google search queries targeting LinkedIn profiles
    const icpQueries = body.queries || [
      'site:linkedin.com/in "VP Supply Chain" OR "Director Supply Chain" "distribution" OR "wholesale" OR "import"',
      'site:linkedin.com/in "VP Procurement" OR "Director Procurement" OR "Chief Procurement" "food" OR "beverage" OR "consumer goods"',
      'site:linkedin.com/in "VP Logistics" OR "Director Operations" OR "COO" "distribution" OR "warehouse" OR "fulfillment"',
    ];

    // Step 1: Use Google Search Scraper to find LinkedIn profiles matching ICP
    let searchResults: Array<{ url?: string; title?: string; description?: string }> = [];

    try {
      const rawResults = (await runApifyActor("apify/google-search-scraper", {
        queries: icpQueries.join("\n"),
        maxPagesPerQuery: 1,
        resultsPerPage: Math.ceil(limit / icpQueries.length) + 5,
        languageCode: "en",
        countryCode: "us",
      })) as ApifySearchResult[];

      // Flatten organic results if nested
      for (const item of rawResults) {
        if (item.organicResults) {
          searchResults.push(...item.organicResults);
        } else if (item.url) {
          searchResults.push(item);
        }
      }
    } catch (e) {
      console.error("[discover/prospects] Apify Google search failed:", e);
      return NextResponse.json(
        { error: "apify_error", message: `Apify search failed: ${e instanceof Error ? e.message : "Unknown error"}` },
        { status: 502 }
      );
    }

    // Filter for LinkedIn profile URLs only
    const linkedInProfiles = searchResults
      .filter((r) => r.url?.includes("linkedin.com/in/"))
      .slice(0, limit);

    if (linkedInProfiles.length === 0) {
      return NextResponse.json({ prospects: [], total: 0, searchedAt: new Date().toISOString() });
    }

    // Step 2: Score and enrich prospects with Claude
    const prospects = await scoreProspectsWithClaude(linkedInProfiles);

    return NextResponse.json({
      prospects,
      total: prospects.length,
      searchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[discover/prospects] Error:", error);
    return NextResponse.json({ error: "Failed to discover prospects" }, { status: 500 });
  }
}

async function scoreProspectsWithClaude(
  profiles: Array<{ url?: string; title?: string; description?: string }>
) {
  const today = new Date().toISOString().split("T")[0];

  const prompt = `${BALBOA_ICP_CONTEXT}

## YOUR TASK
Analyze these LinkedIn profiles found via Google Search and score them as potential Nauta/Balboa prospects.
For each person, generate a complete Prospect object with ICP scoring, signals, and a suggested approach.

LINKEDIN SEARCH RESULTS:
${profiles
  .map(
    (p, i) => `${i + 1}. URL: ${p.url || "unknown"}
   Title: ${p.title || "Unknown"}
   Description: ${p.description || "N/A"}`
  )
  .join("\n")}

Return a JSON array. For EACH person:
[
  {
    "id": "<generate a unique id like 'disc-1', 'disc-2', etc.>",
    "firstName": "<extracted first name>",
    "lastName": "<extracted last name>",
    "company": "<company name>",
    "position": "<job title>",
    "linkedinUrl": "<linkedin url from search result>",
    "source": "database",
    "sourceDetail": "Apify LinkedIn Search",
    "discoveredAt": "${today}",
    "status": "discovered",
    "icpScore": {
      "overall": <0-100>,
      "companyFit": <0-100>,
      "roleFit": <0-100>,
      "industryFit": <0-100>,
      "signals": ["<ICP fit reason 1>", "<ICP fit reason 2>", "<reason 3>"],
      "tier": "<hot|warm|cold>"
    },
    "signals": [
      {
        "type": "<event_attendance|content_engagement|job_change|company_growth|funding|tech_adoption|pain_indicator|competitor_mention>",
        "description": "<signal description based on what you can infer>",
        "strength": "<strong|moderate|weak>",
        "date": "${today}",
        "source": "LinkedIn + Apify"
      }
    ],
    "suggestedApproach": "<recommended outreach approach>",
    "suggestedMessage": "<personalized 2-3 sentence outreach message>"
  }
]

SCORING RULES:
- HOT (70-100): Right role at a US distributor/importer/wholesaler in target verticals
- WARM (40-69): Partial ICP match — adjacent industry or role, worth nurturing
- COLD (0-39): Not a strong fit
- Extract names from the Google result title (format is usually "FirstName LastName - Title - Company | LinkedIn")
- Generate 1-3 signals per prospect based on what you can infer from their headline
- Sort by highest ICP score first
- If you can't extract enough info, skip that profile

Return ONLY a valid JSON array, no markdown.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "[]";
  const cleaned = text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    console.error("[discover/prospects] Failed to parse Claude response:", cleaned.slice(0, 200));
    return [];
  }
}
