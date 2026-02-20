import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { SCORING_PROMPT } from "@/lib/nauta-context";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { connections } = await req.json();

    if (!connections || !Array.isArray(connections)) {
      return NextResponse.json({ error: "Invalid connections data" }, { status: 400 });
    }

    const batchSize = 5;
    const results = [];

    for (let i = 0; i < connections.length; i += batchSize) {
      const batch = connections.slice(i, i + batchSize);
      const batchPromises = batch.map(async (conn: { firstName: string; lastName: string; company: string; position: string; connectedOn: string }) => {
        const connectionInfo = `Name: ${conn.firstName} ${conn.lastName}\nCompany: ${conn.company}\nPosition: ${conn.position}\nConnected On: ${conn.connectedOn}`;

        try {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1500,
            messages: [{
              role: "user",
              content: SCORING_PROMPT + connectionInfo + "\n\nReturn ONLY valid JSON, no markdown formatting."
            }],
          });

          const text = response.content[0].type === "text" ? response.content[0].text : "";
          const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          const parsed = JSON.parse(cleaned);

          return {
            ...conn,
            id: `${conn.firstName}-${conn.lastName}-${Date.now()}`.toLowerCase().replace(/\s/g, "-"),
            icpScore: {
              overall: parsed.overall,
              companyFit: parsed.companyFit,
              roleFit: parsed.roleFit,
              industryFit: parsed.industryFit,
              signals: parsed.signals,
              tier: parsed.tier,
            },
            companyIntel: parsed.companyIntel,
            suggestedActions: parsed.suggestedActions,
            draftMessages: parsed.draftMessage ? [{
              id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              ...parsed.draftMessage,
              status: "draft",
              createdAt: new Date().toISOString(),
            }] : [],
            status: parsed.tier === "hot" ? "new" : parsed.tier === "warm" ? "new" : "nurture",
            notes: "",
            engagementActions: [],
          };
        } catch {
          return {
            ...conn,
            id: `${conn.firstName}-${conn.lastName}-${Date.now()}`.toLowerCase().replace(/\s/g, "-"),
            icpScore: { overall: 0, companyFit: 0, roleFit: 0, industryFit: 0, signals: ["Analysis failed"], tier: "cold" as const },
            status: "nurture" as const,
            notes: "",
            draftMessages: [],
            engagementActions: [],
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return NextResponse.json({ leads: results });
  } catch (error) {
    console.error("Scoring error:", error);
    return NextResponse.json({ error: "Failed to score connections" }, { status: 500 });
  }
}
