// ============================================================
// Toretto — Identity Resolution Engine
// Processes raw_events → extract identifiers → resolve to
// canonical entities → create source_links + interactions
//
// Resolution paths (based on live data 2026-03-06):
//   Contact: email exact → linkedin_url → hubspot_contact_id (dormant)
//   Account: email domain → accounts.website (920 accounts)
//   Deal:    hubspot_deal_id exact match (956 deals)
//
// Constraints:
//   - Reads from public.* — NEVER writes to public.*
//   - Writes only to toretto.* via service_role client
//   - Decoupled from webhook — processes raw_events independently
//   - Idempotent: ON CONFLICT DO NOTHING for source_links,
//     dedup by source_system+source_id for interactions
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";
import type {
  RawEventRow,
  ExtractedIdentifiers,
  EntityResolution,
  ResolutionResult,
  NormalizedEvent,
  ProcessingBatchResult,
  MatchConfidence,
  MatchMethod,
  EntityType,
  InteractionChannel,
  InteractionDirection,
  Sentiment,
  TorettoSource,
  AttemptedMatch,
} from "./types";
import {
  claimPendingRawEvents,
  updateRawEventStatus,
  upsertSourceLink,
  insertUnresolvedEntry,
  insertInteraction,
  findLeadByEmail,
  findLeadByLinkedIn,
  findLeadByHubSpotContactId,
  findAccountByDomain,
  findDealByHubSpotId,
  findLeadFKs,
  findDealAccountId,
  findSoleDealForAccount,
} from "./db-toretto";

// ─── Identifier Extraction ───────────────────────────────────
// Extract all possible identifiers from a raw event payload.
// HubSpot events have inconsistent shapes — handle them all.

export function extractIdentifiers(
  source: TorettoSource,
  eventType: string,
  payload: Record<string, unknown>
): ExtractedIdentifiers {
  const result: ExtractedIdentifiers = {
    email: null,
    emailDomain: null,
    hubspotContactId: null,
    hubspotDealId: null,
    hubspotCompanyId: null,
    linkedinUrl: null,
    objectId: null,
    objectType: null,
  };

  // ── Object identifiers (HubSpot sends these on most events)
  result.objectId = coerceString(payload.objectId);
  result.objectType = coerceString(payload.objectType);

  // ── Email: multiple possible locations
  result.email =
    coerceString(payload.email) ||
    coerceString((payload.properties as Record<string, unknown>)?.email) ||
    coerceString(payload.recipient) ||
    coerceString(payload.from) ||
    coerceString(payload.to);

  // Extract domain from email
  if (result.email?.includes("@")) {
    result.emailDomain = result.email.split("@")[1]?.toLowerCase() || null;
  }

  // ── HubSpot Contact ID
  // In contact events, objectId IS the contact ID
  if (source === "hubspot" && result.objectType === "CONTACT" && result.objectId) {
    result.hubspotContactId = result.objectId;
  }
  // Also check explicit properties
  result.hubspotContactId =
    result.hubspotContactId ||
    coerceString(payload.vid) ||
    coerceString(payload.hubspot_contact_id) ||
    coerceString(payload.contactId);

  // ── HubSpot Deal ID
  if (source === "hubspot" && result.objectType === "DEAL" && result.objectId) {
    result.hubspotDealId = result.objectId;
  }
  // Fallback: infer from event_type when objectType is absent
  // HubSpot deal.propertyChange → objectId IS the deal ID
  if (source === "hubspot" && !result.hubspotDealId && result.objectId && eventType.startsWith("deal.")) {
    result.hubspotDealId = result.objectId;
  }
  result.hubspotDealId =
    result.hubspotDealId ||
    coerceString(payload.dealId) ||
    coerceString(payload.hubspot_deal_id) ||
    coerceString((payload.metadata as Record<string, unknown>)?.hubspot_deal_id);

  // ── HubSpot Company ID
  if (source === "hubspot" && result.objectType === "COMPANY" && result.objectId) {
    result.hubspotCompanyId = result.objectId;
  }
  result.hubspotCompanyId =
    result.hubspotCompanyId ||
    coerceString(payload.companyId) ||
    coerceString(payload.hubspot_company_id);

  // ── LinkedIn URL
  result.linkedinUrl =
    coerceString(payload.linkedin_url) ||
    coerceString(payload.linkedinUrl) ||
    coerceString((payload.properties as Record<string, unknown>)?.linkedin_url);

  return result;
}

// ─── Contact Resolution ──────────────────────────────────────

async function resolveContact(
  supabase: SupabaseClient,
  ids: ExtractedIdentifiers
): Promise<{ resolution: EntityResolution; attempts: AttemptedMatch[] }> {
  const attempts: AttemptedMatch[] = [];
  const now = new Date().toISOString();

  // Path 1: Email exact match (primary — highest expected hit rate)
  if (ids.email) {
    attempts.push({ method: "email_exact", searched_value: ids.email, result: "not_found", attempted_at: now });
    try {
      const lead = await findLeadByEmail(supabase, ids.email);
      if (lead) {
        attempts[attempts.length - 1].result = "found";
        return {
          resolution: {
            entityType: "contact",
            canonicalId: lead.id,
            confidence: "exact",
            method: "email_exact",
          },
          attempts,
        };
      }
    } catch {
      attempts[attempts.length - 1].result = "error";
    }
  }

  // Path 2: LinkedIn URL match (secondary)
  if (ids.linkedinUrl) {
    attempts.push({ method: "linkedin_url", searched_value: ids.linkedinUrl, result: "not_found", attempted_at: now });
    try {
      const lead = await findLeadByLinkedIn(supabase, ids.linkedinUrl);
      if (lead) {
        attempts[attempts.length - 1].result = "found";
        return {
          resolution: {
            entityType: "contact",
            canonicalId: lead.id,
            confidence: "high",
            method: "linkedin_url",
          },
          attempts,
        };
      }
    } catch {
      attempts[attempts.length - 1].result = "error";
    }
  }

  // Path 3: HubSpot Contact ID (dormant — 0/1091 populated, but ready)
  if (ids.hubspotContactId) {
    attempts.push({ method: "hubspot_contact_id", searched_value: ids.hubspotContactId, result: "not_found", attempted_at: now });
    try {
      const lead = await findLeadByHubSpotContactId(supabase, ids.hubspotContactId);
      if (lead) {
        attempts[attempts.length - 1].result = "found";
        return {
          resolution: {
            entityType: "contact",
            canonicalId: lead.id,
            confidence: "exact",
            method: "hubspot_contact_id",
          },
          attempts,
        };
      }
    } catch {
      attempts[attempts.length - 1].result = "error";
    }
  }

  // Unresolved
  return {
    resolution: {
      entityType: "contact",
      canonicalId: null,
      confidence: "unresolved",
      method: "unresolved",
    },
    attempts,
  };
}

// ─── Account Resolution ──────────────────────────────────────

async function resolveAccount(
  supabase: SupabaseClient,
  ids: ExtractedIdentifiers
): Promise<{ resolution: EntityResolution; attempts: AttemptedMatch[] }> {
  const attempts: AttemptedMatch[] = [];
  const now = new Date().toISOString();

  // Path 1: Email domain → accounts.website (only 10 accounts, primary path)
  if (ids.emailDomain) {
    // Skip common email providers — they don't map to B2B accounts
    const freeEmailDomains = new Set([
      "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
      "aol.com", "icloud.com", "mail.com", "protonmail.com",
      "live.com", "msn.com", "ymail.com", "zoho.com",
    ]);

    if (!freeEmailDomains.has(ids.emailDomain.toLowerCase())) {
      attempts.push({ method: "domain_match", searched_value: ids.emailDomain, result: "not_found", attempted_at: now });
      try {
        const account = await findAccountByDomain(supabase, ids.emailDomain);
        if (account) {
          attempts[attempts.length - 1].result = "found";
          return {
            resolution: {
              entityType: "account",
              canonicalId: account.id,
              confidence: "high",
              method: "domain_match",
            },
            attempts,
          };
        }
      } catch {
        attempts[attempts.length - 1].result = "error";
      }
    }
  }

  // Unresolved (HubSpot Company ID path is dormant — 0 populated)
  return {
    resolution: {
      entityType: "account",
      canonicalId: null,
      confidence: "unresolved",
      method: "unresolved",
    },
    attempts,
  };
}

// ─── Deal Resolution ─────────────────────────────────────────

async function resolveDeal(
  supabase: SupabaseClient,
  ids: ExtractedIdentifiers
): Promise<{ resolution: EntityResolution; attempts: AttemptedMatch[] }> {
  const attempts: AttemptedMatch[] = [];
  const now = new Date().toISOString();

  // Path 1: HubSpot Deal ID exact match (956 deals, solid)
  if (ids.hubspotDealId) {
    attempts.push({ method: "hubspot_deal_id", searched_value: ids.hubspotDealId, result: "not_found", attempted_at: now });
    try {
      const deal = await findDealByHubSpotId(supabase, ids.hubspotDealId);
      if (deal) {
        attempts[attempts.length - 1].result = "found";
        return {
          resolution: {
            entityType: "deal",
            canonicalId: deal.id,
            confidence: "exact",
            method: "hubspot_deal_id",
          },
          attempts,
        };
      }
    } catch {
      attempts[attempts.length - 1].result = "error";
    }
  }

  // Unresolved — deal resolution requires explicit HubSpot deal ID
  return {
    resolution: {
      entityType: "deal",
      canonicalId: null,
      confidence: "unresolved",
      method: "unresolved",
    },
    attempts,
  };
}

// ─── Event Normalization ─────────────────────────────────────
// Maps raw event payload to a normalized interaction shape.

export function normalizeEvent(
  source: TorettoSource,
  eventType: string,
  payload: Record<string, unknown>
): NormalizedEvent {
  // Determine channel from event type and source
  const channel = inferChannel(source, eventType);
  const interactionType = mapInteractionType(source, eventType);
  const direction = inferDirection(eventType);
  const occurredAt =
    coerceString(payload.occurredAt) ||
    coerceString(payload.occurred_at) ||
    coerceString(payload.timestamp) ||
    coerceString(payload.date) ||
    coerceString(payload.created_at) ||
    new Date().toISOString();

  const subject =
    coerceString(payload.subject) ||
    coerceString(payload.emailSubject) ||
    coerceString(payload.title) ||
    null;

  const bodyRaw =
    coerceString(payload.body) ||
    coerceString(payload.textBody) ||
    coerceString(payload.text) ||
    coerceString(payload.notes) ||
    coerceString(payload.summary) ||
    "";
  const bodyPreview = bodyRaw.slice(0, 200) || null;

  const sentiment = inferSentiment(payload);

  const sourceId = buildSourceId(source, eventType, payload);

  // Upgrade: deal.propertyChange with propertyName=dealstage → deal_stage_change
  // This is critical for the deal_stage_velocity signal
  let upgradedType = interactionType;
  if (
    source === "hubspot" &&
    eventType === "deal.propertyChange" &&
    coerceString(payload.propertyName) === "dealstage"
  ) {
    upgradedType = "deal_stage_change";
  }

  // Upgrade: replied + positive sentiment → positive_reply
  // This carries 2x weight in intent_buying_activity signal (8 vs 4)
  const finalType =
    upgradedType === "replied" && sentiment === "positive"
      ? "positive_reply"
      : upgradedType;

  return {
    channel,
    interactionType: finalType,
    direction,
    occurredAt,
    subject,
    bodyPreview,
    sentiment,
    sourceId,
  };
}

// ─── Orchestrator ────────────────────────────────────────────
// Processes a single raw_event through the full pipeline:
// extract → resolve contact/account/deal → create source_links
// → create interaction → handle failures

export async function resolveRawEvent(
  supabase: SupabaseClient,
  rawEvent: RawEventRow
): Promise<ResolutionResult> {
  const result: ResolutionResult = {
    rawEventId: rawEvent.id,
    contact: null,
    account: null,
    deal: null,
    bestConfidence: "unresolved",
    interaction: null,
    unresolvedEntities: [],
    errors: [],
  };

  try {
    // Step 1: Extract identifiers
    const ids = extractIdentifiers(
      rawEvent.source as TorettoSource,
      rawEvent.event_type,
      rawEvent.payload
    );

    // Step 2: Resolve entities in parallel
    const [contactResult, accountResult, dealResult] = await Promise.all([
      resolveContact(supabase, ids),
      resolveAccount(supabase, ids),
      resolveDeal(supabase, ids),
    ]);

    result.contact = contactResult.resolution;
    result.account = accountResult.resolution;
    result.deal = dealResult.resolution;

    // Step 2.5: FK Propagation — enrich unresolved entities from lead/deal FKs
    // When contact resolves to a lead, propagate the lead's deal_id and account_id.
    // When deal resolves (directly or via propagation), cascade its account_id.
    if (result.contact?.canonicalId) {
      const leadFKs = await findLeadFKs(supabase, result.contact.canonicalId);
      if (leadFKs) {
        // Propagate deal_id from lead if deal wasn't resolved directly
        if (!result.deal?.canonicalId && leadFKs.deal_id) {
          result.deal = {
            entityType: "deal",
            canonicalId: leadFKs.deal_id,
            confidence: "high",
            method: "lead_fk_propagation",
          };
        }
        // Propagate account_id from lead if account wasn't resolved directly
        if (!result.account?.canonicalId && leadFKs.account_id) {
          result.account = {
            entityType: "account",
            canonicalId: leadFKs.account_id,
            confidence: "high",
            method: "lead_fk_propagation",
          };
        }
      }
    }

    // Cascade: if deal resolved but account still unresolved, inherit from deal
    if (result.deal?.canonicalId && !result.account?.canonicalId) {
      const dealAcctId = await findDealAccountId(supabase, result.deal.canonicalId);
      if (dealAcctId) {
        result.account = {
          entityType: "account",
          canonicalId: dealAcctId,
          confidence: "medium",
          method: "deal_account_cascade",
        };
      }
    }

    // Step 2.6: Single-deal-account inference
    // If account resolved but deal still unresolved, and the account has
    // exactly 1 deal, deterministically assign it. If 0 or 2+ deals exist,
    // leave deal_id null (ambiguous).
    if (result.account?.canonicalId && !result.deal?.canonicalId) {
      const soleDealId = await findSoleDealForAccount(supabase, result.account.canonicalId);
      if (soleDealId) {
        result.deal = {
          entityType: "deal",
          canonicalId: soleDealId,
          confidence: "medium",
          method: "account_sole_deal",
        };
      }
    }

    // Step 3: Determine best confidence
    const confidences: MatchConfidence[] = [
      result.contact.confidence,
      result.account.confidence,
      result.deal.confidence,
    ];
    result.bestConfidence = bestOf(confidences);

    // Step 4: Create source_links for resolved entities
    const sourceLinksToCreate = [
      result.contact,
      result.account,
      result.deal,
    ].filter(
      (r): r is EntityResolution => r !== null && r.canonicalId !== null
    );

    for (const resolution of sourceLinksToCreate) {
      const sourceId = getSourceIdForEntity(ids, resolution.entityType);
      if (sourceId) {
        await upsertSourceLink(supabase, {
          entity_type: resolution.entityType,
          source_system: rawEvent.source as TorettoSource,
          source_id: sourceId,
          canonical_id: resolution.canonicalId,
          match_confidence: resolution.confidence,
          match_method: resolution.method,
        });
      }
    }

    // Step 5: Queue unresolved entities
    const unresolvedEntities: EntityType[] = [];
    const allAttempts = {
      contact: contactResult.attempts,
      account: accountResult.attempts,
      deal: dealResult.attempts,
    };

    for (const [entityType, res] of Object.entries({
      contact: result.contact,
      account: result.account,
      deal: result.deal,
    })) {
      if (res && res.canonicalId === null && hasAttempts(allAttempts[entityType as EntityType])) {
        unresolvedEntities.push(entityType as EntityType);
        const sourceId = getSourceIdForEntity(ids, entityType as EntityType);
        if (sourceId) {
          await insertUnresolvedEntry(supabase, {
            raw_event_id: rawEvent.id,
            entity_type: entityType as EntityType,
            source_system: rawEvent.source as TorettoSource,
            source_id: sourceId,
            attempted_matches: allAttempts[entityType as EntityType],
          });
        }
      }
    }
    result.unresolvedEntities = unresolvedEntities;

    // Step 6: Create interaction
    const normalized = normalizeEvent(
      rawEvent.source as TorettoSource,
      rawEvent.event_type,
      rawEvent.payload
    );

    const interaction = await insertInteraction(supabase, {
      raw_event_id: rawEvent.id,
      contact_id: result.contact?.canonicalId || null,
      account_id: result.account?.canonicalId || null,
      deal_id: result.deal?.canonicalId || null,
      channel: normalized.channel,
      interaction_type: normalized.interactionType,
      direction: normalized.direction,
      occurred_at: normalized.occurredAt,
      subject: normalized.subject,
      body_preview: normalized.bodyPreview,
      sentiment: normalized.sentiment,
      source_system: rawEvent.source as TorettoSource,
      source_id: normalized.sourceId,
      metadata: rawEvent.payload,
      resolution_confidence: result.bestConfidence !== "unresolved" ? result.bestConfidence : null,
    });
    result.interaction = interaction;

    // Step 7: Mark raw event as completed
    await updateRawEventStatus(supabase, rawEvent.id, "completed");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown resolver error";
    result.errors.push(message);
    console.error(`[resolver] Error processing raw event ${rawEvent.id}:`, message);

    // Mark as failed (not dead_letter — that's for repeated failures)
    await updateRawEventStatus(supabase, rawEvent.id, "failed", message);
  }

  return result;
}

// ─── Batch Processor ─────────────────────────────────────────
// Claims a batch of pending raw_events and resolves them.
// Called by the processor API route (Task Group 4).

export async function processBatch(
  supabase: SupabaseClient,
  batchSize: number = 50
): Promise<ProcessingBatchResult> {
  const result: ProcessingBatchResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    deadLettered: 0,
    errors: [],
  };

  // Claim events atomically
  const events = await claimPendingRawEvents(supabase, batchSize);
  result.processed = events.length;

  if (!events.length) return result;

  // Process each event sequentially (preserves ordering, prevents OOM)
  for (const event of events) {
    const resolution = await resolveRawEvent(supabase, event);

    if (resolution.errors.length > 0) {
      result.failed++;
      result.errors.push(`${event.id}: ${resolution.errors[0]}`);
    } else {
      result.succeeded++;
    }
  }

  return result;
}

// ─── Helpers ─────────────────────────────────────────────────

function coerceString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number") return String(value);
  return null;
}

function inferChannel(source: TorettoSource, eventType: string): InteractionChannel {
  if (source === "gmail" || eventType.includes("email")) return "email";
  if (source === "aircall" || eventType.includes("call")) return "call";
  if (source === "linkedin" || eventType.includes("linkedin")) return "linkedin";
  if (eventType.includes("meeting")) return "meeting";
  // Default: HubSpot events are mostly email-based
  return "email";
}

function mapInteractionType(source: TorettoSource, eventType: string): string {
  const type = eventType.toLowerCase();

  // HubSpot email events
  if (type.includes("open")) return "opened";
  if (type.includes("click")) return "clicked";
  if (type.includes("reply")) return "replied";
  if (type.includes("bounce")) return "bounced";
  if (type.includes("sent")) return "sent";

  // Stage changes
  if (type.includes("deal") && type.includes("stage")) return "deal_stage_change";
  if (type.includes("stage")) return "stage_change";

  // Contact/property changes
  if (type.includes("property")) return "property_change";
  if (type.includes("create")) return "created";
  if (type.includes("delete")) return "deleted";

  // Call events
  if (type.includes("call")) return "call_completed";

  // Meeting events
  if (type.includes("meeting") && type.includes("book")) return "meeting_booked";
  if (type.includes("meeting")) return "meeting_held";

  // LinkedIn events
  if (type.includes("connection")) return "connection_accepted";
  if (type.includes("message")) return "replied";

  return eventType;
}

function inferDirection(eventType: string): InteractionDirection | null {
  const type = eventType.toLowerCase();
  if (type.includes("reply") || type.includes("inbound")) return "inbound";
  if (type.includes("sent") || type.includes("outbound")) return "outbound";
  if (type.includes("open") || type.includes("click")) return "outbound"; // tracking on outbound emails
  return null;
}

function inferSentiment(payload: Record<string, unknown>): Sentiment | null {
  // Explicit sentiment in payload
  const explicit = coerceString(payload.sentiment);
  if (explicit === "positive" || explicit === "negative" || explicit === "neutral") {
    return explicit;
  }

  // Bounce → negative signal
  const type = coerceString(payload.eventType) || coerceString(payload.subscriptionType) || "";
  if (type.toLowerCase().includes("bounce")) return "negative";

  return null;
}

function buildSourceId(
  source: TorettoSource,
  eventType: string,
  payload: Record<string, unknown>
): string | null {
  // Try to build a unique source ID for dedup
  const objectId = coerceString(payload.objectId);
  const occurredAt = coerceString(payload.occurredAt) || coerceString(payload.timestamp);

  if (objectId && occurredAt) {
    return `${source}:${eventType}:${objectId}:${occurredAt}`;
  }
  if (objectId) {
    return `${source}:${eventType}:${objectId}`;
  }

  // Fall back to idempotency-style key
  const emailId = coerceString(payload.emailId);
  if (emailId) return `${source}:email:${emailId}`;

  return null;
}

function getSourceIdForEntity(ids: ExtractedIdentifiers, entityType: EntityType): string | null {
  switch (entityType) {
    case "contact":
      return ids.email || ids.hubspotContactId || ids.linkedinUrl || ids.objectId || null;
    case "account":
      return ids.emailDomain || ids.hubspotCompanyId || null;
    case "deal":
      return ids.hubspotDealId || null;
    default:
      return null;
  }
}

function bestOf(confidences: MatchConfidence[]): MatchConfidence {
  const rank: Record<MatchConfidence, number> = {
    exact: 4,
    high: 3,
    medium: 2,
    low: 1,
    unresolved: 0,
  };
  let best: MatchConfidence = "unresolved";
  for (const c of confidences) {
    if (rank[c] > rank[best]) best = c;
  }
  return best;
}

function hasAttempts(attempts: AttemptedMatch[]): boolean {
  return attempts.length > 0;
}
