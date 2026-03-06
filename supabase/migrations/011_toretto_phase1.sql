-- ============================================================
-- Toretto Phase 1 — Data Foundations
-- Revenue intelligence layer (additive, does NOT modify Balboa)
--
-- Creates: toretto schema + 4 core tables
--   1. raw_events        — unprocessed webhook payloads
--   2. source_links       — external ID → canonical entity mapping
--   3. unresolved_resolution_queue — failed resolutions for retry
--   4. interactions        — normalized, resolved interaction records
--
-- Design constraints:
--   - All tables in `toretto` schema (isolated from public.*)
--   - source_links.canonical_id is polymorphic (NO SQL FK)
--   - All cross-schema FKs use ON DELETE SET NULL
--   - RLS: service-role full access, authenticated read-only
--   - Zero mutations to existing Balboa tables
--
-- Live DB verification (2026-03-06):
--   - 1,091 leads, 10 accounts, 956 deals
--   - Entity graph is sparse (leads.account_id 0.6%, leads.deal_id 0%)
--   - Resolver designed for email/website-domain/hubspot_deal_id paths
-- ============================================================


-- ─── Block 1: Schema + Permissions ──────────────────────────

CREATE SCHEMA IF NOT EXISTS toretto;

GRANT USAGE ON SCHEMA toretto TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA toretto TO postgres, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA toretto TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA toretto
  GRANT ALL ON TABLES TO postgres, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA toretto
  GRANT SELECT ON TABLES TO authenticated;


-- ─── Block 2: toretto.raw_events ────────────────────────────
-- Unprocessed webhook payloads. Every inbound event lands here
-- first, untouched. The resolver processes them asynchronously.
-- No foreign keys to public schema — fully self-contained.

CREATE TABLE toretto.raw_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source            TEXT NOT NULL,          -- 'hubspot', 'gmail', 'aircall', 'linkedin', 'amplemarket', 'clay'
  event_type        TEXT NOT NULL,          -- original event type from source system
  payload           JSONB NOT NULL,         -- complete raw webhook payload, unmodified
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  processing_status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
  processing_error  TEXT,                   -- error message if processing failed
  idempotency_key   TEXT UNIQUE             -- source-derived dedup key (e.g. hubspot:{objectId}:{eventType}:{ts})
);

-- Unprocessed events queue (primary query path for the resolver)
CREATE INDEX idx_toretto_raw_events_pending
  ON toretto.raw_events (received_at ASC)
  WHERE processing_status = 'pending';

-- Failed events for retry/debugging
CREATE INDEX idx_toretto_raw_events_failed
  ON toretto.raw_events (received_at DESC)
  WHERE processing_status IN ('failed', 'dead_letter');

CREATE INDEX idx_toretto_raw_events_source
  ON toretto.raw_events (source);

CREATE INDEX idx_toretto_raw_events_received
  ON toretto.raw_events (received_at DESC);

-- RLS
ALTER TABLE toretto.raw_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can manage raw_events"
  ON toretto.raw_events FOR ALL USING (true);

CREATE POLICY "Authenticated can read raw_events"
  ON toretto.raw_events FOR SELECT TO authenticated USING (true);


-- ─── Block 3: toretto.source_links ──────────────────────────
-- Maps external IDs (e.g. HubSpot contact 12345) to canonical
-- Balboa entities (leads.id, accounts.id, deals.id).
--
-- canonical_id is polymorphic: it points to different tables
-- depending on entity_type. This is enforced at the application
-- layer, NOT via SQL foreign keys. This is intentional:
--   - Polymorphic FKs cannot be expressed in SQL
--   - The entity graph is sparse (many NULLs expected)
--   - ON DELETE behavior is handled by the resolver

CREATE TABLE toretto.source_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       TEXT NOT NULL,          -- 'contact', 'account', 'deal'
  source_system     TEXT NOT NULL,          -- 'hubspot', 'gmail', 'linkedin', etc.
  source_id         TEXT NOT NULL,          -- external ID in source system
  canonical_id      UUID,                   -- points to leads.id / accounts.id / deals.id (NO SQL FK)
  match_confidence  TEXT NOT NULL           -- 'exact', 'high', 'medium', 'low', 'unresolved'
                    CHECK (match_confidence IN ('exact', 'high', 'medium', 'low', 'unresolved')),
  match_method      TEXT NOT NULL,          -- 'email_exact', 'domain_match', 'hubspot_deal_id', 'linkedin_url', 'unresolved'
  resolved_at       TIMESTAMPTZ,            -- when resolution succeeded
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One canonical mapping per external identity per entity type
  UNIQUE (source_system, source_id, entity_type)
);

-- Lookup by canonical entity (e.g. "all source links for this lead")
CREATE INDEX idx_toretto_source_links_canonical
  ON toretto.source_links (entity_type, canonical_id)
  WHERE canonical_id IS NOT NULL;

-- Lookup by external ID (e.g. "which lead is HubSpot contact 12345?")
CREATE INDEX idx_toretto_source_links_lookup
  ON toretto.source_links (source_system, source_id);

-- Find low-confidence links for re-resolution
CREATE INDEX idx_toretto_source_links_confidence
  ON toretto.source_links (match_confidence)
  WHERE match_confidence NOT IN ('exact', 'high');

-- RLS
ALTER TABLE toretto.source_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can manage source_links"
  ON toretto.source_links FOR ALL USING (true);

CREATE POLICY "Authenticated can read source_links"
  ON toretto.source_links FOR SELECT TO authenticated USING (true);


-- ─── Block 4: toretto.unresolved_resolution_queue ───────────
-- Holds events where identity resolution failed or was low-
-- confidence. Designed for periodic re-processing as the entity
-- graph improves (e.g. after Phase 1.5 backfill).
--
-- FK to raw_events with CASCADE: if the raw event is purged,
-- the queue entry goes with it.

CREATE TABLE toretto.unresolved_resolution_queue (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_event_id          UUID NOT NULL REFERENCES toretto.raw_events(id) ON DELETE CASCADE,
  entity_type           TEXT NOT NULL,       -- 'contact', 'account', 'deal'
  source_system         TEXT NOT NULL,
  source_id             TEXT NOT NULL,       -- the external ID that couldn't match
  attempted_matches     JSONB NOT NULL DEFAULT '[]',  -- [{method, searched_value, result, attempted_at}]
  resolution_attempts   INT NOT NULL DEFAULT 1,
  last_attempt_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'resolved', 'abandoned')),
  resolved_canonical_id UUID,               -- filled when eventually resolved
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary query: pending items for re-processing
CREATE INDEX idx_toretto_unresolved_pending
  ON toretto.unresolved_resolution_queue (last_attempt_at ASC)
  WHERE status = 'pending';

CREATE INDEX idx_toretto_unresolved_entity
  ON toretto.unresolved_resolution_queue (entity_type, source_system);

CREATE INDEX idx_toretto_unresolved_created
  ON toretto.unresolved_resolution_queue (created_at DESC);

-- RLS
ALTER TABLE toretto.unresolved_resolution_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can manage unresolved_queue"
  ON toretto.unresolved_resolution_queue FOR ALL USING (true);

CREATE POLICY "Authenticated can read unresolved_queue"
  ON toretto.unresolved_resolution_queue FOR SELECT TO authenticated USING (true);


-- ─── Block 5: toretto.interactions ──────────────────────────
-- Normalized, resolved interaction records. Every raw_event that
-- passes through the resolver produces one interaction.
--
-- Cross-schema FKs to public.leads, public.accounts, public.deals:
--   - All nullable (resolution may fail for any entity)
--   - All ON DELETE SET NULL (Balboa deletions never cascade into Toretto)
--
-- raw_event_id FK to toretto.raw_events:
--   - ON DELETE SET NULL (interaction survives even if raw event is purged)

CREATE TABLE toretto.interactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_event_id          UUID REFERENCES toretto.raw_events(id) ON DELETE SET NULL,
  contact_id            UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  account_id            UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  deal_id               UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  channel               TEXT NOT NULL,       -- 'email', 'call', 'linkedin', 'meeting'
  interaction_type      TEXT NOT NULL,       -- 'sent', 'opened', 'clicked', 'replied', 'bounced', 'call_completed', 'meeting_booked', 'meeting_held', 'connection_accepted', 'stage_change', 'deal_stage_change'
  direction             TEXT,                -- 'inbound', 'outbound'
  occurred_at           TIMESTAMPTZ NOT NULL,-- when interaction actually happened (from source, not ingestion time)
  subject               TEXT,
  body_preview          TEXT,                -- first 200 chars max
  sentiment             TEXT,                -- 'positive', 'negative', 'neutral'
  source_system         TEXT NOT NULL,       -- 'hubspot', 'gmail', 'aircall', 'linkedin', 'amplemarket', 'clay'
  source_id             TEXT,                -- external ID for dedup
  metadata              JSONB NOT NULL DEFAULT '{}',
  resolution_confidence TEXT,                -- best confidence among resolved entities ('exact', 'high', 'medium', 'low')
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contact timeline (primary query for Account Brain / Prep Kit agents)
CREATE INDEX idx_toretto_interactions_contact
  ON toretto.interactions (contact_id, occurred_at DESC)
  WHERE contact_id IS NOT NULL;

-- Account timeline (primary query for Account Brain agent)
CREATE INDEX idx_toretto_interactions_account
  ON toretto.interactions (account_id, occurred_at DESC)
  WHERE account_id IS NOT NULL;

-- Deal timeline (primary query for Deal Strategist agent)
CREATE INDEX idx_toretto_interactions_deal
  ON toretto.interactions (deal_id, occurred_at DESC)
  WHERE deal_id IS NOT NULL;

-- Chronological feed
CREATE INDEX idx_toretto_interactions_occurred
  ON toretto.interactions (occurred_at DESC);

-- Filter by channel
CREATE INDEX idx_toretto_interactions_channel
  ON toretto.interactions (channel);

-- Dedup by source
CREATE INDEX idx_toretto_interactions_source
  ON toretto.interactions (source_system, source_id)
  WHERE source_id IS NOT NULL;

-- RLS: service role has full access
ALTER TABLE toretto.interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can manage interactions"
  ON toretto.interactions FOR ALL USING (true);

-- RLS: authenticated users can only read interactions for their own leads
CREATE POLICY "Authenticated can read own interactions"
  ON toretto.interactions FOR SELECT TO authenticated
  USING (
    contact_id IS NULL
    OR contact_id IN (SELECT id FROM public.leads WHERE user_id = auth.uid())
  );


-- ============================================================
-- End of Toretto Phase 1 migration
-- Next: resolver implementation (src/lib/toretto/resolver.ts)
-- ============================================================
