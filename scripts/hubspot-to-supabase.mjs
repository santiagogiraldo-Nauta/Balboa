#!/usr/bin/env node
/**
 * Parse HubSpot deals from MCP result files and generate SQL for Supabase insertion.
 * Usage: node scripts/hubspot-to-supabase.mjs <input-file> > output.sql
 */
import { readFileSync } from "fs";

const PIPELINE_MAP = {
  default: "sales",
  "797275510": "busdev",
  "732682072": "payments",
  "141784440": "partnerships",
  "753706766": "referrals",
};

const SALES_STAGE_MAP = {
  presentationscheduled: "Discovery",
  decisionmakerboughtin: "Scope",
  contractsent: "Proposal Review",
  "1169927465": "Go",
  closedwon: "Contracting",
  "937672115": "Closed Won",
  closedlost: "Closed Lost",
  "1123758210": "Not ICP",
  appointmentscheduled: "Discovery",
  qualifiedtobuy: "Scope",
};

const BUSDEV_STAGE_MAP = {
  "1169948203": "Lead",
  "1169948205": "Meeting Scheduled",
  "1169948206": "Meeting Held",
  "1218492458": "Qualified",
  "1169948207": "Disqualified",
  "1174882119": "Closed Lost",
  "1238183285": "Not ICP",
};

const PAYMENTS_STAGE_MAP = {
  "1067254188": "Closed Won",
  "1067254189": "Closed Lost",
};

function mapStage(stage, pipelineId) {
  const s = stage?.toLowerCase() || "";
  if (pipelineId === "797275510") return BUSDEV_STAGE_MAP[stage] || BUSDEV_STAGE_MAP[s] || "Lead";
  if (pipelineId === "732682072") return PAYMENTS_STAGE_MAP[stage] || PAYMENTS_STAGE_MAP[s] || stage;
  return SALES_STAGE_MAP[stage] || SALES_STAGE_MAP[s] || "Discovery";
}

function escSql(v) {
  if (v === null || v === undefined) return "NULL";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: node hubspot-to-supabase.mjs <mcp-result-file>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(file, "utf-8"));
// MCP result format: [{type: "text", text: "..."}]
const textBlock = raw.find(b => b.type === "text");
if (!textBlock) { console.error("No text block found"); process.exit(1); }

const data = JSON.parse(textBlock.text);
const deals = data.results || [];

console.log(`-- ${deals.length} deals from HubSpot`);
console.log(`-- Total in HubSpot: ${data.total}`);

const userId = "944c1245-bbc0-4b16-a924-7765adf3bbaf";
const now = new Date().toISOString();

const values = deals.map(d => {
  const p = d.properties;
  const pipelineId = p.pipeline || "default";
  const pipeline = PIPELINE_MAP[pipelineId] || "sales";
  const stage = mapStage(p.dealstage || "", pipelineId);
  const amount = p.amount ? parseFloat(p.amount) : null;
  const dealName = p.dealname || "Untitled Deal";

  return `(gen_random_uuid(), ${escSql(userId)}, ${escSql(dealName)}, ${amount === null ? "NULL" : amount}, ${escSql(stage)}, ${escSql(pipeline)}, ${p.closedate ? escSql(p.closedate) : "NULL"}, ${p.hubspot_owner_id ? escSql(p.hubspot_owner_id) : "NULL"}, ${escSql(d.id)}, ${escSql(now)}, ${escSql(now)}, ${escSql(now)})`;
});

// Batch into groups of 50
for (let i = 0; i < values.length; i += 50) {
  const batch = values.slice(i, i + 50);
  console.log(`
INSERT INTO deals (id, user_id, deal_name, amount, deal_stage, pipeline, close_date, hubspot_owner_id, hubspot_deal_id, hubspot_last_sync, created_at, updated_at)
VALUES
${batch.join(",\n")}
ON CONFLICT (hubspot_deal_id) WHERE hubspot_deal_id IS NOT NULL
DO UPDATE SET
  deal_name = EXCLUDED.deal_name,
  amount = EXCLUDED.amount,
  deal_stage = EXCLUDED.deal_stage,
  pipeline = EXCLUDED.pipeline,
  close_date = EXCLUDED.close_date,
  hubspot_owner_id = EXCLUDED.hubspot_owner_id,
  hubspot_last_sync = EXCLUDED.hubspot_last_sync,
  updated_at = EXCLUDED.updated_at;
`);
}

// Summary
const pipelineCounts = {};
deals.forEach(d => {
  const p = PIPELINE_MAP[d.properties.pipeline || "default"] || "sales";
  pipelineCounts[p] = (pipelineCounts[p] || 0) + 1;
});
console.log("-- Pipeline breakdown:", JSON.stringify(pipelineCounts));
