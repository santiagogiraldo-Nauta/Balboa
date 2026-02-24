-- Phase 3: Environment Architecture, Outreach Queue, LinkedIn Filtering
-- Migration 004

-- ================================================================
-- OUTREACH QUEUE — Safety gate for all outreach sends
-- ================================================================
CREATE TABLE IF NOT EXISTS public.outreach_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  lead_id text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'linkedin', 'call')),
  subject text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'approved', 'rejected', 'sent', 'cancelled')),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id),
  review_note text,
  sent_at timestamptz,
  send_error text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outreach_queue_user_id_idx ON public.outreach_queue(user_id);
CREATE INDEX IF NOT EXISTS outreach_queue_status_idx ON public.outreach_queue(status);
CREATE INDEX IF NOT EXISTS outreach_queue_lead_id_idx ON public.outreach_queue(lead_id);
CREATE INDEX IF NOT EXISTS outreach_queue_created_idx ON public.outreach_queue(created_at);

ALTER TABLE public.outreach_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own outreach queue" ON public.outreach_queue
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own outreach" ON public.outreach_queue
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own outreach" ON public.outreach_queue
  FOR UPDATE USING (auth.uid() = user_id);

-- ================================================================
-- LINKEDIN CONVERSATIONS — Track all LinkedIn convos with classification
-- ================================================================
CREATE TABLE IF NOT EXISTS public.linkedin_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  lead_id uuid,
  linkedin_thread_id text,
  participant_name text NOT NULL,
  participant_linkedin_url text,
  classification text NOT NULL DEFAULT 'unclassified'
    CHECK (classification IN ('professional', 'personal', 'unclassified')),
  classification_method text DEFAULT 'auto_detected'
    CHECK (classification_method IN ('auto_detected', 'user_flagged', 'rule_matched')),
  classification_reason text,
  classification_confidence numeric DEFAULT 0,
  is_excluded boolean DEFAULT false,
  last_message_preview text,
  last_message_date timestamptz,
  user_notes text,
  raw_data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedin_conv_user_id_idx ON public.linkedin_conversations(user_id);
CREATE INDEX IF NOT EXISTS linkedin_conv_classification_idx ON public.linkedin_conversations(classification);
CREATE INDEX IF NOT EXISTS linkedin_conv_excluded_idx ON public.linkedin_conversations(is_excluded);
CREATE INDEX IF NOT EXISTS linkedin_conv_lead_id_idx ON public.linkedin_conversations(lead_id);
CREATE INDEX IF NOT EXISTS linkedin_conv_thread_idx ON public.linkedin_conversations(linkedin_thread_id);

ALTER TABLE public.linkedin_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversations" ON public.linkedin_conversations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own conversations" ON public.linkedin_conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own conversations" ON public.linkedin_conversations
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own conversations" ON public.linkedin_conversations
  FOR DELETE USING (auth.uid() = user_id);

-- ================================================================
-- LINKEDIN FILTER RULES — User-defined classification rules
-- ================================================================
CREATE TABLE IF NOT EXISTS public.linkedin_filter_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  rule_type text NOT NULL CHECK (rule_type IN ('keyword', 'participant', 'relationship', 'pattern')),
  rule_value text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('personal', 'professional')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedin_rules_user_id_idx ON public.linkedin_filter_rules(user_id);
CREATE INDEX IF NOT EXISTS linkedin_rules_active_idx ON public.linkedin_filter_rules(is_active);

ALTER TABLE public.linkedin_filter_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own filter rules" ON public.linkedin_filter_rules
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own filter rules" ON public.linkedin_filter_rules
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own filter rules" ON public.linkedin_filter_rules
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own filter rules" ON public.linkedin_filter_rules
  FOR DELETE USING (auth.uid() = user_id);

-- ================================================================
-- LINKEDIN FILTER AUDIT LOG — Every classification action logged
-- ================================================================
CREATE TABLE IF NOT EXISTS public.linkedin_filter_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  conversation_id uuid REFERENCES public.linkedin_conversations(id) ON DELETE CASCADE,
  action text NOT NULL
    CHECK (action IN ('classified', 'reclassified', 'excluded', 'included', 'rule_created', 'rule_deleted')),
  previous_classification text,
  new_classification text,
  method text NOT NULL CHECK (method IN ('auto', 'manual', 'rule')),
  reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedin_audit_user_id_idx ON public.linkedin_filter_audit_log(user_id);
CREATE INDEX IF NOT EXISTS linkedin_audit_conv_id_idx ON public.linkedin_filter_audit_log(conversation_id);
CREATE INDEX IF NOT EXISTS linkedin_audit_created_idx ON public.linkedin_filter_audit_log(created_at);

ALTER TABLE public.linkedin_filter_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audit log" ON public.linkedin_filter_audit_log
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own audit entries" ON public.linkedin_filter_audit_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- INTEGRATION CONFIG — Per-user integration settings (future use)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.integration_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  integration_name text NOT NULL,
  is_enabled boolean DEFAULT false,
  config jsonb DEFAULT '{}',
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, integration_name)
);

CREATE INDEX IF NOT EXISTS integration_config_user_idx ON public.integration_config(user_id);

ALTER TABLE public.integration_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own integration config" ON public.integration_config
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own integration config" ON public.integration_config
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own integration config" ON public.integration_config
  FOR UPDATE USING (auth.uid() = user_id);

-- ================================================================
-- AUTO-UPDATE TRIGGERS (reuse existing update_updated_at function)
-- ================================================================
CREATE TRIGGER outreach_queue_updated_at BEFORE UPDATE ON public.outreach_queue
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();
CREATE TRIGGER linkedin_conv_updated_at BEFORE UPDATE ON public.linkedin_conversations
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();
CREATE TRIGGER integration_config_updated_at BEFORE UPDATE ON public.integration_config
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();
