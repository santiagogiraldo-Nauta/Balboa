-- Phase 2: Intelligence Layer Schema (COMPLETE)

-- Extend profiles for team management
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'founder';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hubspot_api_key text;

-- Accounts (companies)
CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  account_executive_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  company_name text NOT NULL,
  industry text,
  estimated_revenue text,
  employee_count text,
  website text,
  hubspot_company_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON public.accounts(user_id);

-- Account Executives (team members)
CREATE TABLE IF NOT EXISTS public.account_executives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  email text,
  role text DEFAULT 'ae',
  metrics_close_rate numeric,
  metrics_reply_rate numeric,
  metrics_meeting_rate numeric,
  metrics_avg_deal_size numeric,
  metrics_pipeline_value numeric,
  metrics_playbook_adherence numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_executives_team_id_idx ON public.account_executives(team_id);

-- Deals (HubSpot pipeline)
CREATE TABLE IF NOT EXISTS public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  account_executive_id uuid REFERENCES public.account_executives(id) ON DELETE SET NULL,
  deal_name text NOT NULL,
  amount numeric,
  deal_stage text NOT NULL DEFAULT 'qualification',
  probability numeric,
  deal_health text DEFAULT 'warm',
  strategy_recommendation text,
  next_action text,
  next_action_date timestamptz,
  hubspot_deal_id text,
  hubspot_last_sync timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deals_user_id_idx ON public.deals(user_id);
CREATE INDEX IF NOT EXISTS deals_account_id_idx ON public.deals(account_id);
CREATE INDEX IF NOT EXISTS deals_deal_stage_idx ON public.deals(deal_stage);

-- Extend leads table
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL;

-- Draft Templates
CREATE TABLE IF NOT EXISTS public.draft_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  template_name text,
  channel text DEFAULT 'email',
  subject_line text,
  body_text text,
  personalization_placeholders text[],
  avg_reply_rate numeric,
  avg_meeting_rate numeric,
  usage_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS draft_templates_user_id_idx ON public.draft_templates(user_id);

-- Signals and Actions
CREATE TABLE IF NOT EXISTS public.signals_and_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  signal_type text NOT NULL,
  signal_source text,
  signal_description text,
  action_type text NOT NULL,
  action_description text,
  action_urgency text DEFAULT 'medium',
  recommended_timing text,
  recommended_channel text,
  recommended_message_template uuid REFERENCES public.draft_templates(id),
  action_status text DEFAULT 'pending',
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signals_and_actions_user_id_idx ON public.signals_and_actions(user_id);
CREATE INDEX IF NOT EXISTS signals_and_actions_lead_id_idx ON public.signals_and_actions(lead_id);
CREATE INDEX IF NOT EXISTS signals_and_actions_status_idx ON public.signals_and_actions(action_status);

-- Playbook Metrics
CREATE TABLE IF NOT EXISTS public.playbook_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  action_type text NOT NULL,
  channel text,
  timing_day text,
  timing_hour integer,
  sequence_number integer,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  reply_received boolean,
  meeting_booked boolean,
  deal_closed boolean,
  deal_amount numeric,
  days_to_reply integer,
  days_to_meeting integer,
  days_to_close integer,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS playbook_metrics_user_id_idx ON public.playbook_metrics(user_id);
CREATE INDEX IF NOT EXISTS playbook_metrics_channel_idx ON public.playbook_metrics(channel);

-- Playbook Metrics Summary (for fast queries)
CREATE TABLE IF NOT EXISTS public.playbook_metrics_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  action_type text NOT NULL,
  channel text,
  timing_day text,
  timing_hour integer,
  sequence_number integer,
  lead_tier text,
  reply_rate numeric,
  meeting_rate numeric,
  close_rate numeric,
  avg_days_to_reply numeric,
  avg_days_to_meeting numeric,
  avg_days_to_close numeric,
  sample_size integer,
  last_updated timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS playbook_metrics_summary_user_id_idx ON public.playbook_metrics_summary(user_id);

-- Enable RLS on all new tables
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_executives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signals_and_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_metrics_summary ENABLE ROW LEVEL SECURITY;

-- RLS: Accounts
CREATE POLICY "Users can view own accounts" ON public.accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own accounts" ON public.accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own accounts" ON public.accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own accounts" ON public.accounts FOR DELETE USING (auth.uid() = user_id);

-- RLS: Deals
CREATE POLICY "Users can view own deals" ON public.deals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own deals" ON public.deals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own deals" ON public.deals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own deals" ON public.deals FOR DELETE USING (auth.uid() = user_id);

-- RLS: Account Executives
CREATE POLICY "Users can view team AEs" ON public.account_executives FOR SELECT USING (auth.uid() = team_id);
CREATE POLICY "Users can insert team AEs" ON public.account_executives FOR INSERT WITH CHECK (auth.uid() = team_id);
CREATE POLICY "Users can update team AEs" ON public.account_executives FOR UPDATE USING (auth.uid() = team_id);

-- RLS: Signals and Actions
CREATE POLICY "Users can view own signals" ON public.signals_and_actions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own signals" ON public.signals_and_actions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own signals" ON public.signals_and_actions FOR UPDATE USING (auth.uid() = user_id);

-- RLS: Playbook Metrics
CREATE POLICY "Users can view own metrics" ON public.playbook_metrics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own metrics" ON public.playbook_metrics FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS: Draft Templates
CREATE POLICY "Users can view own templates" ON public.draft_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own templates" ON public.draft_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own templates" ON public.draft_templates FOR UPDATE USING (auth.uid() = user_id);

-- RLS: Playbook Metrics Summary
CREATE POLICY "Users can view own summary" ON public.playbook_metrics_summary FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own summary" ON public.playbook_metrics_summary FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own summary" ON public.playbook_metrics_summary FOR UPDATE USING (auth.uid() = user_id);
