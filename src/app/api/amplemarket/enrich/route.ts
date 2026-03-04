import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { enrichBatch } from "@/lib/amplemarket/client";

/**
 * POST /api/amplemarket/enrich
 *
 * Bulk-enrich leads that are missing email addresses using Amplemarket.
 * Fetches all leads without emails, calls Amplemarket to find their emails,
 * and updates the lead records in Supabase.
 *
 * Query params:
 *   limit — max leads to enrich in one batch (default: all)
 */
export async function POST(request: Request) {
  const { user, supabase, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.AMPLEMARKET_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Amplemarket is not configured. Set AMPLEMARKET_API_KEY." },
      { status: 500 }
    );
  }

  try {
    // Parse optional limit from request body
    let limit: number | undefined;
    try {
      const body = await request.json();
      limit = body.limit;
    } catch {
      // No body or invalid JSON — proceed without limit
    }

    // Fetch leads without emails
    let query = supabase
      .from("leads")
      .select("id, first_name, last_name, company, linkedin_url, raw_data")
      .eq("user_id", user.id)
      .is("email", null)
      .order("created_at", { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data: leadsData, error: leadsError } = await query;

    if (leadsError) {
      console.error("[enrich] Failed to fetch leads:", leadsError);
      return NextResponse.json(
        { error: "Failed to fetch leads" },
        { status: 500 }
      );
    }

    if (!leadsData || leadsData.length === 0) {
      return NextResponse.json({
        enriched: 0,
        failed: 0,
        total: 0,
        message: "All leads already have email addresses",
        results: [],
      });
    }

    // Prepare leads for enrichment
    const leadsToEnrich = leadsData.map((lead) => {
      const rawData = lead.raw_data as Record<string, unknown> | null;
      return {
        id: lead.id as string,
        firstName: (lead.first_name as string) || "",
        lastName: (lead.last_name as string) || "",
        company: (lead.company as string) || "",
        linkedinUrl:
          (lead.linkedin_url as string) ||
          (rawData?.url as string) ||
          (rawData?.linkedinUrl as string) ||
          undefined,
      };
    });

    console.log(
      `[enrich] Starting enrichment for ${leadsToEnrich.length} leads`
    );

    // Run batch enrichment
    const results = await enrichBatch(leadsToEnrich, apiKey, 500);

    // Update leads in Supabase with enriched data
    let enrichedCount = 0;
    let failedCount = 0;

    for (const result of results) {
      if (result.success && result.email) {
        const updateData: Record<string, unknown> = {
          email: result.email,
          updated_at: new Date().toISOString(),
        };

        // Store additional enrichment data in raw_data
        const lead = leadsData.find((l) => l.id === result.leadId);
        if (lead) {
          const existingRawData =
            (lead.raw_data as Record<string, unknown>) || {};
          updateData.raw_data = {
            ...existingRawData,
            amplemarket_enriched: true,
            amplemarket_enriched_at: new Date().toISOString(),
            ...(result.phone && { phone: result.phone }),
            ...(result.companyDomain && {
              company_domain: result.companyDomain,
            }),
            ...(result.title && { enriched_title: result.title }),
          };
        }

        const { error: updateError } = await supabase
          .from("leads")
          .update(updateData)
          .eq("id", result.leadId)
          .eq("user_id", user.id);

        if (updateError) {
          console.error(
            `[enrich] Failed to update lead ${result.leadId}:`,
            updateError
          );
          failedCount++;
        } else {
          enrichedCount++;
        }
      } else {
        failedCount++;
      }
    }

    console.log(
      `[enrich] Complete: ${enrichedCount} enriched, ${failedCount} failed out of ${leadsToEnrich.length}`
    );

    return NextResponse.json({
      enriched: enrichedCount,
      failed: failedCount,
      total: leadsToEnrich.length,
      results: results.map((r) => ({
        leadId: r.leadId,
        success: r.success,
        email: r.email,
        error: r.error,
      })),
    });
  } catch (err) {
    console.error("[enrich] Error:", err);
    return NextResponse.json(
      {
        error: "Enrichment failed",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
