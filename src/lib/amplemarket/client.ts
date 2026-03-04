/**
 * Amplemarket API Client
 *
 * Handles communication with Amplemarket's REST API for lead enrichment.
 * Uses the People Search and Single Person Enrichment endpoints to find
 * email addresses for leads imported from LinkedIn (which lack emails).
 *
 * API Docs: https://docs.amplemarket.com/api-reference
 */

const AMPLEMARKET_BASE_URL = "https://api.amplemarket.com";

// ─── Types ────────────────────────────────────────────────────────

export interface AmplemarketPerson {
  name: string;
  first_name: string;
  last_name: string;
  email: string | null;
  linkedin_url: string | null;
  title: string | null;
  headline: string | null;
  location: {
    city?: string;
    state?: string;
    country?: string;
  } | null;
  company: {
    name: string;
    domain: string | null;
    industry: string | null;
    employee_count: number | null;
  } | null;
  phone_numbers?: Array<{
    number: string;
    type: string;
  }>;
}

export interface SearchPeopleResponse {
  results: AmplemarketPerson[];
  _pagination: {
    current_page: number;
    page_size: number;
    total_count: number;
  };
}

export interface EnrichPersonParams {
  name?: string;
  companyName?: string;
  companyDomain?: string;
  linkedinUrl?: string;
  email?: string;
}

export interface EnrichmentResult {
  leadId: string;
  success: boolean;
  email?: string;
  phone?: string;
  companyDomain?: string;
  title?: string;
  error?: string;
}

// ─── API Functions ────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.AMPLEMARKET_API_KEY;
  if (!key) throw new Error("AMPLEMARKET_API_KEY is not set");
  return key;
}

function headers(apiKey?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey || getApiKey()}`,
    "Content-Type": "application/json",
  };
}

/**
 * Search for a person by name and company.
 * POST /people/search
 */
export async function searchPerson(
  name: string,
  companyNames: string[],
  apiKey?: string
): Promise<AmplemarketPerson | null> {
  try {
    const res = await fetch(`${AMPLEMARKET_BASE_URL}/people/search`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({
        person_name: name,
        company_names: companyNames,
        page_size: 5,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[amplemarket] Search failed (${res.status}):`, text);
      return null;
    }

    const data: SearchPeopleResponse = await res.json();

    if (data.results && data.results.length > 0) {
      return data.results[0];
    }

    return null;
  } catch (err) {
    console.error("[amplemarket] Search error:", err);
    return null;
  }
}

/**
 * Enrich a single person using name+company or LinkedIn URL.
 * GET /people/find
 */
export async function enrichPerson(
  params: EnrichPersonParams,
  apiKey?: string
): Promise<AmplemarketPerson | null> {
  try {
    const queryParams = new URLSearchParams();

    if (params.linkedinUrl) {
      queryParams.set("linkedin_url", params.linkedinUrl);
    } else if (params.name) {
      queryParams.set("name", params.name);
      if (params.companyName) queryParams.set("company_name", params.companyName);
      if (params.companyDomain) queryParams.set("company_domain", params.companyDomain);
    } else if (params.email) {
      queryParams.set("email", params.email);
    }

    queryParams.set("reveal_email", "true");
    queryParams.set("reveal_phone_numbers", "true");

    const res = await fetch(
      `${AMPLEMARKET_BASE_URL}/people/find?${queryParams.toString()}`,
      {
        method: "GET",
        headers: headers(apiKey),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error(`[amplemarket] Enrich failed (${res.status}):`, text);
      return null;
    }

    const data: AmplemarketPerson = await res.json();
    return data;
  } catch (err) {
    console.error("[amplemarket] Enrich error:", err);
    return null;
  }
}

/**
 * Validate an Amplemarket API key by making a simple search request.
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${AMPLEMARKET_BASE_URL}/people/search`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({
        person_name: "test",
        company_names: ["test"],
        page_size: 1,
      }),
    });

    // 200 or 404 (no results) means the key is valid
    // 401/403 means invalid key
    return res.status !== 401 && res.status !== 403;
  } catch {
    return false;
  }
}

/**
 * Enrich a batch of leads with rate limiting.
 * Tries LinkedIn URL first (if available), then falls back to name + company.
 */
export async function enrichBatch(
  leads: Array<{
    id: string;
    firstName: string;
    lastName: string;
    company: string;
    linkedinUrl?: string;
  }>,
  apiKey?: string,
  delayMs = 500,
  onProgress?: (result: EnrichmentResult) => void
): Promise<EnrichmentResult[]> {
  const results: EnrichmentResult[] = [];

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const fullName = `${lead.firstName} ${lead.lastName}`.trim();

    console.log(
      `[amplemarket] Enriching ${i + 1}/${leads.length}: ${fullName} at ${lead.company}`
    );

    try {
      let person: AmplemarketPerson | null = null;

      // Strategy 1: Try LinkedIn URL if available
      if (lead.linkedinUrl) {
        person = await enrichPerson({ linkedinUrl: lead.linkedinUrl }, apiKey);
      }

      // Strategy 2: Fall back to name + company search
      if (!person || !person.email) {
        person = await searchPerson(fullName, [lead.company], apiKey);
      }

      // Strategy 3: Try enrichPerson with name + company
      if (!person || !person.email) {
        person = await enrichPerson(
          { name: fullName, companyName: lead.company },
          apiKey
        );
      }

      if (person && person.email) {
        const result: EnrichmentResult = {
          leadId: lead.id,
          success: true,
          email: person.email,
          phone: person.phone_numbers?.[0]?.number,
          companyDomain: person.company?.domain || undefined,
          title: person.title || undefined,
        };
        results.push(result);
        onProgress?.(result);
      } else {
        const result: EnrichmentResult = {
          leadId: lead.id,
          success: false,
          error: "No email found",
        };
        results.push(result);
        onProgress?.(result);
      }
    } catch (err) {
      const result: EnrichmentResult = {
        leadId: lead.id,
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
      results.push(result);
      onProgress?.(result);
    }

    // Rate limiting: wait between calls
    if (i < leads.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
