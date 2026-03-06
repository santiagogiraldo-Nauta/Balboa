-- ============================================================
-- Rocket Import History & Analytics
-- Tracks every import run with quality metrics and outcomes
-- ============================================================

-- Import run history
CREATE TABLE IF NOT EXISTS rocket_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'csv',
  total_rows INT NOT NULL DEFAULT 0,
  created_count INT NOT NULL DEFAULT 0,
  updated_count INT NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,
  enrolled_count INT NOT NULL DEFAULT 0,
  sequence_id UUID,
  sequence_name TEXT,
  -- Data quality metrics
  quality_score JSONB DEFAULT '{}',
  -- { pct_with_email, pct_with_company, pct_with_linkedin, pct_with_classification, pct_with_phone, overall }
  column_mapping JSONB DEFAULT '{}',
  -- Which columns were mapped to which fields
  error_details TEXT[] DEFAULT '{}',
  -- AI enrichment status
  enrichment_status TEXT DEFAULT 'pending',
  -- 'pending', 'in_progress', 'completed', 'failed', 'skipped'
  enriched_count INT DEFAULT 0,
  -- Metadata
  source_platform TEXT,
  -- 'sales_navigator', 'clay', 'apify', 'manual', 'other'
  tags TEXT[] DEFAULT '{}',
  duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rocket_imports_user ON rocket_imports(user_id);
CREATE INDEX IF NOT EXISTS idx_rocket_imports_created ON rocket_imports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rocket_imports_enrichment ON rocket_imports(enrichment_status);

-- Enable RLS
ALTER TABLE rocket_imports ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own rocket_imports" ON rocket_imports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own rocket_imports" ON rocket_imports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own rocket_imports" ON rocket_imports FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service can manage rocket_imports" ON rocket_imports FOR ALL USING (true);
