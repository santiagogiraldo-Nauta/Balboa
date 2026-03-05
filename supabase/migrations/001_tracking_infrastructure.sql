-- ============================================================
-- Balboa Tracking Infrastructure
-- Universal touchpoint tracking, sequence management, daily actions
-- ============================================================

-- Universal touchpoint event log (ALL channels feed here)
CREATE TABLE IF NOT EXISTS touchpoint_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  lead_id UUID,
  source TEXT NOT NULL,
  channel TEXT NOT NULL,
  event_type TEXT NOT NULL,
  direction TEXT,
  subject TEXT,
  body_preview TEXT,
  metadata JSONB DEFAULT '{}',
  sentiment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_touchpoint_lead ON touchpoint_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_touchpoint_user ON touchpoint_events(user_id);
CREATE INDEX IF NOT EXISTS idx_touchpoint_created ON touchpoint_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_touchpoint_source ON touchpoint_events(source);
CREATE INDEX IF NOT EXISTS idx_touchpoint_channel ON touchpoint_events(channel);

-- Sequence tracking (which leads are in which sequences)
CREATE TABLE IF NOT EXISTS sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  lead_id UUID,
  sequence_id TEXT NOT NULL,
  sequence_name TEXT NOT NULL,
  sequence_source TEXT NOT NULL,
  current_step INT DEFAULT 1,
  total_steps INT,
  status TEXT DEFAULT 'active',
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  last_step_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_enrollment_lead ON sequence_enrollments(lead_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_sequence ON sequence_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_status ON sequence_enrollments(status);

-- Sequences registry (synced from Amplemarket/HubSpot)
CREATE TABLE IF NOT EXISTS sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  external_id TEXT,
  source TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  total_steps INT,
  steps JSONB DEFAULT '[]',
  stats JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sequences_user ON sequences(user_id);
CREATE INDEX IF NOT EXISTS idx_sequences_source ON sequences(source);
CREATE INDEX IF NOT EXISTS idx_sequences_external ON sequences(external_id);

-- Daily actions queue (computed recommendations)
CREATE TABLE IF NOT EXISTS daily_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  lead_id UUID,
  action_type TEXT NOT NULL,
  priority TEXT DEFAULT 'medium',
  channel TEXT,
  reason TEXT NOT NULL,
  suggested_message TEXT,
  status TEXT DEFAULT 'pending',
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_daily_user_status ON daily_actions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_daily_due ON daily_actions(due_date);

-- Webhook event log (debugging)
CREATE TABLE IF NOT EXISTS webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  event_type TEXT,
  payload JSONB,
  processed BOOLEAN DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_source ON webhook_log(source);
CREATE INDEX IF NOT EXISTS idx_webhook_created ON webhook_log(created_at DESC);

-- Integration configs
CREATE TABLE IF NOT EXISTS integration_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  platform TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'disconnected',
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, platform)
);
CREATE INDEX IF NOT EXISTS idx_integration_user ON integration_configs(user_id);

-- Enable RLS on all new tables
ALTER TABLE touchpoint_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies — users can only access their own data
CREATE POLICY "Users can view own touchpoints" ON touchpoint_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own touchpoints" ON touchpoint_events FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own enrollments" ON sequence_enrollments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own enrollments" ON sequence_enrollments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own enrollments" ON sequence_enrollments FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own sequences" ON sequences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sequences" ON sequences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sequences" ON sequences FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own daily_actions" ON daily_actions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own daily_actions" ON daily_actions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own daily_actions" ON daily_actions FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own integration_configs" ON integration_configs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own integration_configs" ON integration_configs FOR ALL USING (auth.uid() = user_id);

-- Webhook log needs service role access (webhooks are unauthenticated)
CREATE POLICY "Service can manage webhook_log" ON webhook_log FOR ALL USING (true);
-- Also allow service role to insert touchpoints (from webhooks)
CREATE POLICY "Service can insert touchpoints" ON touchpoint_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can insert enrollments" ON sequence_enrollments FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can update enrollments" ON sequence_enrollments FOR UPDATE USING (true);
CREATE POLICY "Service can insert sequences" ON sequences FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can insert daily_actions" ON daily_actions FOR INSERT WITH CHECK (true);
