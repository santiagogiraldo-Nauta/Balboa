-- Phase 8: Inbox, Messages, Conversations + Compliance tables

-- ─── Messages ───────────────────────────────────────────────────
-- Stores all sent/received messages across channels.

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id text,
  thread_id text,
  channel text NOT NULL CHECK (channel IN ('email', 'linkedin', 'sms', 'whatsapp', 'call')),
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  subject text,
  body text NOT NULL,
  status text DEFAULT 'sent' CHECK (status IN ('draft', 'queued', 'sent', 'delivered', 'read', 'replied', 'bounced', 'failed')),
  sender text NOT NULL,
  recipient text,
  attachments jsonb DEFAULT '[]',
  metadata jsonb DEFAULT '{}',
  -- Compliance fields
  has_unsubscribe boolean DEFAULT false,
  has_physical_address boolean DEFAULT false,
  compliance_checked boolean DEFAULT false,
  -- Timestamps
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON public.messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON public.messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON public.messages(channel);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own messages"
  ON public.messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own messages"
  ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own messages"
  ON public.messages FOR UPDATE
  USING (auth.uid() = user_id);

-- ─── Conversations ──────────────────────────────────────────────
-- Thread grouping for messages.

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id text,
  channel text NOT NULL CHECK (channel IN ('email', 'linkedin', 'sms', 'whatsapp', 'call')),
  subject text,
  last_message_body text,
  last_message_date timestamptz,
  last_message_direction text,
  message_count integer DEFAULT 0,
  unread_count integer DEFAULT 0,
  status text DEFAULT 'active' CHECK (status IN ('active', 'archived', 'snoozed')),
  snoozed_until timestamptz,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON public.conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON public.conversations(last_message_date DESC);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own conversations"
  ON public.conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own conversations"
  ON public.conversations FOR UPDATE
  USING (auth.uid() = user_id);

-- ─── Compliance Events ──────────────────────────────────────────
-- Tracks every compliance-related event for auditing and rate limiting.

CREATE TABLE IF NOT EXISTS public.compliance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id text,
  channel text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'message_sent', 'connection_sent', 'rate_limit_hit',
    'compliance_warning', 'compliance_block',
    'unsubscribe_requested', 'consent_given', 'consent_withdrawn',
    'gdpr_access_request', 'gdpr_deletion_request'
  )),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_events_user_channel_date
  ON public.compliance_events(user_id, channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_events_type
  ON public.compliance_events(event_type);

ALTER TABLE public.compliance_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own compliance events"
  ON public.compliance_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own compliance events"
  ON public.compliance_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ─── Lead Consent ───────────────────────────────────────────────
-- Tracks consent status per lead per channel (GDPR, opt-in/out, unsubscribe).

CREATE TABLE IF NOT EXISTS public.lead_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id text NOT NULL,
  channel text NOT NULL,
  consent_type text NOT NULL CHECK (consent_type IN (
    'opt_in', 'opt_out', 'unsubscribe', 'gdpr_consent', 'gdpr_withdraw'
  )),
  consent_date timestamptz DEFAULT now(),
  source text,  -- 'manual', 'form', 'email_link', 'api'
  metadata jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_consent_user_lead ON public.lead_consent(user_id, lead_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_consent_active
  ON public.lead_consent(user_id, lead_id, channel) WHERE is_active = true;

ALTER TABLE public.lead_consent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own consent records"
  ON public.lead_consent FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own consent records"
  ON public.lead_consent FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own consent records"
  ON public.lead_consent FOR UPDATE
  USING (auth.uid() = user_id);
