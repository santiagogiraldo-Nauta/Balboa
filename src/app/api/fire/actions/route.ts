import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getFireActions, updateFireAction } from "@/lib/fire/db-fire";
import type { FireActionStatus } from "@/lib/fire/types";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET /api/fire/actions
 * List fire actions with filters.
 *
 * Query params: userId, leadId, status, triggerType, since, limit
 */
export async function GET(req: NextRequest) {
  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service not configured" }, { status: 503 });
  }

  const params = req.nextUrl.searchParams;
  const userId = params.get("userId") || undefined;
  const leadId = params.get("leadId") || undefined;
  const status = params.get("status") as FireActionStatus | undefined;
  const triggerType = params.get("triggerType") || undefined;
  const since = params.get("since") || undefined;
  const limit = params.get("limit") ? parseInt(params.get("limit")!) : 50;

  const actions = await getFireActions(supabase, {
    userId,
    leadId,
    status,
    triggerType,
    since,
    limit,
  });

  return NextResponse.json({ actions, count: actions.length });
}

/**
 * PATCH /api/fire/actions
 * Update a fire action (approve, cancel, mark completed).
 *
 * Body: { actionId, status, executionResult?, errorMessage? }
 */
export async function PATCH(req: NextRequest) {
  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service not configured" }, { status: 503 });
  }

  const body = await req.json();
  const { actionId, status, executionResult, errorMessage } = body;

  if (!actionId || !status) {
    return NextResponse.json({ error: "actionId and status required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { status };
  if (status === "completed") updates.executed_at = new Date().toISOString();
  if (executionResult) updates.execution_result = executionResult;
  if (errorMessage) updates.error_message = errorMessage;

  const updated = await updateFireAction(supabase, actionId, updates);

  if (!updated) {
    return NextResponse.json({ error: "Failed to update action" }, { status: 500 });
  }

  return NextResponse.json({ action: updated });
}
