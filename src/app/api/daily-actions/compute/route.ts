import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertDailyAction } from "@/lib/db-touchpoints";

/**
 * POST /api/daily-actions/compute
 *
 * Batch compute daily actions from touchpoint_events + sequence_enrollments.
 * Called by n8n cron job each morning, or on demand.
 *
 * Uses service role key for unauthenticated access (cron-compatible).
 * Protected by a simple secret check.
 *
 * Body: { secret?: string }
 */
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Service not configured" }, { status: 503 });
  }

  // Simple auth — accept service role key as secret, or allow if called internally
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
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const results = { generated: 0, users: 0 };

    // Get all users with leads
    const { data: userIds } = await supabase
      .from("leads")
      .select("user_id")
      .limit(1000);

    const uniqueUsers = [...new Set((userIds || []).map(u => u.user_id))];
    results.users = uniqueUsers.length;

    for (const userId of uniqueUsers) {
      // 1. Check for positive replies needing follow-up
      const { data: positiveReplies } = await supabase
        .from("touchpoint_events")
        .select("lead_id, source, subject, created_at")
        .eq("user_id", userId)
        .eq("event_type", "replied")
        .eq("direction", "inbound")
        .gte("created_at", new Date(today.getTime() - 48 * 60 * 60 * 1000).toISOString())
        .limit(50);

      for (const reply of (positiveReplies || [])) {
        if (!reply.lead_id) continue;

        // Check if we already have an action for this
        const { data: existing } = await supabase
          .from("daily_actions")
          .select("id")
          .eq("user_id", userId)
          .eq("lead_id", reply.lead_id)
          .eq("action_type", "reply_needed")
          .eq("status", "pending")
          .limit(1);

        if ((existing || []).length > 0) continue;

        await insertDailyAction(supabase, {
          user_id: userId,
          lead_id: reply.lead_id,
          action_type: "reply_needed",
          priority: "urgent",
          channel: reply.source === "linkedin" ? "linkedin" : "email",
          reason: `Lead replied${reply.subject ? ` to "${reply.subject}"` : ""}. Respond promptly.`,
          suggested_message: null,
          status: "pending",
          due_date: todayStr,
        });
        results.generated++;
      }

      // 2. Sequence completions (leads that finished all steps)
      const { data: completedEnrollments } = await supabase
        .from("sequence_enrollments")
        .select("lead_id, sequence_name")
        .eq("user_id", userId)
        .eq("status", "completed")
        .gte("completed_at", new Date(today.getTime() - 48 * 60 * 60 * 1000).toISOString());

      for (const enrollment of (completedEnrollments || [])) {
        if (!enrollment.lead_id) continue;

        const { data: existing } = await supabase
          .from("daily_actions")
          .select("id")
          .eq("user_id", userId)
          .eq("lead_id", enrollment.lead_id)
          .eq("action_type", "first_touch")
          .eq("status", "pending")
          .limit(1);

        if ((existing || []).length > 0) continue;

        await insertDailyAction(supabase, {
          user_id: userId,
          lead_id: enrollment.lead_id,
          action_type: "first_touch",
          priority: "high",
          channel: "call",
          reason: `Completed sequence "${enrollment.sequence_name}". Manual outreach needed.`,
          suggested_message: null,
          status: "pending",
          due_date: todayStr,
        });
        results.generated++;
      }

      // 3. LinkedIn connections accepted (follow up with message)
      const { data: linkedinEvents } = await supabase
        .from("touchpoint_events")
        .select("lead_id, metadata")
        .eq("user_id", userId)
        .eq("source", "linkedin")
        .eq("event_type", "connection_accepted")
        .gte("created_at", new Date(today.getTime() - 48 * 60 * 60 * 1000).toISOString());

      for (const event of (linkedinEvents || [])) {
        if (!event.lead_id) continue;

        const { data: existing } = await supabase
          .from("daily_actions")
          .select("id")
          .eq("user_id", userId)
          .eq("lead_id", event.lead_id)
          .eq("action_type", "follow_up")
          .eq("status", "pending")
          .limit(1);

        if ((existing || []).length > 0) continue;

        await insertDailyAction(supabase, {
          user_id: userId,
          lead_id: event.lead_id,
          action_type: "follow_up",
          priority: "high",
          channel: "linkedin",
          reason: "LinkedIn connection accepted. Send an introductory message.",
          suggested_message: null,
          status: "pending",
          due_date: todayStr,
        });
        results.generated++;
      }
    }

    // 4. Check for sequence silence (Fire autonomy engine)
    let silenceActions = 0;
    try {
      const { checkSilenceRules } = await import("@/lib/fire/branching-engine");
      silenceActions = await checkSilenceRules(supabase);
    } catch (err) {
      console.error("[Daily Actions] Fire silence check error (non-blocking):", err);
    }

    return NextResponse.json({
      success: true,
      ...results,
      silenceActions,
      computedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Daily Actions Compute] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Compute failed" },
      { status: 500 }
    );
  }
}
