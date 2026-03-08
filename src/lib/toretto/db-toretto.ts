// ============================================================
// Toretto — Database Access Layer
// Reads from public.* (leads, accounts, deals) — NEVER writes
// Writes to toretto.* (raw_events, source_links, etc.) — service_role only
//
// Uses supabase.schema('toretto') for toretto.* tables.
// Follows same patterns as ../fire/db-fire.ts
// ============================================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type {
  RawEventRow,
  SourceLinkRow,
  UnresolvedQueueRow,
  InteractionRow,
  ProcessingStatus,
  EntityType,
  MatchConfidence,
  TorettoSource,
  AttemptedMatch,
} from "./types";

// ─── Service Client ──────────────────────────────────────────

let _serviceClient: SupabaseClient | null = null;

export function getTorettoServiceClient(): SupabaseClient | null {
  if (_serviceClient) return _serviceClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  _serviceClient = createClient(url, key, {
    auth: { persistSession: false },
  });
  return _serviceClient;
}

// Helper: get a schema-qualified client for toretto.*
function t(supabase: SupabaseClient) {
  return supabase.schema("toretto");
}

// ─── Raw Events ──────────────────────────────────────────────

export async function insertRawEvent(
  supabase: SupabaseClient,
  event: {
    source: TorettoSource;
    event_type: string;
    payload: Record<string, unknown>;
    idempotency_key?: string;
  }
): Promise<RawEventRow | null> {
  const { data, error } = await t(supabase)
    .from("raw_events")
    .insert([{
      source: event.source,
      event_type: event.event_type,
      payload: event.payload,
      idempotency_key: event.idempotency_key || null,
      processing_status: "pending" as ProcessingStatus,
    }])
    .select()
    .single();

  if (error) {
    console.error("[db-toretto] Error inserting raw_event:", error.message);
    return null;
  }
  return data as RawEventRow;
}

export async function getPendingRawEvents(
  supabase: SupabaseClient,
  limit: number = 50
): Promise<RawEventRow[]> {
  const { data, error } = await t(supabase)
    .from("raw_events")
    .select("*")
    .eq("processing_status", "pending")
    .order("received_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[db-toretto] Error fetching pending raw_events:", error.message);
    return [];
  }
  return (data || []) as RawEventRow[];
}

export async function updateRawEventStatus(
  supabase: SupabaseClient,
  eventId: string,
  status: ProcessingStatus,
  processingError?: string
): Promise<boolean> {
  const updates: Record<string, unknown> = { processing_status: status };
  if (processingError) updates.processing_error = processingError;

  const { error } = await t(supabase)
    .from("raw_events")
    .update(updates)
    .eq("id", eventId);

  if (error) {
    console.error("[db-toretto] Error updating raw_event status:", error.message);
    return false;
  }
  return true;
}

/**
 * Claim a batch of pending events for processing.
 * Sets status to 'processing' and returns the claimed rows.
 */
export async function claimPendingRawEvents(
  supabase: SupabaseClient,
  limit: number = 50
): Promise<RawEventRow[]> {
  const pending = await getPendingRawEvents(supabase, limit);
  if (!pending.length) return [];

  const ids = pending.map((e) => e.id);

  const { data, error } = await t(supabase)
    .from("raw_events")
    .update({ processing_status: "processing" as ProcessingStatus })
    .in("id", ids)
    .select("*");

  if (error) {
    console.error("[db-toretto] Error claiming raw_events:", error.message);
    return [];
  }
  return (data || []) as RawEventRow[];
}

// ─── Source Links ────────────────────────────────────────────

export async function upsertSourceLink(
  supabase: SupabaseClient,
  link: {
    entity_type: EntityType;
    source_system: TorettoSource;
    source_id: string;
    canonical_id: string | null;
    match_confidence: MatchConfidence;
    match_method: string;
  }
): Promise<SourceLinkRow | null> {
  const { data, error } = await t(supabase)
    .from("source_links")
    .upsert(
      [{
        entity_type: link.entity_type,
        source_system: link.source_system,
        source_id: link.source_id,
        canonical_id: link.canonical_id,
        match_confidence: link.match_confidence,
        match_method: link.match_method,
        resolved_at: link.canonical_id ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }],
      {
        onConflict: "source_system,source_id,entity_type",
        ignoreDuplicates: true,
      }
    )
    .select()
    .single();

  if (error) {
    // ignoreDuplicates returns PGRST116 when row already exists — not a real error
    if (error.code === "PGRST116") return null;
    console.error("[db-toretto] Error upserting source_link:", error.message);
    return null;
  }
  return data as SourceLinkRow;
}

export async function findSourceLink(
  supabase: SupabaseClient,
  sourceSystem: TorettoSource,
  sourceId: string,
  entityType?: EntityType
): Promise<SourceLinkRow | null> {
  let query = t(supabase)
    .from("source_links")
    .select("*")
    .eq("source_system", sourceSystem)
    .eq("source_id", sourceId);

  if (entityType) query = query.eq("entity_type", entityType);

  const { data, error } = await query.limit(1).single();

  if (error || !data) return null;
  return data as SourceLinkRow;
}

// ─── Unresolved Resolution Queue ─────────────────────────────

export async function insertUnresolvedEntry(
  supabase: SupabaseClient,
  entry: {
    raw_event_id: string;
    entity_type: EntityType;
    source_system: TorettoSource;
    source_id: string;
    attempted_matches: AttemptedMatch[];
  }
): Promise<UnresolvedQueueRow | null> {
  const { data, error } = await t(supabase)
    .from("unresolved_resolution_queue")
    .insert([{
      raw_event_id: entry.raw_event_id,
      entity_type: entry.entity_type,
      source_system: entry.source_system,
      source_id: entry.source_id,
      attempted_matches: entry.attempted_matches,
      resolution_attempts: 1,
      status: "pending",
    }])
    .select()
    .single();

  if (error) {
    console.error("[db-toretto] Error inserting unresolved entry:", error.message);
    return null;
  }
  return data as UnresolvedQueueRow;
}

export async function getPendingUnresolved(
  supabase: SupabaseClient,
  limit: number = 50
): Promise<UnresolvedQueueRow[]> {
  const { data, error } = await t(supabase)
    .from("unresolved_resolution_queue")
    .select("*")
    .eq("status", "pending")
    .order("last_attempt_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[db-toretto] Error fetching pending unresolved:", error.message);
    return [];
  }
  return (data || []) as UnresolvedQueueRow[];
}

export async function markUnresolvedResolved(
  supabase: SupabaseClient,
  queueId: string,
  canonicalId: string
): Promise<boolean> {
  const { error } = await t(supabase)
    .from("unresolved_resolution_queue")
    .update({
      status: "resolved",
      resolved_canonical_id: canonicalId,
      last_attempt_at: new Date().toISOString(),
    })
    .eq("id", queueId);

  if (error) {
    console.error("[db-toretto] Error marking unresolved as resolved:", error.message);
    return false;
  }
  return true;
}

// ─── Interactions ────────────────────────────────────────────

export async function insertInteraction(
  supabase: SupabaseClient,
  interaction: Omit<InteractionRow, "id" | "created_at">
): Promise<InteractionRow | null> {
  // Dedup: if source_system + source_id already exists, skip
  if (interaction.source_id) {
    const existing = await findInteractionBySource(
      supabase,
      interaction.source_system,
      interaction.source_id
    );
    if (existing) {
      console.log(`[db-toretto] Interaction already exists for ${interaction.source_system}:${interaction.source_id}`);
      return existing;
    }
  }

  const { data, error } = await t(supabase)
    .from("interactions")
    .insert([interaction])
    .select()
    .single();

  if (error) {
    console.error("[db-toretto] Error inserting interaction:", error.message);
    return null;
  }
  return data as InteractionRow;
}

export async function findInteractionBySource(
  supabase: SupabaseClient,
  sourceSystem: string,
  sourceId: string
): Promise<InteractionRow | null> {
  const { data, error } = await t(supabase)
    .from("interactions")
    .select("*")
    .eq("source_system", sourceSystem)
    .eq("source_id", sourceId)
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as InteractionRow;
}

export async function getInteractionsByContact(
  supabase: SupabaseClient,
  contactId: string,
  limit: number = 50
): Promise<InteractionRow[]> {
  const { data, error } = await t(supabase)
    .from("interactions")
    .select("*")
    .eq("contact_id", contactId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[db-toretto] Error fetching interactions by contact:", error.message);
    return [];
  }
  return (data || []) as InteractionRow[];
}

export async function getInteractionsByAccount(
  supabase: SupabaseClient,
  accountId: string,
  limit: number = 50
): Promise<InteractionRow[]> {
  const { data, error } = await t(supabase)
    .from("interactions")
    .select("*")
    .eq("account_id", accountId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[db-toretto] Error fetching interactions by account:", error.message);
    return [];
  }
  return (data || []) as InteractionRow[];
}

export async function getInteractionsByDeal(
  supabase: SupabaseClient,
  dealId: string,
  limit: number = 50
): Promise<InteractionRow[]> {
  const { data, error } = await t(supabase)
    .from("interactions")
    .select("*")
    .eq("deal_id", dealId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[db-toretto] Error fetching interactions by deal:", error.message);
    return [];
  }
  return (data || []) as InteractionRow[];
}

// ─── Public Schema Reads (for resolver) ──────────────────────
// Toretto reads from public.* but NEVER writes to public.*

export async function findLeadByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<{ id: string; email: string; user_id: string; linkedin_url: string | null; raw_data: Record<string, unknown> } | null> {
  const { data, error } = await supabase
    .from("leads")
    .select("id, email, user_id, linkedin_url, raw_data")
    .ilike("email", email)
    .limit(1)
    .single();

  if (error || !data) return null;
  return data;
}

export async function findLeadByLinkedIn(
  supabase: SupabaseClient,
  linkedinUrl: string
): Promise<{ id: string; email: string | null; user_id: string; linkedin_url: string } | null> {
  const normalized = linkedinUrl
    .replace(/\/+$/, "")
    .replace(/^https?:\/\/(www\.)?/, "");

  const { data, error } = await supabase
    .from("leads")
    .select("id, email, user_id, linkedin_url")
    .not("linkedin_url", "is", null)
    .limit(100);

  if (error || !data?.length) return null;

  const match = data.find((lead: { linkedin_url: string | null }) => {
    const leadUrl = (lead.linkedin_url || "")
      .replace(/\/+$/, "")
      .replace(/^https?:\/\/(www\.)?/, "");
    return leadUrl === normalized;
  });

  return match || null;
}

export async function findAccountByDomain(
  supabase: SupabaseClient,
  domain: string
): Promise<{ id: string; website: string; company_name: string } | null> {
  // 920 accounts — fetch all with website and match domain in-app
  const { data, error } = await supabase
    .from("accounts")
    .select("id, website, company_name")
    .not("website", "is", null);

  if (error || !data?.length) return null;

  const normalizedDomain = domain.toLowerCase().replace(/^www\./, "");

  const match = data.find((account: { website: string | null }) => {
    const accountDomain = (account.website || "")
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/+$/, "");
    return accountDomain === normalizedDomain || accountDomain.startsWith(normalizedDomain);
  });

  return match || null;
}

export async function findDealByHubSpotId(
  supabase: SupabaseClient,
  hubspotDealId: string
): Promise<{ id: string; hubspot_deal_id: string; deal_name: string; account_id: string | null } | null> {
  const { data, error } = await supabase
    .from("deals")
    .select("id, hubspot_deal_id, deal_name, account_id")
    .eq("hubspot_deal_id", hubspotDealId)
    .limit(1)
    .single();

  if (error || !data) return null;
  return data;
}

/**
 * Get FK references from a lead (for FK propagation in resolver).
 * Returns the lead's account_id and deal_id if populated.
 */
export async function findLeadFKs(
  supabase: SupabaseClient,
  leadId: string
): Promise<{ account_id: string | null; deal_id: string | null } | null> {
  const { data, error } = await supabase
    .from("leads")
    .select("account_id, deal_id")
    .eq("id", leadId)
    .limit(1)
    .single();

  if (error || !data) return null;
  return data;
}

/**
 * Get a deal's account_id by deal UUID (for deal→account cascade).
 */
export async function findDealAccountId(
  supabase: SupabaseClient,
  dealId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("deals")
    .select("account_id")
    .eq("id", dealId)
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.account_id;
}

/**
 * Single-deal-account inference: if an account has exactly 1 deal,
 * return that deal's ID. Returns null if 0 or 2+ deals exist.
 * Used to auto-populate deal_id on interactions for single-deal accounts.
 */
export async function findSoleDealForAccount(
  supabase: SupabaseClient,
  accountId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("deals")
    .select("id")
    .eq("account_id", accountId)
    .limit(2); // only need to know if 0, 1, or 2+

  if (error || !data) return null;
  // Exactly 1 deal → deterministic link
  if (data.length === 1) return data[0].id;
  // 0 or 2+ deals → ambiguous, return null
  return null;
}

export async function findLeadByHubSpotContactId(
  supabase: SupabaseClient,
  hubspotContactId: string
): Promise<{ id: string; email: string | null; user_id: string } | null> {
  // HubSpot contact IDs stored inconsistently in raw_data:
  // Check both hubspot_id (on create) and hubspot_contact_id (on update)
  // Currently 0/1091 have either key populated — dormant path, but ready

  const { data, error } = await supabase
    .from("leads")
    .select("id, email, user_id, raw_data")
    .limit(200);

  if (error || !data?.length) return null;

  const match = data.find((lead: { raw_data: Record<string, unknown> | null }) => {
    const raw = lead.raw_data;
    if (!raw) return false;
    return (
      String(raw.hubspot_id || "") === hubspotContactId ||
      String(raw.hubspot_contact_id || "") === hubspotContactId
    );
  });

  if (!match) return null;
  return { id: match.id, email: match.email, user_id: match.user_id };
}
