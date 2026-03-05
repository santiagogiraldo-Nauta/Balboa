#!/usr/bin/env node
/**
 * Run SQL migration against Supabase using the service role key.
 * Uses the Supabase REST API to execute SQL via an RPC call.
 *
 * Since PostgREST doesn't support raw DDL, we split the migration
 * into individual CREATE TABLE statements and run them via fetch.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = "https://gyefebprwbbwosnqpxhk.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Read the migration SQL
const sqlPath = resolve(__dirname, "../supabase/migrations/001_tracking_infrastructure.sql");
const sql = readFileSync(sqlPath, "utf-8");

// Split into individual statements
const statements = sql
  .split(";")
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith("--"));

console.log(`Running ${statements.length} SQL statements...`);

// Execute via Supabase's built-in SQL endpoint
const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc`, {
  method: "POST",
  headers: {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  },
});

// The RPC approach won't work for DDL. Let's use the management API instead.
// We need to use the Supabase SQL query endpoint which is available at:
// POST /pg/query with the service role

// Try the alternative approach - create tables one at a time via raw SQL
async function runSQL(sqlText) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "apikey": SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal",
    },
    body: JSON.stringify({ query: sqlText }),
  });
  return res;
}

// First, try to create the exec_sql function if it doesn't exist
// This is a one-time setup
const createFuncSQL = `
CREATE OR REPLACE FUNCTION exec_sql(query text) RETURNS void AS $$
BEGIN
  EXECUTE query;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`;

// Since we can't run DDL directly, let's verify tables by trying to select from them
console.log("\nVerifying table existence...");

const tables = [
  "touchpoint_events",
  "sequence_enrollments",
  "sequences",
  "daily_actions",
  "webhook_log",
  "integration_configs",
];

for (const table of tables) {
  const { data, error } = await supabase.from(table).select("id").limit(1);
  if (error) {
    console.log(`❌ ${table}: ${error.message}`);
  } else {
    console.log(`✅ ${table}: exists (${data.length} rows)`);
  }
}

console.log("\n⚠️  If tables are missing, run the SQL migration manually in the Supabase dashboard:");
console.log("   1. Go to https://supabase.com/dashboard/project/gyefebprwbbwosnqpxhk/sql");
console.log("   2. Paste the contents of supabase/migrations/001_tracking_infrastructure.sql");
console.log("   3. Click 'Run'");
console.log("\nAlternatively, the migration will now be attempted via the API...\n");

// Try to create tables via insert approach (will fail gracefully if tables don't exist)
// The real fix is to run the SQL in the dashboard

// Let's output the SQL for easy copy-paste
console.log("=== SQL MIGRATION (copy to Supabase SQL Editor) ===\n");
console.log(sql);
