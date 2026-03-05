import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/admin/migrate
 *
 * Runs the tracking infrastructure migration.
 * Protected by a secret key check.
 * This creates all 6 new tables needed for the tracking system.
 */
export async function POST(req: NextRequest) {
  // Simple auth check — use service role key as the migration secret
  const { secret } = await req.json().catch(() => ({ secret: "" }));
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret || secret !== serviceKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey!,
    {
      db: { schema: "public" },
      auth: { persistSession: false },
    }
  );

  const results: Array<{ statement: string; success: boolean; error?: string }> = [];

  // Split migration into individual statements and run via rpc
  // First, create a helper function for executing raw SQL
  const execSQL = async (sql: string, label: string) => {
    try {
      const { error } = await supabase.rpc("exec_sql", { query: sql });
      if (error) {
        results.push({ statement: label, success: false, error: error.message });
        return false;
      }
      results.push({ statement: label, success: true });
      return true;
    } catch (e) {
      results.push({ statement: label, success: false, error: String(e) });
      return false;
    }
  };

  // Try to create the exec_sql function first
  // We'll use the REST API directly for this
  const createFuncRes = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`,
    {
      method: "POST",
      headers: {
        "apikey": serviceKey!,
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "SELECT 1" }),
    }
  );

  if (!createFuncRes.ok) {
    // exec_sql doesn't exist, try to create it via the pg endpoint
    // Fall back to creating tables via the SQL API

    // Use the Supabase SQL API endpoint (available with service role)
    const sqlStatements = [
      // Create exec_sql helper function
      `CREATE OR REPLACE FUNCTION exec_sql(query text) RETURNS json AS $$ DECLARE result json; BEGIN EXECUTE query; RETURN '{"ok": true}'::json; EXCEPTION WHEN OTHERS THEN RETURN json_build_object('error', SQLERRM); END; $$ LANGUAGE plpgsql SECURITY DEFINER`,

      // Tables
      `CREATE TABLE IF NOT EXISTS touchpoint_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id), lead_id UUID, source TEXT NOT NULL, channel TEXT NOT NULL, event_type TEXT NOT NULL, direction TEXT, subject TEXT, body_preview TEXT, metadata JSONB DEFAULT '{}', sentiment TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
      `CREATE TABLE IF NOT EXISTS sequence_enrollments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id), lead_id UUID, sequence_id TEXT NOT NULL, sequence_name TEXT NOT NULL, sequence_source TEXT NOT NULL, current_step INT DEFAULT 1, total_steps INT, status TEXT DEFAULT 'active', enrolled_at TIMESTAMPTZ DEFAULT now(), last_step_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, metadata JSONB DEFAULT '{}')`,
      `CREATE TABLE IF NOT EXISTS sequences (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id), external_id TEXT, source TEXT NOT NULL, name TEXT NOT NULL, description TEXT, status TEXT DEFAULT 'active', total_steps INT, steps JSONB DEFAULT '[]', stats JSONB DEFAULT '{}', synced_at TIMESTAMPTZ DEFAULT now(), created_at TIMESTAMPTZ DEFAULT now())`,
      `CREATE TABLE IF NOT EXISTS daily_actions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id), lead_id UUID, action_type TEXT NOT NULL, priority TEXT DEFAULT 'medium', channel TEXT, reason TEXT NOT NULL, suggested_message TEXT, status TEXT DEFAULT 'pending', due_date DATE, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now())`,
      `CREATE TABLE IF NOT EXISTS webhook_log (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), source TEXT NOT NULL, event_type TEXT, payload JSONB, processed BOOLEAN DEFAULT false, error TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
      `CREATE TABLE IF NOT EXISTS integration_configs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id), platform TEXT NOT NULL, config JSONB DEFAULT '{}', status TEXT DEFAULT 'disconnected', last_sync TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(user_id, platform))`,

      // Indexes
      `CREATE INDEX IF NOT EXISTS idx_touchpoint_lead ON touchpoint_events(lead_id)`,
      `CREATE INDEX IF NOT EXISTS idx_touchpoint_user ON touchpoint_events(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_touchpoint_created ON touchpoint_events(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_touchpoint_source ON touchpoint_events(source)`,
      `CREATE INDEX IF NOT EXISTS idx_touchpoint_channel ON touchpoint_events(channel)`,
      `CREATE INDEX IF NOT EXISTS idx_enrollment_lead ON sequence_enrollments(lead_id)`,
      `CREATE INDEX IF NOT EXISTS idx_enrollment_sequence ON sequence_enrollments(sequence_id)`,
      `CREATE INDEX IF NOT EXISTS idx_enrollment_status ON sequence_enrollments(status)`,
      `CREATE INDEX IF NOT EXISTS idx_sequences_user ON sequences(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sequences_source ON sequences(source)`,
      `CREATE INDEX IF NOT EXISTS idx_sequences_external ON sequences(external_id)`,
      `CREATE INDEX IF NOT EXISTS idx_daily_user_status ON daily_actions(user_id, status)`,
      `CREATE INDEX IF NOT EXISTS idx_daily_due ON daily_actions(due_date)`,
      `CREATE INDEX IF NOT EXISTS idx_webhook_source ON webhook_log(source)`,
      `CREATE INDEX IF NOT EXISTS idx_webhook_created ON webhook_log(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_integration_user ON integration_configs(user_id)`,

      // RLS
      `ALTER TABLE touchpoint_events ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE sequence_enrollments ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE sequences ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE daily_actions ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE webhook_log ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY`,

      // Policies
      `DO $$ BEGIN CREATE POLICY "Users can view own touchpoints" ON touchpoint_events FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN CREATE POLICY "Users can insert own touchpoints" ON touchpoint_events FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN CREATE POLICY "Service can insert touchpoints" ON touchpoint_events FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN CREATE POLICY "Users can view own enrollments" ON sequence_enrollments FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN CREATE POLICY "Users can insert own enrollments" ON sequence_enrollments FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN CREATE POLICY "Users can update own enrollments" ON sequence_enrollments FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN CREATE POLICY "Service can insert enrollments" ON sequence_enrollments FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN CREATE POLICY "Service can update enrollments" ON sequence_enrollments FOR UPDATE USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN CREATE POLICY "Users can view own sequences" ON sequences FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN CREATE POLICY "Users can insert own sequences" ON sequences FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN CREATE POLICY "Users can update own sequences" ON sequences FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN CREATE POLICY "Service can insert sequences" ON sequences FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN CREATE POLICY "Users can view own daily_actions" ON daily_actions FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN CREATE POLICY "Users can insert own daily_actions" ON daily_actions FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN CREATE POLICY "Users can update own daily_actions" ON daily_actions FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN CREATE POLICY "Service can insert daily_actions" ON daily_actions FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN CREATE POLICY "Users can view own integration_configs" ON integration_configs FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN CREATE POLICY "Users can manage own integration_configs" ON integration_configs FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN CREATE POLICY "Service can manage webhook_log" ON webhook_log FOR ALL USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    ];

    // First create the exec_sql function using a direct pg query
    // This requires using the management API or the pg endpoint
    // Since we can't do DDL via PostgREST, we'll try the Supabase pg endpoint

    const pgEndpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/pg`;

    for (let i = 0; i < sqlStatements.length; i++) {
      const stmt = sqlStatements[i];
      const label = stmt.substring(0, 80) + (stmt.length > 80 ? "..." : "");

      try {
        // Try via the exec_sql RPC function (works after first statement creates it)
        if (i > 0) {
          const { data, error } = await supabase.rpc("exec_sql", { query: stmt });
          if (error) {
            results.push({ statement: label, success: false, error: error.message });
          } else {
            results.push({ statement: label, success: true });
          }
        } else {
          // First statement creates exec_sql - need to find another way
          // Try the REST endpoint directly
          results.push({ statement: "exec_sql function", success: false, error: "Need to create via dashboard first" });
        }
      } catch (e) {
        results.push({ statement: label, success: false, error: String(e) });
      }
    }
  } else {
    // exec_sql exists! Run all statements through it
    const allStatements = [
      { label: "touchpoint_events table", sql: `CREATE TABLE IF NOT EXISTS touchpoint_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id), lead_id UUID, source TEXT NOT NULL, channel TEXT NOT NULL, event_type TEXT NOT NULL, direction TEXT, subject TEXT, body_preview TEXT, metadata JSONB DEFAULT '{}', sentiment TEXT, created_at TIMESTAMPTZ DEFAULT now())` },
      { label: "sequence_enrollments table", sql: `CREATE TABLE IF NOT EXISTS sequence_enrollments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id), lead_id UUID, sequence_id TEXT NOT NULL, sequence_name TEXT NOT NULL, sequence_source TEXT NOT NULL, current_step INT DEFAULT 1, total_steps INT, status TEXT DEFAULT 'active', enrolled_at TIMESTAMPTZ DEFAULT now(), last_step_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, metadata JSONB DEFAULT '{}')` },
      { label: "sequences table", sql: `CREATE TABLE IF NOT EXISTS sequences (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id), external_id TEXT, source TEXT NOT NULL, name TEXT NOT NULL, description TEXT, status TEXT DEFAULT 'active', total_steps INT, steps JSONB DEFAULT '[]', stats JSONB DEFAULT '{}', synced_at TIMESTAMPTZ DEFAULT now(), created_at TIMESTAMPTZ DEFAULT now())` },
      { label: "daily_actions table", sql: `CREATE TABLE IF NOT EXISTS daily_actions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id), lead_id UUID, action_type TEXT NOT NULL, priority TEXT DEFAULT 'medium', channel TEXT, reason TEXT NOT NULL, suggested_message TEXT, status TEXT DEFAULT 'pending', due_date DATE, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now())` },
      { label: "webhook_log table", sql: `CREATE TABLE IF NOT EXISTS webhook_log (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), source TEXT NOT NULL, event_type TEXT, payload JSONB, processed BOOLEAN DEFAULT false, error TEXT, created_at TIMESTAMPTZ DEFAULT now())` },
      { label: "integration_configs table", sql: `CREATE TABLE IF NOT EXISTS integration_configs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id), platform TEXT NOT NULL, config JSONB DEFAULT '{}', status TEXT DEFAULT 'disconnected', last_sync TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(user_id, platform))` },
    ];

    for (const { label, sql } of allStatements) {
      await execSQL(sql, label);
    }

    // Indexes
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_touchpoint_lead ON touchpoint_events(lead_id)`,
      `CREATE INDEX IF NOT EXISTS idx_touchpoint_user ON touchpoint_events(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_touchpoint_created ON touchpoint_events(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_enrollment_lead ON sequence_enrollments(lead_id)`,
      `CREATE INDEX IF NOT EXISTS idx_enrollment_sequence ON sequence_enrollments(sequence_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sequences_user ON sequences(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_daily_user_status ON daily_actions(user_id, status)`,
      `CREATE INDEX IF NOT EXISTS idx_webhook_source ON webhook_log(source)`,
      `CREATE INDEX IF NOT EXISTS idx_integration_user ON integration_configs(user_id)`,
    ];

    for (const idx of indexes) {
      await execSQL(idx, idx.substring(0, 80));
    }

    // RLS
    const rlsStatements = [
      `ALTER TABLE touchpoint_events ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE sequence_enrollments ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE sequences ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE daily_actions ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE webhook_log ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY`,
    ];

    for (const rls of rlsStatements) {
      await execSQL(rls, rls);
    }
  }

  return NextResponse.json({
    results,
    success: results.filter(r => !r.success).length === 0,
    created: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
  });
}
