import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { trackEvent } from "@/lib/tracking";
import Anthropic from "@anthropic-ai/sdk";

/**
 * POST /api/rocket/enrich
 *
 * AI-enriches leads from a specific Rocket import.
 * Generates: personalization signals, talking points, ICP reasoning, suggested first message.
 *
 * Body: { importId: string }
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  try {
    const body = await req.json();
    const importId = body.importId;

    if (!importId) {
      return NextResponse.json({ error: "importId required" }, { status: 400 });
    }

    // Verify the import belongs to this user
    const { data: importRecord } = await supabase
      .from("rocket_imports")
      .select("*")
      .eq("id", importId)
      .eq("user_id", user.id)
      .single();

    if (!importRecord) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    // Mark enrichment as in progress
    await supabase
      .from("rocket_imports")
      .update({ enrichment_status: "in_progress" })
      .eq("id", importId);

    // Get leads from this import
    // Step 1: Fetch all rocket leads for this user (PostgREST JSONB filters can be unreliable)
    // Step 2: Filter in-memory by import_filename
    const { data: allRocketLeads, error: leadsError } = await supabase
      .from("leads")
      .select("id, first_name, last_name, email, company, position, linkedin_url, icp_score, company_intel, raw_data, source")
      .eq("user_id", user.id)
      .eq("source", "rocket")
      .order("created_at", { ascending: false })
      .limit(500);

    if (leadsError) {
      console.error(`[Rocket Enrich] Supabase query error:`, leadsError);
    }

    // Filter by import filename in raw_data
    const leads = (allRocketLeads || []).filter((l) => {
      const rawData = l.raw_data as Record<string, unknown> | null;
      return rawData?.import_filename === importRecord.filename;
    });

    console.log(`[Rocket Enrich] Found ${leads.length} matching leads for import ${importId}`);

    if (!leads || leads.length === 0) {
      await supabase
        .from("rocket_imports")
        .update({ enrichment_status: "completed", enriched_count: 0 })
        .eq("id", importId);

      return NextResponse.json({
        success: true,
        enriched: 0,
        message: "No leads found for this import",
      });
    }

    // Batch leads for AI enrichment (groups of 10)
    const batchSize = 10;
    let enrichedCount = 0;
    const enrichmentErrors: string[] = [];

    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);

      try {
        const enrichments = await enrichBatch(batch);

        // Apply enrichments to each lead
        for (const enrichment of enrichments) {
          const lead = batch.find(
            (l) => l.email === enrichment.email || l.id === enrichment.leadId
          );
          if (!lead) continue;

          const updatedRawData = {
            ...(lead.raw_data as Record<string, unknown> || {}),
            personalization: {
              signal: enrichment.signal,
              metric: enrichment.metric,
              talking_point: enrichment.talkingPoint,
              suggested_opener: enrichment.suggestedOpener,
              pain_hypothesis: enrichment.painHypothesis,
              enriched_at: new Date().toISOString(),
            },
            ai_enriched: true,
          };

          // Update ICP score with AI reasoning
          const currentIcp = (lead.icp_score as Record<string, unknown>) || {};
          const updatedIcp = {
            ...currentIcp,
            aiReasoning: enrichment.icpReasoning,
            enrichedAt: new Date().toISOString(),
          };

          // Update company intel with AI insights
          const currentIntel = (lead.company_intel as Record<string, unknown>) || {};
          const updatedIntel = {
            ...currentIntel,
            balboaFitReason: enrichment.fitReason || currentIntel.balboaFitReason,
            painPoints: enrichment.painPoints?.length
              ? enrichment.painPoints
              : currentIntel.painPoints || [],
          };

          await supabase
            .from("leads")
            .update({
              raw_data: updatedRawData,
              icp_score: updatedIcp,
              company_intel: updatedIntel,
            })
            .eq("id", lead.id);

          enrichedCount++;
        }
      } catch (batchErr) {
        enrichmentErrors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${batchErr}`);
      }
    }

    // Update import record with enrichment results
    await supabase
      .from("rocket_imports")
      .update({
        enrichment_status: enrichmentErrors.length > 0 ? "completed" : "completed",
        enriched_count: enrichedCount,
      })
      .eq("id", importId);

    // Track enrichment completed
    await trackEvent(supabase, user.id, {
      eventCategory: "lead",
      eventAction: "lead_created",
      numericValue: enrichedCount,
      metadata: {
        type: "rocket_enrichment",
        importId,
        enriched: enrichedCount,
        total: leads.length,
        errors: enrichmentErrors.length,
      },
      source: "api",
    });

    return NextResponse.json({
      success: true,
      enriched: enrichedCount,
      total: leads.length,
      errors: enrichmentErrors.length > 0 ? enrichmentErrors : undefined,
    });
  } catch (err) {
    console.error("[Rocket Enrich] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Enrichment failed" },
      { status: 500 }
    );
  }
}

// ─── AI Batch Enrichment ──────────────────────────────────────────

interface EnrichmentResult {
  leadId: string;
  email: string;
  signal: string;
  metric: string;
  talkingPoint: string;
  suggestedOpener: string;
  painHypothesis: string;
  icpReasoning: string;
  fitReason: string;
  painPoints: string[];
}

async function enrichBatch(
  leads: Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    company: string | null;
    position: string | null;
    linkedin_url: string | null;
    icp_score: unknown;
    company_intel: unknown;
    raw_data: unknown;
  }>
): Promise<EnrichmentResult[]> {
  const leadsContext = leads.map((l) => {
    const rawData = l.raw_data as Record<string, unknown> || {};
    return {
      id: l.id,
      name: `${l.first_name || ""} ${l.last_name || ""}`.trim(),
      email: l.email,
      company: l.company,
      position: l.position,
      spCategory: rawData.sp_category || null,
      bcCategory: rawData.bc_category || null,
      segment: rawData.segment || null,
      industry: (l.company_intel as Record<string, unknown>)?.industry || null,
    };
  });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `You are Balboa, an AI sales intelligence agent for Nauta — an AI-native supply chain platform for mid-market distributors and importers ($200M-$3B).

Enrich these ${leads.length} leads with personalized sales intelligence. For EACH lead, generate:

1. **signal**: A specific, researched-sounding industry trigger (e.g., "Recent FDA import compliance changes affecting pharma distributors")
2. **metric**: A concrete number/stat relevant to their pain (e.g., "18% average safety stock reduction for similar distributors")
3. **talkingPoint**: One sentence connecting their role + company to Nauta's value
4. **suggestedOpener**: A 1-2 sentence email opener — direct, no pleasantries, peer-to-peer tone. No exclamation marks.
5. **painHypothesis**: What you think their #1 operational pain is
6. **icpReasoning**: Brief explanation of why this lead is/isn't a good fit for Nauta
7. **fitReason**: One sentence on Nauta's specific value for this company
8. **painPoints**: Array of 2-3 specific pain points for their role/industry

LEADS:
${JSON.stringify(leadsContext, null, 2)}

Respond with ONLY a JSON array of objects matching this shape:
[{ "leadId": "...", "email": "...", "signal": "...", "metric": "...", "talkingPoint": "...", "suggestedOpener": "...", "painHypothesis": "...", "icpReasoning": "...", "fitReason": "...", "painPoints": ["...", "..."] }]`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  // Parse JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error("[Rocket Enrich] Could not parse AI response:", text.substring(0, 200));
    return [];
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    console.error("[Rocket Enrich] JSON parse error");
    return [];
  }
}
