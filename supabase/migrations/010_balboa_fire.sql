-- ============================================================
-- 010_balboa_fire.sql — Balboa Fire Autonomy Layer
-- Adds autonomous execution queue, branching rules, and
-- reply classification tables for the Fire engine.
-- ============================================================

-- ─── fire_actions: autonomous execution queue ────────────────
-- Every action Fire decides to take is written here first.
-- n8n polls this queue every 15 minutes and executes pending items.
CREATE TABLE IF NOT EXISTS fire_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  lead_id TEXT,
  enrollment_id TEXT,
  trigger_event_id TEXT,             -- touchpoint_event.id that caused this
  trigger_rule_id TEXT,              -- branching_rule.id that matched
  trigger_type TEXT NOT NULL,        -- 'rule_match' | 'signal_trigger' | 'reply_classification' | 'scheduled'
  action_type TEXT NOT NULL,         -- 'send_email' | 'send_linkedin' | 'create_call_task' | 'snooze' | 'update_status' | 'notify' | 'switch_channel'
  channel TEXT,                      -- 'email' | 'linkedin' | 'call' | 'slack'
  subject TEXT,
  body TEXT,
  template_key TEXT,
  status TEXT DEFAULT 'pending',     -- 'pending' | 'approved' | 'executing' | 'completed' | 'failed' | 'cancelled'
  scheduled_for TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  execution_result JSONB,
  error_message TEXT,
  reply_classification TEXT,         -- populated when trigger_type = 'reply_classification'
  reply_confidence FLOAT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── branching_rules: sequence state machine ─────────────────
-- Defines trigger → action mappings for autonomous branching.
-- Rules can be per-sequence or global (is_global = true).
CREATE TABLE IF NOT EXISTS branching_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  sequence_id TEXT,                  -- null for global rules
  name TEXT NOT NULL,
  trigger_event TEXT NOT NULL,       -- 'replied' | 'opened' | 'bounced' | 'silence' | 'clicked' | 'call_completed' | 'connection_accepted'
  trigger_sentiment TEXT,            -- null = any; 'positive' | 'negative' | 'neutral'
  trigger_classification TEXT,       -- null = any; 'interested' | 'objection' | 'not_now' | 'wrong_person' | 'auto_reply' | 'referral' | 'unsubscribe'
  trigger_after_step INT,            -- null = any step
  trigger_silence_days INT,          -- for silence triggers: days with no activity
  action_type TEXT NOT NULL,         -- 'advance' | 'branch' | 'pause' | 'complete' | 'switch_channel' | 'snooze' | 'create_task' | 'send_message'
  action_target_step INT,
  action_channel TEXT,
  action_snooze_days INT,
  action_template TEXT,
  action_metadata JSONB DEFAULT '{}',
  priority INT DEFAULT 50,           -- lower = evaluated first
  is_active BOOLEAN DEFAULT true,
  is_global BOOLEAN DEFAULT false,   -- applies to all fire-enabled sequences
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── reply_classifications: inbound intent analysis ──────────
-- Stores the AI/rule-based classification of every inbound reply.
CREATE TABLE IF NOT EXISTS reply_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  lead_id TEXT,
  touchpoint_event_id TEXT,
  classification TEXT NOT NULL,      -- 'interested' | 'objection' | 'not_now' | 'wrong_person' | 'auto_reply' | 'referral' | 'unsubscribe'
  confidence FLOAT NOT NULL,
  sub_classification TEXT,           -- for objections: 'price' | 'timing' | 'authority' | 'need'
  email_subject TEXT,
  email_body_preview TEXT,
  routed_action TEXT,                -- what Fire decided to do
  fire_action_id TEXT,               -- link to created fire_action
  classified_by TEXT DEFAULT 'rules', -- 'rules' | 'ai'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Extend existing tables for Fire ─────────────────────────

-- sequence_enrollments: add branching state
ALTER TABLE sequence_enrollments ADD COLUMN IF NOT EXISTS branch_path TEXT DEFAULT 'main';
ALTER TABLE sequence_enrollments ADD COLUMN IF NOT EXISTS silence_since TIMESTAMPTZ;
ALTER TABLE sequence_enrollments ADD COLUMN IF NOT EXISTS channel_override TEXT;

-- sequences: add fire toggle (opt-in per sequence)
-- Using DO block to handle case where column might already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sequences' AND column_name = 'fire_enabled'
  ) THEN
    ALTER TABLE sequences ADD COLUMN fire_enabled BOOLEAN DEFAULT false;
  END IF;
END $$;

-- ─── Indexes ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_fire_actions_status ON fire_actions(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_fire_actions_lead ON fire_actions(lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fire_actions_user_status ON fire_actions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_branching_rules_sequence ON branching_rules(sequence_id, is_active);
CREATE INDEX IF NOT EXISTS idx_branching_rules_global ON branching_rules(is_global, is_active) WHERE is_global = true;
CREATE INDEX IF NOT EXISTS idx_reply_classifications_lead ON reply_classifications(lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reply_classifications_event ON reply_classifications(touchpoint_event_id);
