-- ============================================================
-- Toretto Phase 2 — Signal Engine
-- Deterministic signal computation from toretto.interactions
--
-- Creates 3 tables in the toretto schema:
--   1. signals          — Current signal state (upserted per entity)
--   2. signal_log       — Append-only history for trend analysis
--   3. signal_triggers  — Data-driven signal→Fire action mapping
--
-- Design constraints:
--   - All tables in toretto schema (isolated from public.*)
--   - entity_id is polymorphic (NO SQL FK — same as source_links)
--   - Idempotent via UNIQUE(signal_key, entity_type, entity_id)
--   - RLS: service-role full access, authenticated read-only
--   - Zero mutations to existing Balboa or Toretto Phase 1 tables
--
-- Depends on: 011_toretto_phase1.sql (toretto schema + interactions)
-- ============================================================


-- ─── Block 1: toretto.signals ─────────────────────────────────
-- Current state of every computed signal per entity.
-- Each row = one signal type for one entity.
-- Updated via upsert (ON CONFLICT). Re-computation overwrites.
-- previous_score preserved automatically for threshold detection.

CREATE TABLE toretto.signals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Signal identity
  signal_key        TEXT NOT NULL,           -- e.g. 'account_engagement_score', 'deal_momentum'
  entity_type       TEXT NOT NULL            -- which table entity_id references
                    CHECK (entity_type IN ('account', 'deal', 'contact')),
  entity_id         UUID NOT NULL,           -- polymorphic: accounts.id / deals.id / leads.id (NO SQL FK)

  -- Signal value
  score             SMALLINT NOT NULL        -- 0-100 normalized score
                    CHECK (score >= 0 AND score <= 100),
  previous_score    SMALLINT,                -- score from last computation (for trend/threshold detection)
  score_band        TEXT NOT NULL            -- human-readable band derived from score
                    CHECK (score_band IN ('critical', 'high', 'medium', 'low', 'inactive')),

  -- Computation metadata
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  lookback_days     SMALLINT NOT NULL,       -- how many days of interactions were considered
  interaction_count INT NOT NULL DEFAULT 0,  -- how many interactions contributed to this score
  computation_ms    INT,                     -- how long computation took (ms), for perf monitoring

  -- Signal-specific breakdown (for debugging and UI display)
  breakdown         JSONB NOT NULL DEFAULT '{}',
  -- e.g. { "recency_score": 70, "frequency_score": 50, "channel_score": 25 }

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One signal per entity per signal_key (idempotent upsert target)
  UNIQUE (signal_key, entity_type, entity_id)
);

-- Get all signals for a specific entity (Account Brain, Deal Strategist queries)
CREATE INDEX idx_toretto_signals_entity
  ON toretto.signals (entity_type, entity_id);

-- Get all signals of one type ranked by score (dashboard priority queue)
CREATE INDEX idx_toretto_signals_key_score
  ON toretto.signals (signal_key, score DESC);

-- Find critical/high signals (alerts, notifications)
CREATE INDEX idx_toretto_signals_band
  ON toretto.signals (score_band, signal_key)
  WHERE score_band IN ('critical', 'high');

-- Find stale signals (need recomputation)
CREATE INDEX idx_toretto_signals_stale
  ON toretto.signals (computed_at ASC);

-- RLS
ALTER TABLE toretto.signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can manage signals"
  ON toretto.signals FOR ALL USING (true);

CREATE POLICY "Authenticated can read signals"
  ON toretto.signals FOR SELECT TO authenticated USING (true);


-- ─── Block 2: toretto.signal_log ─────────────────────────────
-- Append-only log of every signal computation.
-- Used for trend analysis ("was this account getting hotter?").
-- Rows are NEVER updated or deleted (except by TTL cleanup).

CREATE TABLE toretto.signal_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  signal_key        TEXT NOT NULL,
  entity_type       TEXT NOT NULL
                    CHECK (entity_type IN ('account', 'deal', 'contact')),
  entity_id         UUID NOT NULL,

  score             SMALLINT NOT NULL
                    CHECK (score >= 0 AND score <= 100),
  score_band        TEXT NOT NULL
                    CHECK (score_band IN ('critical', 'high', 'medium', 'low', 'inactive')),

  breakdown         JSONB NOT NULL DEFAULT '{}',
  interaction_count INT NOT NULL DEFAULT 0,

  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary query: history for a specific signal on a specific entity
CREATE INDEX idx_toretto_signal_log_entity
  ON toretto.signal_log (signal_key, entity_type, entity_id, computed_at DESC);

-- Cleanup: find old entries for TTL purge (e.g. > 90 days)
CREATE INDEX idx_toretto_signal_log_age
  ON toretto.signal_log (computed_at ASC);

-- RLS
ALTER TABLE toretto.signal_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can manage signal_log"
  ON toretto.signal_log FOR ALL USING (true);

CREATE POLICY "Authenticated can read signal_log"
  ON toretto.signal_log FOR SELECT TO authenticated USING (true);


-- ─── Block 3: toretto.signal_triggers ─────────────────────────
-- Maps signal threshold crossings to Fire actions.
-- Data-driven replacement for hardcoded SIGNAL_TRIGGERS.
-- Evaluated after every signal computation batch.

CREATE TABLE toretto.signal_triggers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Trigger condition
  signal_key        TEXT NOT NULL,           -- which signal to watch
  condition         TEXT NOT NULL            -- how to evaluate the threshold
                    CHECK (condition IN (
                      'crosses_above', 'crosses_below',
                      'stays_above', 'stays_below',
                      'enters_band', 'exits_band'
                    )),
  threshold         SMALLINT,               -- score threshold (for crosses/stays conditions)
  target_band       TEXT,                    -- target band (for enters/exits conditions)

  -- Action to take when triggered
  action_type       TEXT NOT NULL,           -- matches FireActionType (notify, send_email, etc.)
  channel           TEXT,                    -- matches FireChannel (email, linkedin, call, slack)
  template_key      TEXT,                    -- optional template reference
  priority          TEXT NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
  delay_minutes     INT NOT NULL DEFAULT 0,  -- delay before action executes
  metadata          JSONB NOT NULL DEFAULT '{}',

  -- Admin
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup triggers for a specific signal key
CREATE INDEX idx_toretto_signal_triggers_key
  ON toretto.signal_triggers (signal_key)
  WHERE is_active = true;

-- RLS
ALTER TABLE toretto.signal_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can manage signal_triggers"
  ON toretto.signal_triggers FOR ALL USING (true);

CREATE POLICY "Authenticated can read signal_triggers"
  ON toretto.signal_triggers FOR SELECT TO authenticated USING (true);


-- ─── Block 4: Seed Default Trigger Rules ──────────────────────
-- These are the initial trigger rules. Can be modified via admin UI later.

INSERT INTO toretto.signal_triggers (signal_key, condition, threshold, action_type, channel, priority, metadata) VALUES
  ('deal_risk', 'crosses_above', 80, 'notify', 'slack', 'urgent',
    '{"reason": "Deal risk critical — immediate attention required"}'::jsonb),
  ('deal_risk', 'crosses_above', 60, 'create_call_task', 'call', 'high',
    '{"reason": "Deal risk elevated — schedule re-engagement call"}'::jsonb),
  ('intent_buying_activity', 'crosses_above', 70, 'notify', 'slack', 'high',
    '{"reason": "High buying activity detected — strike while hot"}'::jsonb),
  ('intent_silence_risk', 'crosses_above', 80, 'send_email', 'email', 'high',
    '{"reason": "Previously active account gone silent — re-engage"}'::jsonb),
  ('deal_momentum', 'crosses_below', 30, 'notify', 'slack', 'high',
    '{"reason": "Deal momentum stalling — review strategy"}'::jsonb),
  ('account_engagement_score', 'crosses_below', 20, 'send_email', 'email', 'medium',
    '{"reason": "Account engagement dropping — nurture sequence recommended"}'::jsonb);


-- ============================================================
-- End of Toretto Phase 2 migration
-- Next: signal computation engine (src/lib/toretto/signals/)
-- ============================================================
