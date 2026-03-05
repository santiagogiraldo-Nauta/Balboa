import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processWebhookEvent, findLeadByEmail, findLeadByLinkedIn } from "@/lib/track-touchpoint";
import { logWebhook } from "@/lib/db-touchpoints";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * POST /api/webhooks/clay
 *
 * Receives enriched lead data from Clay via HTTP API action.
 *
 * Flow: Balboa sends lead to Clay webhook → Clay table runs enrichment
 * waterfalls → Clay sends enriched data back here.
 *
 * Expected payload structure:
 * {
 *   email: string,
 *   linkedin_url?: string,
 *   enrichment: {
 *     company_name?: string,
 *     industry?: string,
 *     employee_count?: string,
 *     estimated_revenue?: string,
 *     tech_stack?: string[],
 *     recent_news?: string[],
 *     pain_points?: string[],
 *     job_title?: string,
 *     phone?: string,
 *     ... other enrichment data
 *   }
 * }
 */
export async function POST(req: NextRequest) {
  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ received: true, error: "Service not configured" });
  }

  try {
    const payload = await req.json();
    const email = payload.email || payload.data?.email;
    const linkedinUrl = payload.linkedin_url || payload.data?.linkedin_url;
    const enrichment = payload.enrichment || payload.data || payload;

    console.log("[Clay Webhook] Enrichment received for:", email || linkedinUrl || "unknown");

    // Find the lead
    let leadId: string | undefined;
    let userId: string | undefined;

    if (email) {
      const lead = await findLeadByEmail(supabase, email);
      if (lead) {
        leadId = lead.id;
        userId = lead.user_id;
      }
    }

    if (!leadId && linkedinUrl) {
      const lead = await findLeadByLinkedIn(supabase, linkedinUrl);
      if (lead) {
        leadId = lead.id;
        userId = lead.user_id;
      }
    }

    if (!userId) {
      const { data: firstUser } = await supabase
        .from("leads")
        .select("user_id")
        .limit(1)
        .single();
      userId = firstUser?.user_id;
    }

    if (!userId) {
      await logWebhook(supabase, "clay", "enrichment", payload, false, "No user found");
      return NextResponse.json({ received: true, matched: false });
    }

    // Track the enrichment event
    await processWebhookEvent(supabase, "clay", "enrichment", payload, {
      userId,
      leadId,
      source: "clay",
      channel: "email", // enrichment is channel-agnostic but we need a value
      eventType: "enriched",
      metadata: {
        enrichment_fields: Object.keys(enrichment),
        provider: payload.provider || "clay",
      },
    });

    // Update the lead with enrichment data
    if (leadId) {
      const { data: currentLead } = await supabase
        .from("leads")
        .select("company_intel, raw_data, icp_score")
        .eq("id", leadId)
        .single();

      if (currentLead) {
        const companyIntel = (currentLead.company_intel || {}) as Record<string, unknown>;
        const rawData = (currentLead.raw_data || {}) as Record<string, unknown>;
        const icpScore = (currentLead.icp_score || {}) as Record<string, unknown>;

        // Merge enrichment into company intel
        if (enrichment.industry) companyIntel.industry = enrichment.industry;
        if (enrichment.estimated_revenue) companyIntel.estimatedRevenue = enrichment.estimated_revenue;
        if (enrichment.employee_count) companyIntel.employeeCount = enrichment.employee_count;
        if (enrichment.tech_stack) companyIntel.techStack = enrichment.tech_stack;
        if (enrichment.recent_news) companyIntel.recentNews = enrichment.recent_news;
        if (enrichment.pain_points) companyIntel.painPoints = enrichment.pain_points;

        // Store phone if provided
        if (enrichment.phone) rawData.phone = enrichment.phone;

        // Store full enrichment data
        rawData.clayEnrichment = enrichment;
        rawData.lastEnrichedAt = new Date().toISOString();

        // Update ICP score signals
        const signals = (icpScore.signals || []) as string[];
        if (enrichment.industry) signals.push(`Industry: ${enrichment.industry}`);
        if (enrichment.estimated_revenue) signals.push(`Revenue: ${enrichment.estimated_revenue}`);
        icpScore.signals = [...new Set(signals)];

        const updates: Record<string, unknown> = {
          company_intel: companyIntel,
          raw_data: rawData,
          icp_score: icpScore,
        };

        // Update email if we didn't have one
        if (enrichment.email && !email) {
          updates.email = enrichment.email;
        }

        await supabase
          .from("leads")
          .update(updates)
          .eq("id", leadId);

        console.log(`[Clay Webhook] Lead ${leadId} enriched with ${Object.keys(enrichment).length} fields`);
      }
    }

    return NextResponse.json({ received: true, matched: !!leadId, enriched: !!leadId });
  } catch (error) {
    console.error("[Clay Webhook] Error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
