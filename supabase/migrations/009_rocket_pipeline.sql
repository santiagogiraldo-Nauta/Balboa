-- Rocket Pipeline Runs: tracks full 8-stage pipeline state
CREATE TABLE IF NOT EXISTS rocket_pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  import_id TEXT,
  stage TEXT NOT NULL DEFAULT 'upload',
  total_leads INTEGER DEFAULT 0,
  passed_icp INTEGER DEFAULT 0,
  review_icp INTEGER DEFAULT 0,
  parked_icp INTEGER DEFAULT 0,
  researched_count INTEGER DEFAULT 0,
  segments_count INTEGER DEFAULT 0,
  sequences_generated INTEGER DEFAULT 0,
  pipeline_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying user's pipeline runs
CREATE INDEX IF NOT EXISTS idx_rocket_pipeline_runs_user ON rocket_pipeline_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_rocket_pipeline_runs_created ON rocket_pipeline_runs(created_at DESC);
