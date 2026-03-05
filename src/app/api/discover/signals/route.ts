import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { BALBOA_ICP_CONTEXT } from "@/lib/balboa-context";
import { getAuthUser } from "@/lib/supabase/auth-check";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const APIFY_BASE = "https://api.apify.com/v2";

interface GoogleSearchResult {
  url?: string;
  title?: string;
  description?: string;
  organicResults?: Array<{
    url?: string;
    title?: string;
    description?: string;
  }>;
}

export async function POST(req: NextRequest) {
  try {
    const { error: authError } = await getAuthUser();
    if (authError) return authError;

    if (!APIFY_TOKEN) {
      return NextResponse.json(
        {
          error: "apify_not_connected",
          message: "Apify API token is not configured.",
        },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));

    // Target companies and industries for signal monitoring
    const signalQueries = body.queries || [
      '"food distribution" OR "wholesale distribution" supply chain expansion OR funding OR hiring 2025 2026',
      '"Sysco" OR "US Foods" OR "PFG" OR "McLane" OR "Dot Foods" supply chain technology OR disruption OR announcement',
      '"distribution" OR "import" "supply chain" leadership change OR new VP OR new Director 2025 2026',
    ];

    // Step 1: Search for market signals with Apify Google Search
    let searchResults: Array<{ url?: string; title?: string; description?: string }> = [];

    try {
      const res = await fetch(
        `${APIFY_BASE}/acts/apify~google-search-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            queries: signalQueries.join("\n"),
            maxPagesPerQuery: 1,
            resultsPerPage: 10,
            languageCode: "en",
            countryCode: "us",
          }),
          signal: AbortSignal.timeout(120_000),
        }
      );

      if (res.ok) {
        const rawResults = (await res.json()) as GoogleSearchResult[];
        for (const item of rawResults) {
          if (item.organicResults) {
            searchResults.push(...item.organicResults);
          } else if (item.url) {
            searchResults.push(item);
          }
        }
      }
    } catch (e) {
      console.error("[discover/signals] Apify search failed:", e);
      return NextResponse.json(
        { error: "apify_error", message: "Apify search failed" },
        { status: 502 }
      );
    }

    // Step 2: Use Claude to analyze and generate market signals
    const signals = await generateSignalsWithClaude(searchResults);

    return NextResponse.json({
      signals,
      total: signals.length,
      searchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[discover/signals] Error:", error);
    return NextResponse.json({ error: "Failed to discover signals" }, { status: 500 });
  }
}

async function generateSignalsWithClaude(
  searchResults: Array<{ url?: string; title?: string; description?: string }>
) {
  const today = new Date().toISOString().split("T")[0];

  const prompt = `${BALBOA_ICP_CONTEXT}

## YOUR TASK
Analyze these web search results about supply chain and distribution companies. Identify market signals that are relevant for Nauta/Balboa's sales team to act on.

SEARCH RESULTS:
${searchResults
  .slice(0, 25)
  .map(
    (r, i) => `${i + 1}. Title: ${r.title || "N/A"}
   URL: ${r.url || "N/A"}
   Description: ${r.description || "N/A"}`
  )
  .join("\n")}

For each relevant signal, return a JSON array of MarketSignal objects:
[
  {
    "id": "<generate unique id like 'sig-1', 'sig-2'>",
    "type": "<hiring|funding|expansion|pain_indicator|tech_change|leadership_change>",
    "company": "<company name>",
    "description": "<what happened and why it matters for Nauta sales>",
    "relevance": "<high|medium|low>",
    "date": "${today}",
    "source": "<source URL or publication name>",
    "suggestedAction": "<specific action the sales team should take>",
    "linkedProspects": []
  }
]

RULES:
- Only include signals relevant to Nauta/Balboa's ICP (US distributors, importers, supply chain)
- Focus on actionable signals: new leadership, expansion, funding, tech changes, pain indicators
- Prioritize high-relevance signals
- Be specific about suggested actions (e.g., "Reach out to new VP Supply Chain at [Company] with Nauta's fill rate story")
- Maximum 10 signals, sorted by relevance
- Return ONLY valid JSON array, no markdown`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 3000,
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
    console.error("[discover/signals] Failed to parse Claude response");
    return [];
  }
}
