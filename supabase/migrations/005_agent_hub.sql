-- Phase 7: Agent Hub — agents, agent_collaborators, agent_executions tables

-- ─── Agents Registry ─────────────────────────────────────────────
-- Stores agent definitions: system prompts, config, ownership.
-- Each agent is owned by a user and can be shared via agent_collaborators.

CREATE TABLE IF NOT EXISTS public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL UNIQUE,            -- "carlos-competitor-intel" (human-readable slug)
  name text NOT NULL,                        -- "Competitor Intel Deep Dive"
  description text DEFAULT '',
  author_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  author_name text NOT NULL,                 -- "Carlos"
  version text DEFAULT '1.0.0',
  category text NOT NULL DEFAULT 'custom',   -- research|outreach|analysis|enablement|strategy|custom
  input_type text DEFAULT 'lead',            -- lead|deal|lead+deal|freeform
  system_prompt text NOT NULL,               -- The core agent prompt with {{PLACEHOLDERS}}
  output_format text DEFAULT 'json',         -- json|text|markdown
  output_schema jsonb,                       -- Expected output structure (optional)
  model text DEFAULT 'claude-sonnet-4-20250514',
  max_tokens integer DEFAULT 2000,
  inject_balboa_context boolean DEFAULT true,
  supports_language boolean DEFAULT true,
  tags text[] DEFAULT '{}',
  enabled boolean DEFAULT true,
  replaces text,                             -- "/api/generate-call-script" — wires to existing button
  is_builtin boolean DEFAULT false,          -- true for Balboa's own agents
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_agents_author_id ON public.agents(author_id);
CREATE INDEX IF NOT EXISTS idx_agents_category ON public.agents(category);
CREATE INDEX IF NOT EXISTS idx_agents_enabled ON public.agents(enabled);
CREATE INDEX IF NOT EXISTS idx_agents_replaces ON public.agents(replaces);
CREATE INDEX IF NOT EXISTS idx_agents_is_builtin ON public.agents(is_builtin);

-- ─── Agent Collaborators ─────────────────────────────────────────
-- Google Docs-style sharing: owner can invite editors and viewers.

CREATE TABLE IF NOT EXISTS public.agent_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.agents(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL DEFAULT 'viewer',       -- 'editor' | 'viewer'
  invited_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(agent_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_collab_user ON public.agent_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_collab_agent ON public.agent_collaborators(agent_id);

-- ─── Agent Executions ────────────────────────────────────────────
-- Logs every agent run for analytics and debugging.

CREATE TABLE IF NOT EXISTS public.agent_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  execution_id text NOT NULL,
  agent_id text NOT NULL,                    -- References agents.agent_id (text, not FK, for flexibility)
  agent_name text NOT NULL,
  pipeline_id text,
  pipeline_name text,
  lead_id text,
  deal_id text,
  status text NOT NULL DEFAULT 'pending',    -- pending|running|completed|failed
  input jsonb DEFAULT '{}',
  result jsonb,
  steps jsonb DEFAULT '[]',                  -- Array of step states for pipelines
  duration_ms integer,
  tokens_used integer,
  model text,
  error_message text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_agent_exec_user ON public.agent_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_exec_agent ON public.agent_executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_exec_lead ON public.agent_executions(lead_id);
CREATE INDEX IF NOT EXISTS idx_agent_exec_status ON public.agent_executions(status);
CREATE INDEX IF NOT EXISTS idx_agent_exec_created ON public.agent_executions(created_at DESC);

-- ─── RLS Policies ────────────────────────────────────────────────

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_executions ENABLE ROW LEVEL SECURITY;

-- Agents: users can see agents they own, collaborate on, or that are built-in
CREATE POLICY "Users can view own agents"
  ON public.agents FOR SELECT
  USING (
    auth.uid() = author_id
    OR is_builtin = true
    OR id IN (SELECT agent_id FROM public.agent_collaborators WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert own agents"
  ON public.agents FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update own agents"
  ON public.agents FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "Users can delete own agents"
  ON public.agents FOR DELETE
  USING (auth.uid() = author_id);

-- Collaborators: users can see collaborators for agents they own or are a collaborator on
CREATE POLICY "Users can view collaborators"
  ON public.agent_collaborators FOR SELECT
  USING (
    user_id = auth.uid()
    OR agent_id IN (SELECT id FROM public.agents WHERE author_id = auth.uid())
  );

CREATE POLICY "Agent owners can manage collaborators"
  ON public.agent_collaborators FOR INSERT
  WITH CHECK (
    agent_id IN (SELECT id FROM public.agents WHERE author_id = auth.uid())
  );

CREATE POLICY "Agent owners can remove collaborators"
  ON public.agent_collaborators FOR DELETE
  USING (
    agent_id IN (SELECT id FROM public.agents WHERE author_id = auth.uid())
    OR user_id = auth.uid()
  );

-- Executions: users can see their own executions
CREATE POLICY "Users can view own executions"
  ON public.agent_executions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own executions"
  ON public.agent_executions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own executions"
  ON public.agent_executions FOR UPDATE
  USING (auth.uid() = user_id);
