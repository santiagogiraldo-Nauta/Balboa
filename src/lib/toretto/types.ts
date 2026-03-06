// ============================================================
// Toretto — Type Definitions
// Revenue intelligence layer: raw events, identity resolution,
// source links, interactions
// ============================================================

// ─── Database Row Types (match toretto schema exactly) ──────

export interface RawEventRow {
  id: string;
  source: TorettoSource;
  event_type: string;
  payload: Record<string, unknown>;
  received_at: string;
  processing_status: ProcessingStatus;
  processing_error: string | null;
  idempotency_key: string | null;
}

export interface SourceLinkRow {
  id: string;
  entity_type: EntityType;
  source_system: TorettoSource;
  source_id: string;
  canonical_id: string | null; // polymorphic: leads.id / accounts.id / deals.id
  match_confidence: MatchConfidence;
  match_method: MatchMethod;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UnresolvedQueueRow {
  id: string;
  raw_event_id: string;
  entity_type: EntityType;
  source_system: TorettoSource;
  source_id: string;
  attempted_matches: AttemptedMatch[];
  resolution_attempts: number;
  last_attempt_at: string;
  status: QueueStatus;
  resolved_canonical_id: string | null;
  created_at: string;
}

export interface InteractionRow {
  id: string;
  raw_event_id: string | null;
  contact_id: string | null;   // FK → public.leads(id)
  account_id: string | null;   // FK → public.accounts(id)
  deal_id: string | null;      // FK → public.deals(id)
  channel: InteractionChannel;
  interaction_type: string;
  direction: InteractionDirection | null;
  occurred_at: string;
  subject: string | null;
  body_preview: string | null;
  sentiment: Sentiment | null;
  source_system: TorettoSource;
  source_id: string | null;
  metadata: Record<string, unknown>;
  resolution_confidence: MatchConfidence | null;
  created_at: string;
}

// ─── Enums / Union Types ─────────────────────────────────────

export type TorettoSource =
  | "hubspot"
  | "gmail"
  | "aircall"
  | "linkedin"
  | "amplemarket"
  | "clay";

export type ProcessingStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "dead_letter";

export type EntityType = "contact" | "account" | "deal";

export type MatchConfidence =
  | "exact"
  | "high"
  | "medium"
  | "low"
  | "unresolved";

export type MatchMethod =
  | "email_exact"
  | "domain_match"
  | "hubspot_deal_id"
  | "linkedin_url"
  | "hubspot_contact_id"
  | "unresolved";

export type QueueStatus = "pending" | "resolved" | "abandoned";

export type InteractionChannel =
  | "email"
  | "call"
  | "linkedin"
  | "meeting";

export type InteractionDirection = "inbound" | "outbound";

export type Sentiment = "positive" | "negative" | "neutral";

// ─── Resolution Types ────────────────────────────────────────

export interface AttemptedMatch {
  method: MatchMethod;
  searched_value: string;
  result: "found" | "not_found" | "error";
  attempted_at: string;
}

/** Extracted identifiers from a raw event payload */
export interface ExtractedIdentifiers {
  email: string | null;
  emailDomain: string | null;
  hubspotContactId: string | null;
  hubspotDealId: string | null;
  hubspotCompanyId: string | null;
  linkedinUrl: string | null;
  objectId: string | null;
  objectType: string | null;
}

/** Result of resolving a single entity type */
export interface EntityResolution {
  entityType: EntityType;
  canonicalId: string | null;
  confidence: MatchConfidence;
  method: MatchMethod;
}

/** Full resolution result for a raw event */
export interface ResolutionResult {
  rawEventId: string;
  contact: EntityResolution | null;
  account: EntityResolution | null;
  deal: EntityResolution | null;
  bestConfidence: MatchConfidence;
  interaction: InteractionRow | null;
  unresolvedEntities: EntityType[];
  errors: string[];
}

/** Normalized event data extracted from payload */
export interface NormalizedEvent {
  channel: InteractionChannel;
  interactionType: string;
  direction: InteractionDirection | null;
  occurredAt: string;
  subject: string | null;
  bodyPreview: string | null;
  sentiment: Sentiment | null;
  sourceId: string | null;
}

/** Batch processing result */
export interface ProcessingBatchResult {
  processed: number;
  succeeded: number;
  failed: number;
  deadLettered: number;
  errors: string[];
}
