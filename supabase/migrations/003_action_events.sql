-- Phase 2.5: Universal Event Tracking — action_events table

CREATE TABLE IF NOT EXISTS public.action_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,

  -- Event classification
  event_category text NOT NULL,   -- 'lead','outreach','deal','call','analysis','enablement','signal','navigation','team'
  event_action text NOT NULL,     -- 'csv_imported','message_sent','deal_stage_changed', etc.

  -- Entity references (text, not FK, so we never block inserts)
  lead_id text,
  deal_id text,
  account_id text,

  -- Dimensions for playbook aggregation
  channel text,                   -- 'email','linkedin','call'
  lead_tier text,                 -- 'hot','warm','cold'
  lead_industry text,
  lead_position text,
  template_type text,

  -- Timing dimensions (denormalized for fast GROUP BY)
  event_day text,                 -- 'Monday','Tuesday', etc.
  event_hour integer,             -- 0-23

  -- Numeric payload
  numeric_value numeric,          -- duration, amount, batch size, score — meaning varies by event

  -- Sequence tracking
  sequence_number integer,

  -- Outcomes (updated later when reply/meeting/deal happens)
  outcome_reply boolean DEFAULT false,
  outcome_meeting boolean DEFAULT false,
  outcome_deal_closed boolean DEFAULT false,
  outcome_deal_amount numeric,

  -- Flexible payload
  metadata jsonb DEFAULT '{}',

  -- Source
  source text DEFAULT 'app',      -- 'frontend','api','system','mock'

  created_at timestamptz DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS action_events_user_id_idx ON public.action_events(user_id);
CREATE INDEX IF NOT EXISTS action_events_category_idx ON public.action_events(event_category);
CREATE INDEX IF NOT EXISTS action_events_action_idx ON public.action_events(event_action);
CREATE INDEX IF NOT EXISTS action_events_lead_id_idx ON public.action_events(lead_id);
CREATE INDEX IF NOT EXISTS action_events_deal_id_idx ON public.action_events(deal_id);
CREATE INDEX IF NOT EXISTS action_events_channel_idx ON public.action_events(channel);
CREATE INDEX IF NOT EXISTS action_events_created_at_idx ON public.action_events(created_at);
CREATE INDEX IF NOT EXISTS action_events_cat_action_idx ON public.action_events(event_category, event_action);

-- Enable RLS
ALTER TABLE public.action_events ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own events" ON public.action_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own events" ON public.action_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own events" ON public.action_events FOR UPDATE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────
-- Aggregation function: rolls action_events → playbook_metrics_summary
-- Called on-demand before querying playbook data
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refresh_playbook_summary(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete existing summary rows for this user
  DELETE FROM public.playbook_metrics_summary WHERE user_id = p_user_id;

  -- Re-aggregate from action_events (last 90 days of outreach events)
  INSERT INTO public.playbook_metrics_summary (
    user_id,
    action_type,
    channel,
    timing_day,
    timing_hour,
    sequence_number,
    lead_tier,
    reply_rate,
    meeting_rate,
    close_rate,
    avg_days_to_reply,
    avg_days_to_meeting,
    avg_days_to_close,
    sample_size,
    last_updated
  )
  SELECT
    p_user_id,
    event_action,
    channel,
    event_day,
    event_hour,
    sequence_number,
    lead_tier,
    -- Rates: count TRUE / total
    CASE WHEN COUNT(*) > 0 THEN COUNT(*) FILTER (WHERE outcome_reply = true)::numeric / COUNT(*)::numeric ELSE 0 END,
    CASE WHEN COUNT(*) > 0 THEN COUNT(*) FILTER (WHERE outcome_meeting = true)::numeric / COUNT(*)::numeric ELSE 0 END,
    CASE WHEN COUNT(*) > 0 THEN COUNT(*) FILTER (WHERE outcome_deal_closed = true)::numeric / COUNT(*)::numeric ELSE 0 END,
    -- Avg days (from metadata if present)
    NULL,
    NULL,
    NULL,
    COUNT(*)::integer,
    now()
  FROM public.action_events
  WHERE user_id = p_user_id
    AND event_category = 'outreach'
    AND created_at >= now() - interval '90 days'
  GROUP BY event_action, channel, event_day, event_hour, sequence_number, lead_tier;
END;
$$;
