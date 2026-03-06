import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import Anthropic from "@anthropic-ai/sdk";
import {
  STRATEGIC_PRIORITIES,
  BUSINESS_CHALLENGES,
} from "@/lib/rocket-constants";

/**
 * POST /api/rocket/research
 *
 * AI-driven company research: assigns SP (1-5) + BC (1-6) categories with reasoning.
 * Analyzes each unique company from the lead batch.
 *
 * Body: { leads: Lead[], importId?: string }
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const leads = body.leads || [];
    const importId = body.importId;

    if (!leads.length) {
      return NextResponse.json({ error: "No leads provided" }, { status: 400 });
    }

    // Group leads by company
    const companiesMap: Record<string, Array<{ name: string; position: string; email: string }>> = {};
    for (const lead of leads) {
      const company = lead.company || "Unknown";
      if (!companiesMap[company]) companiesMap[company] = [];
      companiesMap[company].push({
        name: lead.name || `${lead.first_name || ""} ${lead.last_name || ""}`.trim(),
        position: lead.position || lead.title || "",
        email: lead.email || "",
      });
    }

    const companies = Object.keys(companiesMap);
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!anthropicKey) {
      return NextResponse.json({
        error: "ANTHROPIC_API_KEY not configured",
        research: {},
      }, { status: 200 });
    }

    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const research: Record<string, {
      companyName: string;
      assignedSP: string | null;
      assignedBC: string | null;
      spReasoning: string;
      bcReasoning: string;
      signals: string[];
      verticalNotes: string;
      erpSystem?: string;
      tmsSystem?: string;
      estimatedRevenue?: string;
      importVolume?: string;
    }> = {};

    // Build SP/BC definitions for prompt
    const spDefs = Object.values(STRATEGIC_PRIORITIES)
      .map((sp) => `${sp.id}: ${sp.label} — ${sp.description}`)
      .join("\n");
    const bcDefs = Object.values(BUSINESS_CHALLENGES)
      .map((bc) => `${bc.id}: ${bc.label} — ${bc.description}`)
      .join("\n");

    // Process in batches of 5
    const batchSize = 5;
    for (let i = 0; i < companies.length; i += batchSize) {
      const batch = companies.slice(i, i + batchSize);

      const companyDescriptions = batch.map((company) => {
        const people = companiesMap[company];
        const personList = people
          .map((p) => `  - ${p.name} (${p.position || "N/A"})`)
          .join("\n");
        return `Company: ${company}\nContacts:\n${personList}`;
      }).join("\n\n---\n\n");

      try {
        const message = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: `You are a B2B sales research analyst for Nauta, a supply chain automation platform for wholesale distributors.

Analyze each company below and assign:
1. A primary Strategic Priority (SP1-SP5)
2. A primary Business Challenge (BC1-BC6)

STRATEGIC PRIORITIES:
${spDefs}

BUSINESS CHALLENGES:
${bcDefs}

For each company, provide:
- assignedSP: The most likely SP (e.g., "SP1") or null if unclear
- assignedBC: The most likely BC (e.g., "BC3") or null if unclear
- spReasoning: 1-2 sentences explaining why this SP fits
- bcReasoning: 1-2 sentences explaining why this BC fits
- signals: Array of relevant signals (e.g., "VP-level contact", "Distribution company", "Multiple contacts")
- verticalNotes: Brief note on their likely vertical/industry
- erpSystem: Likely ERP if detectable from company context (or null)
- estimatedRevenue: Revenue estimate if detectable (or null)

COMPANIES TO ANALYZE:

${companyDescriptions}

Respond in JSON format:
{
  "results": {
    "CompanyName": {
      "assignedSP": "SP1",
      "assignedBC": "BC3",
      "spReasoning": "...",
      "bcReasoning": "...",
      "signals": ["signal1", "signal2"],
      "verticalNotes": "...",
      "erpSystem": null,
      "estimatedRevenue": null
    }
  }
}`,
          }],
        });

        const responseText = message.content[0].type === "text" ? message.content[0].text : "";
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const results = parsed.results || parsed;

          for (const [company, data] of Object.entries(results)) {
            const d = data as Record<string, unknown>;
            research[company] = {
              companyName: company,
              assignedSP: (d.assignedSP as string) || null,
              assignedBC: (d.assignedBC as string) || null,
              spReasoning: (d.spReasoning as string) || "",
              bcReasoning: (d.bcReasoning as string) || "",
              signals: (d.signals as string[]) || [],
              verticalNotes: (d.verticalNotes as string) || "",
              erpSystem: (d.erpSystem as string) || undefined,
              tmsSystem: (d.tmsSystem as string) || undefined,
              estimatedRevenue: (d.estimatedRevenue as string) || undefined,
              importVolume: (d.importVolume as string) || undefined,
            };
          }
        }
      } catch (batchErr) {
        console.error(`[Rocket Research] Batch error:`, batchErr);
      }
    }

    // Store research results in Supabase if importId provided
    if (importId) {
      const supabase = await createClient();
      // Update pipeline run data
      await supabase
        .from("rocket_pipeline_runs")
        .update({
          researched_count: Object.keys(research).length,
          pipeline_data: { research },
          updated_at: new Date().toISOString(),
        })
        .eq("import_id", importId)
        .eq("user_id", user.id);
    }

    return NextResponse.json({
      success: true,
      research,
      companiesProcessed: Object.keys(research).length,
    });
  } catch (err) {
    console.error("[Rocket Research] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Research failed" },
      { status: 500 }
    );
  }
}
