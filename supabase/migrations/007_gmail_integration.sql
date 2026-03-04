-- Phase 9: Gmail Integration — OAuth token storage

-- ─── Gmail Tokens ────────────────────────────────────────────────
-- Stores Google OAuth2 tokens per user for Gmail API access.

CREATE TABLE IF NOT EXISTS public.gmail_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_type text DEFAULT 'Bearer',
  expiry_date bigint NOT NULL,  -- Unix timestamp in milliseconds
  scope text,
  gmail_email text,  -- The Gmail address connected
  connected_at timestamptz DEFAULT now(),
  last_sync_at timestamptz,
  sync_history_id text,  -- Gmail historyId for incremental sync
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- One active Gmail connection per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_gmail_tokens_user_active
  ON public.gmail_tokens(user_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_gmail_tokens_user_id ON public.gmail_tokens(user_id);

ALTER TABLE public.gmail_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own gmail tokens"
  ON public.gmail_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own gmail tokens"
  ON public.gmail_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own gmail tokens"
  ON public.gmail_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own gmail tokens"
  ON public.gmail_tokens FOR DELETE
  USING (auth.uid() = user_id);
