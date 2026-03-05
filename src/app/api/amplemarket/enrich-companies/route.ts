import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";

const AMPLEMARKET_BASE_URL = "https://api.amplemarket.com";

// ─── Types ────────────────────────────────────────────────────────

interface AmplemarketCompany {
  name?: string;
  domain?: string;
  description?: string;
  industry?: string;
  employee_count?: number;
  estimated_revenue?: string;
  founded_year?: number;
  funding?: {
    total_funding?: string;
    last_round?: string;
    last_round_date?: string;
    investors?: string[];
  };
  tech_stack?: string[];
  headquarters?: {
    city?: string;
    state?: string;
    country?: string;
  };
  linkedin_url?: string;
  website?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function fetchWithRetry(
  url: string,
  apiKey: string,
  retries = 2
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: headers(apiKey) });

    if (res.status === 401) {
      throw new Error("Invalid Amplemarket API key");
    }

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "3", 10);
      const waitMs = Math.min(retryAfter * 1000, 15000);
      console.warn(
        `[amplemarket-companies] Rate limited, waiting ${waitMs}ms (attempt ${attempt + 1}/${retries + 1})`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    if (res.status === 404) {
      // Company not found - not an error, just no data
      return res;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      lastError = new Error(
        `Amplemarket API error (${res.status}): ${text || res.statusText}`
      );
      if (attempt < retries) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (attempt + 1))
        );
        continue;
      }
      throw lastError;
    }

    return res;
  }

  throw lastError || new Error("Failed after retries");
}

/**
 * Extract a domain from a company name or email.
 * Tries common patterns: "company.com", or derives from email.
 */
function extractDomain(
  company: string,
  email?: string
): string | null {
  // Try to extract from email first
  if (email && email.includes("@")) {
    const emailDomain = email.split("@")[1]?.toLowerCase().trim();
    // Skip common free email providers
    const freeProviders = [
      "gmail.com",
      "yahoo.com",
      "hotmail.com",
      "outlook.com",
      "aol.com",
      "icloud.com",
      "protonmail.com",
      "mail.com",
      "live.com",
    ];
    if (emailDomain && !freeProviders.includes(emailDomain)) {
      return emailDomain;
    }
  }

  // Try to derive domain from company name
  if (company) {
    const cleaned = company
      .toLowerCase()
      .replace(/[^a-z0-9\s.-]/g, "")
      .replace(/\s+(inc|llc|ltd|corp|co|gmbh|sa|sas|srl)\.?$/i, "")
      .trim()
      .replace(/\s+/g, "");

    if (cleaned.length > 0 && cleaned.length < 40) {
      return `${cleaned}.com`;
    }
  }

  return null;
}

// ─── Route ───────────────────────────────────────────────────────

/**
 * POST /api/amplemarket/enrich-companies
 *
 * Enriches leads that have empty/null company_intel by looking up their
 * company domain via Amplemarket's company finder endpoint.
 *
 * Request body:
 *   limit — Max leads to enrich (default: 50)
 *
 * For each lead with a company domain:
 *   - Calls GET /api/v1/companies/find?domain=<domain>
 *   - Updates lead's company_intel with employee count, industry, funding, etc.
 *   - Stores full Amplemarket company data in raw_data.amplemarket.company
 *
 * Returns: { enriched: count, failed: count, skipped: count }
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
    let limit = 50;
    try {
      const body = await request.json();
      if (body.limit && typeof body.limit === "number") {
        limit = Math.min(body.limit, 200); // Cap at 200
      }
    } catch {
      // No body or invalid JSON - use default
    }

    // 1. Fetch leads where company_intel is empty or null
    console.log(
      "[amplemarket-companies] Fetching leads with empty company_intel..."
    );

    const { data: leadsData, error: leadsError } = await supabase
      .from("leads")
      .select("id, company, email, raw_data, company_intel")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit * 2); // Fetch extra since some may not have domains

    if (leadsError) {
      console.error(
        "[amplemarket-companies] Failed to fetch leads:",
        leadsError
      );
      return NextResponse.json(
        { error: "Failed to fetch leads" },
        { status: 500 }
      );
    }

    if (!leadsData || leadsData.length === 0) {
      return NextResponse.json({
        enriched: 0,
        failed: 0,
        skipped: 0,
        message: "No leads found",
      });
    }

    // Filter to leads with empty company_intel
    const leadsNeedingEnrichment = leadsData.filter((lead) => {
      const intel = lead.company_intel as Record<string, unknown> | null;
      if (!intel) return true;
      // Check if it's an empty object or missing key fields
      const keys = Object.keys(intel);
      if (keys.length === 0) return true;
      // If it only has default empty values, consider it un-enriched
      if (!intel.industry && !intel.employeeCount && !intel.techStack)
        return true;
      return false;
    });

    // Apply the actual limit
    const leadsToProcess = leadsNeedingEnrichment.slice(0, limit);

    if (leadsToProcess.length === 0) {
      return NextResponse.json({
        enriched: 0,
        failed: 0,
        skipped: leadsData.length,
        message: "All leads already have company intelligence",
      });
    }

    console.log(
      `[amplemarket-companies] Processing ${leadsToProcess.length} leads for company enrichment`
    );

    // 2. Enrich each lead's company
    let enrichedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const results: Array<{
      leadId: string;
      company: string;
      success: boolean;
      error?: string;
    }> = [];

    for (let i = 0; i < leadsToProcess.length; i++) {
      const lead = leadsToProcess[i];
      const company = (lead.company as string) || "";
      const email = (lead.email as string) || "";
      const domain = extractDomain(company, email);

      if (!domain) {
        skippedCount++;
        results.push({
          leadId: lead.id as string,
          company,
          success: false,
          error: "No domain could be derived",
        });
        continue;
      }

      console.log(
        `[amplemarket-companies] Enriching ${i + 1}/${leadsToProcess.length}: ${company} (${domain})`
      );

      try {
        const url = `${AMPLEMARKET_BASE_URL}/api/v1/companies/find?domain=${encodeURIComponent(domain)}`;
        const res = await fetchWithRetry(url, apiKey);

        if (res.status === 404) {
          failedCount++;
          results.push({
            leadId: lead.id as string,
            company,
            success: false,
            error: "Company not found in Amplemarket",
          });
          // Still rate limit
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }

        const companyData: AmplemarketCompany = await res.json();

        // Build company_intel from Amplemarket data
        const companyIntel: Record<string, unknown> = {
          industry: companyData.industry || "",
          employeeCount: companyData.employee_count
            ? String(companyData.employee_count)
            : "",
          estimatedRevenue: companyData.estimated_revenue || "",
          techStack: companyData.tech_stack || [],
          recentNews: [],
          balboaFitReason: "",
          painPoints: [],
          description: companyData.description || "",
          fundingTotal: companyData.funding?.total_funding || "",
          lastFundingRound: companyData.funding?.last_round || "",
          lastFundingDate: companyData.funding?.last_round_date || "",
          investors: companyData.funding?.investors || [],
          foundedYear: companyData.founded_year || null,
          headquarters: companyData.headquarters || null,
          domain: companyData.domain || domain,
          enrichedAt: new Date().toISOString(),
          enrichedBy: "amplemarket",
        };

        // Update raw_data.amplemarket.company with full data
        const existingRawData =
          (lead.raw_data as Record<string, unknown>) || {};
        const existingAmplemarket =
          (existingRawData.amplemarket as Record<string, unknown>) || {};

        const { error: updateError } = await supabase
          .from("leads")
          .update({
            company_intel: companyIntel,
            raw_data: {
              ...existingRawData,
              amplemarket: {
                ...existingAmplemarket,
                company: companyData,
                company_enriched_at: new Date().toISOString(),
              },
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", lead.id)
          .eq("user_id", user.id);

        if (updateError) {
          console.error(
            `[amplemarket-companies] Failed to update lead ${lead.id}:`,
            updateError
          );
          failedCount++;
          results.push({
            leadId: lead.id as string,
            company,
            success: false,
            error: `DB update failed: ${updateError.message}`,
          });
        } else {
          enrichedCount++;
          results.push({
            leadId: lead.id as string,
            company,
            success: true,
          });
        }
      } catch (callErr) {
        console.error(
          `[amplemarket-companies] Failed to enrich ${company} (${domain}):`,
          callErr
        );
        failedCount++;
        results.push({
          leadId: lead.id as string,
          company,
          success: false,
          error:
            callErr instanceof Error
              ? callErr.message
              : "Unknown error",
        });
      }

      // Rate limiting: 500ms between calls
      if (i < leadsToProcess.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log(
      `[amplemarket-companies] Complete: ${enrichedCount} enriched, ${failedCount} failed, ${skippedCount} skipped`
    );

    return NextResponse.json({
      enriched: enrichedCount,
      failed: failedCount,
      skipped: skippedCount,
      total: leadsToProcess.length,
      results,
    });
  } catch (err) {
    console.error("[amplemarket-companies] Error:", err);

    const message =
      err instanceof Error ? err.message : "Company enrichment failed";

    if (message.includes("Invalid Amplemarket API key")) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    if (message.includes("rate limit") || message.includes("Rate limit")) {
      return NextResponse.json({ error: message }, { status: 429 });
    }

    return NextResponse.json(
      { error: message, details: String(err) },
      { status: 500 }
    );
  }
}
