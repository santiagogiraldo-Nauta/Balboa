#!/usr/bin/env node
/**
 * Agent Hub Migration Helper
 *
 * Runs supabase/migrations/005_agent_hub.sql against the Supabase database.
 *
 * Usage:
 *   node scripts/migrate.mjs <DATABASE_PASSWORD>
 *
 * Where DATABASE_PASSWORD is the password set when the Supabase project was created.
 * You can find it in Supabase Dashboard → Project Settings → Database → Connection string.
 *
 * If no password is provided, it copies the SQL to your clipboard and opens the
 * Supabase SQL Editor in your browser for manual execution.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const sql = fs.readFileSync(
  path.join(rootDir, "supabase/migrations/005_agent_hub.sql"),
  "utf-8"
);

const dbPassword = process.argv[2];

async function runWithPassword(password) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    host: "db.gyefebprwbbwosnqpxhk.supabase.co",
    port: 5432,
    database: "postgres",
    user: "postgres",
    password,
    ssl: { rejectUnauthorized: false },
  });

  console.log("Connecting to Supabase database...");
  await client.connect();
  console.log("Connected! Running migration...\n");

  await client.query(sql);
  console.log("✅ Migration successful! Agent Hub tables created:");
  console.log("   • agents");
  console.log("   • agent_collaborators");
  console.log("   • agent_executions");
  console.log("   (with RLS policies and indexes)\n");

  await client.end();
}

async function fallbackManual() {
  console.log("No database password provided.\n");

  // Try to copy SQL to clipboard (macOS)
  try {
    execSync("pbcopy", { input: sql });
    console.log("📋 SQL copied to your clipboard!\n");
  } catch {
    console.log("(Could not copy to clipboard — paste the SQL from the file below)\n");
    console.log("File: supabase/migrations/005_agent_hub.sql\n");
  }

  const url =
    "https://supabase.com/dashboard/project/gyefebprwbbwosnqpxhk/sql/new";
  console.log("Open the Supabase SQL Editor and paste it:");
  console.log(`  ${url}\n`);

  // Try to open browser (macOS)
  try {
    execSync(`open "${url}"`);
    console.log("(Opening in browser...)\n");
  } catch {
    // No-op if open command fails
  }
}

async function main() {
  console.log("\n🤖 Agent Hub Migration — 005_agent_hub.sql\n");

  if (dbPassword) {
    try {
      await runWithPassword(dbPassword);
    } catch (err) {
      console.error("❌ Migration failed:", err.message);
      console.log("\nFalling back to manual mode...\n");
      await fallbackManual();
    }
  } else {
    await fallbackManual();
  }
}

main();
