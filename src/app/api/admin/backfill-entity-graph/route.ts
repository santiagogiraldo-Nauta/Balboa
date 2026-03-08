import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  searchCompanyByDomain,
  pullContactAssociations,
  getDealCompanyAssociations,
  getCompanyProperties,
  getApiCallCount,
  resetApiCallCount,
} from "@/lib/hubspot-associations";

// ─── Types ───────────────────────────────────────────────────────

interface ProposedUpdate {
  table: "leads" | "deals" | "accounts";
  id: string;
  field: string;
  proposed_value: string;
  reason: string;
}

interface StepResult {
  description: string;
  eligible: number;
  matched: number;
  ambiguous: number;
  no_match: number;
  would_update: number;
  updated: number;
  skipped: number;
  errors: string[];
}

function emptyStepResult(description: string): StepResult {
  return {
    description,
    eligible: 0,
    matched: 0,
    ambiguous: 0,
    no_match: 0,
    would_update: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };
}

interface Step1_5Result {
  description: string;
  deals_checked: number;
  deals_with_company: number;
  unique_companies_found: number;
  already_in_accounts: number;
  missing_name_and_domain: number;
  duplicate_domains: number;
  would_create: number;
  created: number;
  errors: string[];
  new_accounts: Array<{
    hubspot_company_id: string;
    company_name: string;
    domain: string;
  }>;
}

function normalizeDomain(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "")    // strip path, query, fragment
    .replace(/\/+$/, "")
    .trim();
}

// ─── Apply Updates ───────────────────────────────────────────────

async function applyUpdates(
  supabase: SupabaseClient,
  updates: ProposedUpdate[],
  mode: "dry-run" | "live"
): Promise<{ applied: number; skipped: number; errors: string[] }> {
  if (mode === "dry-run") {
    return { applied: 0, skipped: updates.length, errors: [] };
  }

  let applied = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const update of updates) {
    const { data, error } = await supabase
      .from(update.table)
      .update({ [update.field]: update.proposed_value })
      .eq("id", update.id)
      .is(update.field, null)
      .select("id");

    if (error) {
      errors.push(`${update.table}/${update.id}: ${error.message}`);
    } else if (!data || data.length === 0) {
      skipped++; // field was already populated
    } else {
      applied++;
    }
  }

  return { applied, skipped, errors };
}

// ─── Step 1: accounts.hubspot_company_id ─────────────────────────

async function step1_populateAccountCompanyIds(
  supabase: SupabaseClient,
  accessToken: string,
  userId: string,
  mode: "dry-run" | "live"
): Promise<StepResult> {
  const result = emptyStepResult(
    "Populate accounts.hubspot_company_id via HubSpot company domain search"
  );

  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("id, website, hubspot_company_id")
    .eq("user_id", userId)
    .is("hubspot_company_id", null)
    .not("website", "is", null);

  if (error) {
    result.errors.push(`Query failed: ${error.message}`);
    return result;
  }
  if (!accounts?.length) return result;

  result.eligible = accounts.length;
  const updates: ProposedUpdate[] = [];

  for (const account of accounts) {
    const domain = (account.website || "")
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/+$/, "");

    if (!domain) {
      result.no_match++;
      continue;
    }

    const { result: company, ambiguous } = await searchCompanyByDomain(
      accessToken,
      domain
    );

    if (ambiguous) {
      result.ambiguous++;
      continue;
    }

    if (!company) {
      result.no_match++;
      continue;
    }

    result.matched++;
    updates.push({
      table: "accounts",
      id: account.id,
      field: "hubspot_company_id",
      proposed_value: company.id,
      reason: `HubSpot company ${company.id} (${company.name}) matched domain "${domain}"`,
    });
  }

  result.would_update = updates.length;
  const applied = await applyUpdates(supabase, updates, mode);
  result.updated = applied.applied;
  result.skipped = applied.skipped;
  result.errors.push(...applied.errors);

  return result;
}

// ─── Step 1.5: Expand Account Coverage ───────────────────────────

/**
 * Create Balboa account rows for HubSpot companies associated with
 * existing deals that don't already have a matching account.
 *
 * INSERT only — no schema changes, no destructive writes.
 * Deduplicates by domain and skips companies missing both name and domain.
 */
async function step1_5_expandAccountCoverage(
  supabase: SupabaseClient,
  accessToken: string,
  userId: string,
  mode: "dry-run" | "live",
  opts?: { batchSize?: number; maxApiCalls?: number }
): Promise<Step1_5Result> {
  const result: Step1_5Result = {
    description:
      "Expand accounts by creating rows for HubSpot companies associated with existing deals",
    deals_checked: 0,
    deals_with_company: 0,
    unique_companies_found: 0,
    already_in_accounts: 0,
    missing_name_and_domain: 0,
    duplicate_domains: 0,
    would_create: 0,
    created: 0,
    errors: [],
    new_accounts: [],
  };

  // 1. Get all deals with hubspot_deal_id
  const dealHsMap = await buildDealHsDealIdMap(supabase, userId);
  const hsDealIds = [...dealHsMap.keys()];
  result.deals_checked = hsDealIds.length;

  if (hsDealIds.length === 0) return result;

  // 2. Batch-read deal→company associations from HubSpot
  const dealCompanyMap = await getDealCompanyAssociations(
    accessToken,
    hsDealIds,
    {
      batchSize: opts?.batchSize ?? 100,
      maxApiCalls: opts?.maxApiCalls,
    }
  );

  // 3. Collect unique company IDs
  const allCompanyIds = new Set<string>();
  for (const [, companyIds] of dealCompanyMap) {
    if (companyIds.length > 0) {
      result.deals_with_company++;
      for (const cid of companyIds) {
        allCompanyIds.add(cid);
      }
    }
  }
  result.unique_companies_found = allCompanyIds.size;

  if (allCompanyIds.size === 0) return result;

  // 4. Filter out companies already in accounts table (by hubspot_company_id)
  const existingHsIds = await buildAccountHsIdMap(supabase, userId);
  const newCompanyIds: string[] = [];
  for (const cid of allCompanyIds) {
    if (existingHsIds.has(cid)) {
      result.already_in_accounts++;
    } else {
      newCompanyIds.push(cid);
    }
  }

  if (newCompanyIds.length === 0) return result;

  // 5. Batch-read company properties (name, domain) from HubSpot
  const companyProps = await getCompanyProperties(accessToken, newCompanyIds, {
    batchSize: opts?.batchSize ?? 100,
    maxApiCalls: opts?.maxApiCalls,
  });

  // 6. Quality check — collect existing account domains for dedup
  const { data: existingAccounts } = await supabase
    .from("accounts")
    .select("website")
    .eq("user_id", userId)
    .not("website", "is", null);

  const existingDomains = new Set<string>();
  if (existingAccounts) {
    for (const acc of existingAccounts) {
      const d = normalizeDomain(acc.website || "");
      if (d) existingDomains.add(d);
    }
  }

  // Group new companies by normalized domain to detect duplicates
  const byDomain = new Map<
    string,
    Array<{ hsId: string; name: string; domain: string }>
  >();
  const noDomainCompanies: Array<{
    hsId: string;
    name: string;
    domain: string;
  }> = [];

  for (const hsId of newCompanyIds) {
    const props = companyProps.get(hsId);
    if (!props) continue; // API didn't return this company

    const name = props.name.trim();
    const domain = normalizeDomain(props.domain);

    if (!name && !domain) {
      result.missing_name_and_domain++;
      continue;
    }

    // Skip if domain already exists in accounts (website dedup)
    if (domain && existingDomains.has(domain)) {
      result.already_in_accounts++;
      continue;
    }

    if (!domain) {
      // No domain — can still create if has name, but can't dedup by domain
      noDomainCompanies.push({ hsId, name, domain: "" });
      continue;
    }

    const group = byDomain.get(domain) || [];
    group.push({ hsId, name, domain });
    byDomain.set(domain, group);
  }

  // Resolve domain groups — skip ambiguous (multiple HS companies, same domain)
  const toCreate: Array<{ hsId: string; name: string; domain: string }> = [];

  for (const [, companies] of byDomain) {
    if (companies.length > 1) {
      result.duplicate_domains += companies.length;
      continue;
    }
    toCreate.push(companies[0]);
  }

  // Add no-domain companies (can't conflict by domain)
  toCreate.push(...noDomainCompanies);

  result.would_create = toCreate.length;
  result.new_accounts = toCreate.map((c) => ({
    hubspot_company_id: c.hsId,
    company_name: c.name || `HubSpot Company ${c.hsId}`,
    domain: c.domain,
  }));

  // 7. INSERT new accounts (or just report in dry-run)
  if (mode === "dry-run") return result;

  for (const company of toCreate) {
    const { error } = await supabase.from("accounts").insert({
      user_id: userId,
      company_name: company.name || `HubSpot Company ${company.hsId}`,
      website: company.domain || null,
      hubspot_company_id: company.hsId,
    });

    if (error) {
      result.errors.push(
        `INSERT account for HS company ${company.hsId}: ${error.message}`
      );
    } else {
      result.created++;
    }
  }

  return result;
}

// ─── Step 2: Pull contact associations map ───────────────────────

interface Step2Result {
  description: string;
  hubspot_contacts_fetched: number;
  emails_mapped: number;
  duplicate_emails: string[];
  api_calls: number;
}

async function step2_pullContactAssociations(
  accessToken: string,
  opts?: { maxApiCalls?: number; limit?: number }
): Promise<{
  map: Map<string, { hubspotContactId: string; companyIds: string[]; dealIds: string[] }>;
  stepResult: Step2Result;
}> {
  const callsBefore = getApiCallCount();

  const { map, totalFetched, duplicateEmails } =
    await pullContactAssociations(accessToken, {
      maxApiCalls: opts?.maxApiCalls,
      limit: opts?.limit,
    });

  const callsAfter = getApiCallCount();

  return {
    map,
    stepResult: {
      description:
        "Pull all HubSpot contacts with company + deal associations",
      hubspot_contacts_fetched: totalFetched,
      emails_mapped: map.size,
      duplicate_emails: duplicateEmails,
      api_calls: callsAfter - callsBefore,
    },
  };
}

// ─── Step 3: leads.account_id ────────────────────────────────────

async function step3_populateLeadAccountIds(
  supabase: SupabaseClient,
  userId: string,
  contactMap: Map<string, { companyIds: string[] }>,
  accountsByHsId: Map<string, string>, // hsCompanyId → supabase account UUID
  mode: "dry-run" | "live"
): Promise<StepResult> {
  const result = emptyStepResult(
    "Populate leads.account_id via contact→company associations"
  );

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, email, account_id")
    .eq("user_id", userId)
    .is("account_id", null)
    .not("email", "is", null);

  if (error) {
    result.errors.push(`Query failed: ${error.message}`);
    return result;
  }
  if (!leads?.length) return result;

  result.eligible = leads.length;
  const updates: ProposedUpdate[] = [];

  for (const lead of leads) {
    const email = (lead.email || "").toLowerCase().trim();
    if (!email) {
      result.no_match++;
      continue;
    }

    const contact = contactMap.get(email);
    if (!contact || contact.companyIds.length === 0) {
      result.no_match++;
      continue;
    }

    // Resolve HubSpot company IDs to Supabase account UUIDs
    const matchedAccountIds: string[] = [];
    for (const hsCompanyId of contact.companyIds) {
      const accountUuid = accountsByHsId.get(hsCompanyId);
      if (accountUuid) matchedAccountIds.push(accountUuid);
    }

    if (matchedAccountIds.length === 0) {
      result.no_match++;
      continue;
    }

    if (matchedAccountIds.length > 1) {
      // Deduplicate — if all point to the same UUID, it's fine
      const unique = [...new Set(matchedAccountIds)];
      if (unique.length > 1) {
        result.ambiguous++;
        continue;
      }
    }

    const accountUuid = matchedAccountIds[0];
    result.matched++;
    updates.push({
      table: "leads",
      id: lead.id,
      field: "account_id",
      proposed_value: accountUuid,
      reason: `Email "${email}" → HubSpot company ${contact.companyIds[0]} → account ${accountUuid}`,
    });
  }

  result.would_update = updates.length;
  const applied = await applyUpdates(supabase, updates, mode);
  result.updated = applied.applied;
  result.skipped += applied.skipped;
  result.errors.push(...applied.errors);

  return result;
}

// ─── Step 4: deals.account_id ────────────────────────────────────

async function step4_populateDealAccountIds(
  supabase: SupabaseClient,
  accessToken: string,
  userId: string,
  accountsByHsId: Map<string, string>,
  mode: "dry-run" | "live",
  opts?: { batchSize?: number; maxApiCalls?: number }
): Promise<StepResult> {
  const result = emptyStepResult(
    "Populate deals.account_id via deal→company associations"
  );

  const { data: deals, error } = await supabase
    .from("deals")
    .select("id, hubspot_deal_id, account_id")
    .eq("user_id", userId)
    .is("account_id", null)
    .not("hubspot_deal_id", "is", null);

  if (error) {
    result.errors.push(`Query failed: ${error.message}`);
    return result;
  }
  if (!deals?.length) return result;

  result.eligible = deals.length;

  // Build hubspot_deal_id → supabase deal UUID map
  const dealsByHsDealId = new Map<string, string>();
  for (const deal of deals) {
    dealsByHsDealId.set(deal.hubspot_deal_id, deal.id);
  }

  // Batch-read deal→company associations from HubSpot
  const hsDealIds = deals.map((d) => d.hubspot_deal_id as string);
  const dealCompanyMap = await getDealCompanyAssociations(
    accessToken,
    hsDealIds,
    {
      batchSize: opts?.batchSize ?? 100,
      maxApiCalls: opts?.maxApiCalls,
    }
  );

  const updates: ProposedUpdate[] = [];

  for (const deal of deals) {
    const hsDealId = deal.hubspot_deal_id as string;
    const companyIds = dealCompanyMap.get(hsDealId);

    if (!companyIds || companyIds.length === 0) {
      result.no_match++;
      continue;
    }

    // Resolve to Supabase account UUIDs
    const matchedAccountIds: string[] = [];
    for (const hsCompanyId of companyIds) {
      const accountUuid = accountsByHsId.get(hsCompanyId);
      if (accountUuid) matchedAccountIds.push(accountUuid);
    }

    if (matchedAccountIds.length === 0) {
      result.no_match++;
      continue;
    }

    const unique = [...new Set(matchedAccountIds)];
    if (unique.length > 1) {
      result.ambiguous++;
      continue;
    }

    result.matched++;
    updates.push({
      table: "deals",
      id: deal.id,
      field: "account_id",
      proposed_value: unique[0],
      reason: `HubSpot deal ${hsDealId} → company ${companyIds[0]} → account ${unique[0]}`,
    });
  }

  result.would_update = updates.length;
  const applied = await applyUpdates(supabase, updates, mode);
  result.updated = applied.applied;
  result.skipped += applied.skipped;
  result.errors.push(...applied.errors);

  return result;
}

// ─── Step 5: leads.deal_id ───────────────────────────────────────

async function step5_populateLeadDealIds(
  supabase: SupabaseClient,
  userId: string,
  contactMap: Map<string, { dealIds: string[] }>,
  dealsByHsDealId: Map<string, string>, // hsDeaId → supabase deal UUID
  mode: "dry-run" | "live"
): Promise<StepResult> {
  const result = emptyStepResult(
    "Populate leads.deal_id via contact→deal associations"
  );

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, email, deal_id")
    .eq("user_id", userId)
    .is("deal_id", null)
    .not("email", "is", null);

  if (error) {
    result.errors.push(`Query failed: ${error.message}`);
    return result;
  }
  if (!leads?.length) return result;

  result.eligible = leads.length;
  const updates: ProposedUpdate[] = [];

  for (const lead of leads) {
    const email = (lead.email || "").toLowerCase().trim();
    if (!email) {
      result.no_match++;
      continue;
    }

    const contact = contactMap.get(email);
    if (!contact || contact.dealIds.length === 0) {
      result.no_match++;
      continue;
    }

    // Resolve HubSpot deal IDs to Supabase deal UUIDs
    const matchedDealIds: string[] = [];
    for (const hsDealId of contact.dealIds) {
      const dealUuid = dealsByHsDealId.get(hsDealId);
      if (dealUuid) matchedDealIds.push(dealUuid);
    }

    if (matchedDealIds.length === 0) {
      result.no_match++;
      continue;
    }

    const unique = [...new Set(matchedDealIds)];
    if (unique.length > 1) {
      result.ambiguous++;
      continue;
    }

    result.matched++;
    updates.push({
      table: "leads",
      id: lead.id,
      field: "deal_id",
      proposed_value: unique[0],
      reason: `Email "${email}" → HubSpot deal ${contact.dealIds[0]} → deal ${unique[0]}`,
    });
  }

  result.would_update = updates.length;
  const applied = await applyUpdates(supabase, updates, mode);
  result.updated = applied.applied;
  result.skipped += applied.skipped;
  result.errors.push(...applied.errors);

  return result;
}

// ─── Build Lookup Maps ───────────────────────────────────────────

async function buildAccountHsIdMap(
  supabase: SupabaseClient,
  userId: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data } = await supabase
    .from("accounts")
    .select("id, hubspot_company_id")
    .eq("user_id", userId)
    .not("hubspot_company_id", "is", null);

  if (data) {
    for (const row of data) {
      if (row.hubspot_company_id) {
        map.set(row.hubspot_company_id, row.id);
      }
    }
  }
  return map;
}

async function buildDealHsDealIdMap(
  supabase: SupabaseClient,
  userId: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  // Paginate — 956 deals, fetch 500 at a time
  let offset = 0;
  const pageSize = 500;

  while (true) {
    const { data } = await supabase
      .from("deals")
      .select("id, hubspot_deal_id")
      .eq("user_id", userId)
      .not("hubspot_deal_id", "is", null)
      .range(offset, offset + pageSize - 1);

    if (!data?.length) break;

    for (const row of data) {
      if (row.hubspot_deal_id) {
        map.set(row.hubspot_deal_id, row.id);
      }
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return map;
}

// ─── Main Route ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    secret,
    userId,
    mode = "dry-run",
    step = "all",
    batchSize = 100,
    maxHubspotCalls = 50,
    limit,
  } = body as {
    secret?: string;
    userId?: string;
    mode?: "dry-run" | "live";
    step?: "all" | "1" | "1.5" | "2" | "3" | "4" | "5";
    batchSize?: number;
    maxHubspotCalls?: number;
    limit?: number;
  };

  // ─── Auth ──────────────────────────────────────────────────────

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret !== serviceKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!userId) {
    return NextResponse.json(
      { error: "userId required" },
      { status: 400 }
    );
  }

  if (mode !== "dry-run" && mode !== "live") {
    return NextResponse.json(
      { error: 'mode must be "dry-run" or "live"' },
      { status: 400 }
    );
  }

  // ─── HubSpot Token ────────────────────────────────────────────

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey!,
    { db: { schema: "public" }, auth: { persistSession: false } }
  );

  let accessToken = process.env.HUBSPOT_ACCESS_TOKEN || "";

  if (!accessToken) {
    const { data: integration } = await supabase
      .from("integration_configs")
      .select("config")
      .eq("user_id", userId)
      .eq("platform", "hubspot")
      .eq("status", "connected")
      .single();

    if (!integration) {
      return NextResponse.json(
        {
          error:
            "HubSpot not connected. Set HUBSPOT_ACCESS_TOKEN or connect via OAuth.",
        },
        { status: 400 }
      );
    }

    const config = integration.config as Record<string, unknown>;
    accessToken = config.access_token as string;
  }

  if (!accessToken) {
    return NextResponse.json(
      { error: "No HubSpot access token available" },
      { status: 400 }
    );
  }

  // ─── Execute Pipeline ─────────────────────────────────────────

  const startedAt = new Date().toISOString();
  resetApiCallCount();
  const clampedBatchSize = Math.min(Math.max(batchSize, 10), 100);

  const steps: Record<string, StepResult | Step2Result | Step1_5Result> = {};
  // Step 1.5 is explicit-only (not included in "all") — it's a one-time expansion
  const shouldRun = (s: string) =>
    s === "1.5" ? step === "1.5" : step === "all" || step === s;

  // Contact map — shared between steps 3 and 5
  let contactMap: Map<
    string,
    { hubspotContactId: string; companyIds: string[]; dealIds: string[] }
  > | null = null;

  // Step 1
  if (shouldRun("1")) {
    console.log(`[backfill] Step 1: accounts.hubspot_company_id (mode=${mode})`);
    steps["1"] = await step1_populateAccountCompanyIds(
      supabase,
      accessToken,
      userId,
      mode
    );
  }

  // Step 1.5 — explicit-only account expansion
  if (shouldRun("1.5")) {
    console.log(`[backfill] Step 1.5: expand account coverage (mode=${mode})`);
    steps["1.5"] = await step1_5_expandAccountCoverage(
      supabase,
      accessToken,
      userId,
      mode,
      {
        batchSize: clampedBatchSize,
        maxApiCalls: maxHubspotCalls,
      }
    );
  }

  // Step 2 — always runs if steps 3 or 5 need it
  const needContactMap =
    shouldRun("2") || shouldRun("3") || shouldRun("5") || step === "all";

  if (needContactMap) {
    console.log(`[backfill] Step 2: pulling contact associations`);
    const s2 = await step2_pullContactAssociations(accessToken, {
      maxApiCalls: maxHubspotCalls,
      limit,
    });
    contactMap = s2.map;
    steps["2"] = s2.stepResult;
  }

  // Build lookup maps — refresh after Step 1 may have populated company IDs
  const accountsByHsId = await buildAccountHsIdMap(supabase, userId);
  const dealsByHsDealId = await buildDealHsDealIdMap(supabase, userId);

  // Step 3
  if (shouldRun("3") && contactMap) {
    console.log(`[backfill] Step 3: leads.account_id (mode=${mode})`);
    steps["3"] = await step3_populateLeadAccountIds(
      supabase,
      userId,
      contactMap,
      accountsByHsId,
      mode
    );
  }

  // Step 4
  if (shouldRun("4")) {
    console.log(`[backfill] Step 4: deals.account_id (mode=${mode})`);
    steps["4"] = await step4_populateDealAccountIds(
      supabase,
      accessToken,
      userId,
      accountsByHsId,
      mode,
      {
        batchSize: clampedBatchSize,
        maxApiCalls: maxHubspotCalls,
      }
    );
  }

  // Step 5
  if (shouldRun("5") && contactMap) {
    console.log(`[backfill] Step 5: leads.deal_id (mode=${mode})`);
    steps["5"] = await step5_populateLeadDealIds(
      supabase,
      userId,
      contactMap,
      dealsByHsDealId,
      mode
    );
  }

  const completedAt = new Date().toISOString();
  const totalApiCalls = getApiCallCount();

  // Count total DB writes (updates + inserts)
  let totalUpdates = 0;
  for (const s of Object.values(steps)) {
    if ("updated" in s) totalUpdates += (s as StepResult).updated;
    if ("created" in s) totalUpdates += (s as Step1_5Result).created;
  }

  console.log(
    `[backfill] Complete: mode=${mode}, api_calls=${totalApiCalls}, db_updates=${totalUpdates}`
  );

  return NextResponse.json({
    success: true,
    mode,
    steps,
    audit: {
      started_at: startedAt,
      completed_at: completedAt,
      hubspot_api_calls: totalApiCalls,
      db_updates: totalUpdates,
    },
  });
}
