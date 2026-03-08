/**
 * HubSpot Associations API helpers for entity graph backfill.
 *
 * Provides batch association lookups (contact→company, deal→company,
 * contact→deal) and company search by domain. All functions respect
 * rate limits and return structured maps.
 *
 * Phase 1.5 — Entity Graph Backfill
 */

import { hubspotFetch } from "./hubspot";

// ─── Types ───────────────────────────────────────────────────────

export interface ContactAssociations {
  hubspotContactId: string;
  companyIds: string[];
  dealIds: string[];
}

export interface HubSpotCompanySearchResult {
  id: string;
  domain: string;
  name: string;
}

export interface CompanyBatchReadResult {
  status: string;
  results: Array<{
    id: string;
    properties: Record<string, string | null>;
  }>;
}

interface AssociationBatchResult {
  results: Array<{
    from: { id: string };
    // V3 API returns { id, type }, V4 returns { toObjectId, associationTypes }
    to: Array<{ id?: string; toObjectId?: string; type?: string; associationTypes?: unknown[] }>;
  }>;
}

interface ContactsPageResult {
  results: Array<{
    id: string;
    properties: Record<string, string | null>;
    associations?: Record<
      string,
      { results: Array<{ id: string; type: string }> }
    >;
  }>;
  paging?: { next?: { after: string } };
}

interface CompanySearchResult {
  total: number;
  results: Array<{
    id: string;
    properties: Record<string, string | null>;
  }>;
}

// ─── Rate Limiter ────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_CALLS = 90; // leave headroom below HubSpot's 100/10s
const callTimestamps: number[] = [];

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  // Purge timestamps outside window
  while (callTimestamps.length > 0 && now - callTimestamps[0] > RATE_LIMIT_WINDOW_MS) {
    callTimestamps.shift();
  }
  if (callTimestamps.length >= RATE_LIMIT_MAX_CALLS) {
    const waitMs = RATE_LIMIT_WINDOW_MS - (now - callTimestamps[0]) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  callTimestamps.push(Date.now());
}

// ─── API Call Counter ────────────────────────────────────────────

let _apiCallCount = 0;

export function getApiCallCount(): number {
  return _apiCallCount;
}

export function resetApiCallCount(): void {
  _apiCallCount = 0;
}

// ─── Company Search by Domain ────────────────────────────────────

/**
 * Search HubSpot for a company by domain.
 * Returns null if not found, the match if exactly one, or null if ambiguous.
 */
export async function searchCompanyByDomain(
  accessToken: string,
  domain: string
): Promise<{ result: HubSpotCompanySearchResult | null; ambiguous: boolean }> {
  await enforceRateLimit();
  _apiCallCount++;

  const normalizedDomain = domain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");

  try {
    const response = (await hubspotFetch(
      "/crm/v3/objects/companies/search",
      accessToken,
      {
        method: "POST",
        body: {
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "domain",
                  operator: "EQ",
                  value: normalizedDomain,
                },
              ],
            },
          ],
          properties: ["domain", "name"],
          limit: 5,
        },
      }
    )) as CompanySearchResult;

    if (!response.results?.length) {
      return { result: null, ambiguous: false };
    }

    if (response.results.length > 1) {
      return { result: null, ambiguous: true };
    }

    const company = response.results[0];
    return {
      result: {
        id: company.id,
        domain: company.properties.domain || normalizedDomain,
        name: company.properties.name || "",
      },
      ambiguous: false,
    };
  } catch {
    return { result: null, ambiguous: false };
  }
}

// ─── Pull All Contacts with Associations ─────────────────────────

/**
 * Pull all HubSpot contacts with their company and deal associations.
 * Returns a Map keyed by normalized (lowercase, trimmed) email.
 *
 * Contacts with duplicate emails are marked ambiguous and excluded
 * unless they share the same association set.
 */
export async function pullContactAssociations(
  accessToken: string,
  opts?: { maxApiCalls?: number; limit?: number }
): Promise<{
  map: Map<string, ContactAssociations>;
  totalFetched: number;
  duplicateEmails: string[];
}> {
  const maxCalls = opts?.maxApiCalls ?? 50;
  const recordLimit = opts?.limit ?? Infinity;
  const rawMap = new Map<string, ContactAssociations[]>(); // email → all entries
  let totalFetched = 0;
  let after: string | undefined;
  let callsUsed = 0;

  do {
    if (callsUsed >= maxCalls) break;
    if (totalFetched >= recordLimit) break;

    await enforceRateLimit();
    _apiCallCount++;
    callsUsed++;

    const params = new URLSearchParams({
      properties: "email",
      associations: "companies,deals",
      limit: "100",
    });
    if (after) params.set("after", after);

    const page = (await hubspotFetch(
      `/crm/v3/objects/contacts?${params.toString()}`,
      accessToken
    )) as ContactsPageResult;

    if (!page.results?.length) break;

    for (const contact of page.results) {
      if (totalFetched >= recordLimit) break;

      const rawEmail = contact.properties?.email;
      if (!rawEmail) continue;

      const email = rawEmail.toLowerCase().trim();
      if (!email || !email.includes("@")) continue;

      const companyIds: string[] = [];
      const dealIds: string[] = [];

      if (contact.associations?.companies?.results) {
        for (const assoc of contact.associations.companies.results) {
          if (assoc.id && !companyIds.includes(assoc.id)) {
            companyIds.push(assoc.id);
          }
        }
      }

      if (contact.associations?.deals?.results) {
        for (const assoc of contact.associations.deals.results) {
          if (assoc.id && !dealIds.includes(assoc.id)) {
            dealIds.push(assoc.id);
          }
        }
      }

      const entry: ContactAssociations = {
        hubspotContactId: contact.id,
        companyIds,
        dealIds,
      };

      const existing = rawMap.get(email);
      if (existing) {
        existing.push(entry);
      } else {
        rawMap.set(email, [entry]);
      }

      totalFetched++;
    }

    after = page.paging?.next?.after;
  } while (after);

  // Deduplicate: if same email has multiple HubSpot contacts,
  // only keep it if all contacts agree on the same associations
  const finalMap = new Map<string, ContactAssociations>();
  const duplicateEmails: string[] = [];

  for (const [email, entries] of rawMap) {
    if (entries.length === 1) {
      finalMap.set(email, entries[0]);
    } else {
      // Check if all entries have identical associations
      const first = entries[0];
      const allSame = entries.every(
        (e) =>
          e.companyIds.sort().join(",") === first.companyIds.sort().join(",") &&
          e.dealIds.sort().join(",") === first.dealIds.sort().join(",")
      );

      if (allSame) {
        finalMap.set(email, first);
      } else {
        duplicateEmails.push(email);
        // Do NOT include — ambiguous
      }
    }
  }

  return { map: finalMap, totalFetched, duplicateEmails };
}

// ─── Deal→Company Associations (Batch) ───────────────────────────

/**
 * Batch-read deal→company associations from HubSpot.
 * Returns Map<hubspotDealId, hubspotCompanyIds[]>.
 *
 * Chunks input into batches of batchSize (max 100).
 */
export async function getDealCompanyAssociations(
  accessToken: string,
  dealIds: string[],
  opts?: { batchSize?: number; maxApiCalls?: number }
): Promise<Map<string, string[]>> {
  const batchSize = Math.min(opts?.batchSize ?? 100, 100);
  const maxCalls = opts?.maxApiCalls ?? 50;
  const result = new Map<string, string[]>();
  let callsUsed = 0;

  for (let i = 0; i < dealIds.length; i += batchSize) {
    if (callsUsed >= maxCalls) break;

    const chunk = dealIds.slice(i, i + batchSize);
    await enforceRateLimit();
    _apiCallCount++;
    callsUsed++;

    try {
      const response = (await hubspotFetch(
        "/crm/v3/associations/deals/companies/batch/read",
        accessToken,
        {
          method: "POST",
          body: { inputs: chunk.map((id) => ({ id })) },
        }
      )) as AssociationBatchResult;

      if (response.results) {
        for (const item of response.results) {
          // Support both V3 ({ id, type }) and V4 ({ toObjectId }) response formats
          const companyIds = (item.to || [])
            .map((t) => t.toObjectId || t.id)
            .filter((id): id is string => !!id);
          result.set(item.from.id, companyIds);
        }
      }
    } catch {
      // Log and continue — partial results are acceptable
      console.error(
        `[backfill] Failed to fetch deal→company associations for batch starting at index ${i}`
      );
    }
  }

  return result;
}

// ─── Batch Read Company Properties ───────────────────────────────

/**
 * Batch-read company properties (name, domain) from HubSpot.
 * Returns Map<hubspotCompanyId, { name, domain }>.
 *
 * Chunks input into batches of batchSize (max 100).
 */
export async function getCompanyProperties(
  accessToken: string,
  companyIds: string[],
  opts?: { batchSize?: number; maxApiCalls?: number }
): Promise<Map<string, { name: string; domain: string }>> {
  const batchSize = Math.min(opts?.batchSize ?? 100, 100);
  const maxCalls = opts?.maxApiCalls ?? 50;
  const result = new Map<string, { name: string; domain: string }>();
  let callsUsed = 0;

  for (let i = 0; i < companyIds.length; i += batchSize) {
    if (callsUsed >= maxCalls) break;

    const chunk = companyIds.slice(i, i + batchSize);
    await enforceRateLimit();
    _apiCallCount++;
    callsUsed++;

    try {
      const response = (await hubspotFetch(
        "/crm/v3/objects/companies/batch/read",
        accessToken,
        {
          method: "POST",
          body: {
            properties: ["name", "domain"],
            inputs: chunk.map((id) => ({ id })),
          },
        }
      )) as CompanyBatchReadResult;

      if (response.results) {
        for (const company of response.results) {
          result.set(company.id, {
            name: company.properties.name || "",
            domain: company.properties.domain || "",
          });
        }
      }
    } catch {
      console.error(
        `[backfill] Failed to batch-read company properties starting at index ${i}`
      );
    }
  }

  return result;
}
