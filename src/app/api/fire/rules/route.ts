import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getBranchingRules,
  insertBranchingRule,
  updateBranchingRule,
  deleteBranchingRule,
} from "@/lib/fire/db-fire";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET /api/fire/rules
 * List branching rules with filters.
 *
 * Query params: userId, sequenceId, includeGlobal, activeOnly
 */
export async function GET(req: NextRequest) {
  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service not configured" }, { status: 503 });
  }

  const params = req.nextUrl.searchParams;
  const userId = params.get("userId") || undefined;
  const sequenceId = params.get("sequenceId") || undefined;
  const includeGlobal = params.get("includeGlobal") !== "false";
  const activeOnly = params.get("activeOnly") !== "false";

  const rules = await getBranchingRules(supabase, {
    userId,
    sequenceId,
    includeGlobal,
    activeOnly,
  });

  return NextResponse.json({ rules, count: rules.length });
}

/**
 * POST /api/fire/rules
 * Create or update a branching rule.
 *
 * Body: BranchingRuleRow fields (id = update, no id = create)
 */
export async function POST(req: NextRequest) {
  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service not configured" }, { status: 503 });
  }

  const body = await req.json();

  // If id is provided, it's an update
  if (body.id) {
    const { id, ...updates } = body;
    const updated = await updateBranchingRule(supabase, id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Failed to update rule" }, { status: 500 });
    }
    return NextResponse.json({ rule: updated });
  }

  // Otherwise create
  if (!body.user_id || !body.name || !body.trigger_event || !body.action_type) {
    return NextResponse.json(
      { error: "user_id, name, trigger_event, and action_type are required" },
      { status: 400 }
    );
  }

  const rule = await insertBranchingRule(supabase, {
    user_id: body.user_id,
    sequence_id: body.sequence_id || null,
    name: body.name,
    trigger_event: body.trigger_event,
    trigger_sentiment: body.trigger_sentiment || null,
    trigger_classification: body.trigger_classification || null,
    trigger_after_step: body.trigger_after_step ?? null,
    trigger_silence_days: body.trigger_silence_days ?? null,
    action_type: body.action_type,
    action_target_step: body.action_target_step ?? null,
    action_channel: body.action_channel || null,
    action_snooze_days: body.action_snooze_days ?? null,
    action_template: body.action_template || null,
    action_metadata: body.action_metadata || {},
    priority: body.priority ?? 50,
    is_active: body.is_active !== false,
    is_global: body.is_global === true,
  });

  if (!rule) {
    return NextResponse.json({ error: "Failed to create rule" }, { status: 500 });
  }

  return NextResponse.json({ rule }, { status: 201 });
}

/**
 * DELETE /api/fire/rules
 * Delete a branching rule.
 *
 * Query params: ruleId, userId
 */
export async function DELETE(req: NextRequest) {
  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service not configured" }, { status: 503 });
  }

  const params = req.nextUrl.searchParams;
  const ruleId = params.get("ruleId");
  const userId = params.get("userId");

  if (!ruleId || !userId) {
    return NextResponse.json({ error: "ruleId and userId required" }, { status: 400 });
  }

  const deleted = await deleteBranchingRule(supabase, ruleId, userId);

  if (!deleted) {
    return NextResponse.json({ error: "Failed to delete rule" }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
