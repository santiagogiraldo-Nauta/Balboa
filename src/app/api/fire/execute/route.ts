import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getPendingFireActions,
  updateFireAction,
  countFireActions,
} from "@/lib/fire/db-fire";
import { DEFAULT_FIRE_RATE_LIMITS } from "@/lib/fire/types";
import type { FireExecutionPayload } from "@/lib/fire/types";

/**
 * POST /api/fire/execute
 *
 * Called by n8n every 15 minutes to process pending fire actions.
 * Returns a list of actions for n8n to execute (Gmail sends, LinkedIn, Slack).
 *
 * Auth: service role key as secret.
 */
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Service not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const secret = body.secret;
  const isInternal = req.headers.get("x-internal") === "true";

  if (!isInternal && secret !== serviceKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    // Get pending actions ready for execution
    const pendingActions = await getPendingFireActions(supabase, 50);

    if (!pendingActions.length) {
      return NextResponse.json({
        success: true,
        actions: [],
        message: "No pending actions",
      });
    }

    const executionPayloads: FireExecutionPayload[] = [];
    const skipped: string[] = [];
    const rateLimitCache: Map<string, { email: number; linkedin: number }> = new Map();

    for (const action of pendingActions) {
      // Rate limit check per user per channel
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      let userCounts = rateLimitCache.get(action.user_id);
      if (!userCounts) {
        const [emailCount, linkedinCount] = await Promise.all([
          countFireActions(supabase, action.user_id, "email", hourAgo),
          countFireActions(supabase, action.user_id, "linkedin", dayAgo),
        ]);
        userCounts = { email: emailCount, linkedin: linkedinCount };
        rateLimitCache.set(action.user_id, userCounts);
      }

      // Check rate limits
      if (action.channel === "email" && userCounts.email >= DEFAULT_FIRE_RATE_LIMITS.maxEmailsPerHour) {
        skipped.push(`${action.id}: email rate limit`);
        continue;
      }
      if (action.channel === "linkedin" && userCounts.linkedin >= DEFAULT_FIRE_RATE_LIMITS.maxLinkedInPerDay) {
        skipped.push(`${action.id}: linkedin rate limit`);
        continue;
      }

      // Handle internal actions that don't need n8n
      if (action.action_type === "snooze" || action.action_type === "update_status") {
        await updateFireAction(supabase, action.id, {
          status: "completed",
          executed_at: new Date().toISOString(),
          execution_result: { handled: "internal", action_type: action.action_type },
        });
        continue;
      }

      // Handle create_call_task → insert into daily_actions directly
      if (action.action_type === "create_call_task") {
        await supabase.from("daily_actions").insert([{
          user_id: action.user_id,
          lead_id: action.lead_id,
          action_type: "first_touch",
          priority: "urgent",
          channel: "call",
          reason: (action.metadata as Record<string, unknown>)?.reason || "Fire engine: call task created",
          suggested_message: null,
          status: "pending",
          due_date: new Date().toISOString().split("T")[0],
        }]);

        await updateFireAction(supabase, action.id, {
          status: "completed",
          executed_at: new Date().toISOString(),
          execution_result: { handled: "daily_action_created" },
        });
        continue;
      }

      // Mark as executing and add to n8n payload
      await updateFireAction(supabase, action.id, {
        status: "executing",
      });

      executionPayloads.push({
        actionId: action.id,
        actionType: action.action_type,
        channel: action.channel as FireExecutionPayload["channel"],
        leadId: action.lead_id,
        userId: action.user_id,
        subject: action.subject,
        body: action.body,
        templateKey: action.template_key,
        metadata: action.metadata || {},
      });

      // Update rate limit cache
      if (action.channel === "email") userCounts.email++;
      if (action.channel === "linkedin") userCounts.linkedin++;
    }

    return NextResponse.json({
      success: true,
      actions: executionPayloads,
      totalPending: pendingActions.length,
      executing: executionPayloads.length,
      skipped: skipped.length,
      skippedReasons: skipped,
      executedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Fire Execute] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Execution failed" },
      { status: 500 }
    );
  }
}
