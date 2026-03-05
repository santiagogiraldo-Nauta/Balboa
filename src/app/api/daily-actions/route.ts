import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { getDailyActions, updateDailyActionStatus, insertDailyAction } from "@/lib/db-touchpoints";

/**
 * GET /api/daily-actions
 *
 * Returns today's recommended actions for the user.
 * Combines pre-computed actions from webhook events with
 * real-time computed actions from lead/sequence data.
 */
export async function GET() {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  try {
    // 1. Get pending daily actions
    const pendingActions = await getDailyActions(supabase, user.id, {
      status: "pending",
      limit: 50,
    });

    // 2. Compute additional actions from lead data
    const computedActions = await computeActionsFromLeads(supabase, user.id);

    // 3. Get today's stats
    const today = new Date().toISOString().split("T")[0];
    const completedToday = await getDailyActions(supabase, user.id, {
      status: "completed",
      limit: 100,
    });
    const completedTodayCount = completedToday.filter(
      a => a.completed_at && a.completed_at.startsWith(today)
    ).length;

    // 4. Get touchpoint stats for today
    const { data: todayTouchpoints } = await supabase
      .from("touchpoint_events")
      .select("event_type, channel")
      .eq("user_id", user.id)
      .gte("created_at", `${today}T00:00:00Z`);

    const todayStats = {
      actionsCompleted: completedTodayCount,
      emailsSent: (todayTouchpoints || []).filter(t => t.event_type === "sent" && t.channel === "email").length,
      callsMade: (todayTouchpoints || []).filter(t => t.channel === "call").length,
      repliesReceived: (todayTouchpoints || []).filter(t => t.event_type === "replied").length,
      meetingsBooked: (todayTouchpoints || []).filter(t => t.event_type === "meeting_booked").length,
    };

    // 5. Merge and sort by priority
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allActions = [...pendingActions, ...computedActions] as any as Array<Record<string, unknown>>;
    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    allActions.sort((a, b) => (priorityOrder[a.priority as string] || 3) - (priorityOrder[b.priority as string] || 3));

    // 6. Enrich with lead info
    const enrichedActions = await enrichWithLeadInfo(supabase, allActions);

    return NextResponse.json({
      actions: enrichedActions,
      stats: todayStats,
      total: enrichedActions.length,
    });
  } catch (error) {
    console.error("[Daily Actions] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch daily actions" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/daily-actions
 *
 * Update action status (complete, snooze, dismiss)
 * Body: { actionId: string, status: "completed" | "snoozed" | "dismissed" }
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  try {
    const { actionId, status } = await req.json();

    if (!actionId || !status) {
      return NextResponse.json({ error: "actionId and status required" }, { status: 400 });
    }

    const updated = await updateDailyActionStatus(supabase, actionId, user.id, status);

    if (!updated) {
      return NextResponse.json({ error: "Action not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, action: updated });
  } catch (error) {
    console.error("[Daily Actions] Update error:", error);
    return NextResponse.json(
      { error: "Failed to update action" },
      { status: 500 }
    );
  }
}

// ─── Compute Actions from Lead Data ──────────────────────────────

async function computeActionsFromLeads(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<Array<{
  id: string;
  user_id: string;
  lead_id: string | null;
  action_type: string;
  priority: string;
  channel: string | null;
  reason: string;
  suggested_message: string | null;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}>> {
  const actions: Array<{
    id: string;
    user_id: string;
    lead_id: string | null;
    action_type: string;
    priority: string;
    channel: string | null;
    reason: string;
    suggested_message: string | null;
    status: string;
    due_date: string | null;
    completed_at: string | null;
    created_at: string;
  }> = [];

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // 1. Overdue follow-ups
  const { data: overdueLeads } = await supabase
    .from("leads")
    .select("id, first_name, last_name, company, next_action, next_action_date, raw_data")
    .eq("user_id", userId)
    .not("next_action_date", "is", null)
    .lte("next_action_date", todayStr);

  for (const lead of (overdueLeads || [])) {
    const rawData = (lead.raw_data || {}) as Record<string, unknown>;
    if (rawData.contactStatus === "negative") continue; // Skip negative contacts

    actions.push({
      id: `computed_overdue_${lead.id}`,
      user_id: userId,
      lead_id: lead.id,
      action_type: "follow_up",
      priority: "high",
      channel: (rawData.lastOutreachMethod as string) || "email",
      reason: `Overdue: ${lead.next_action || "Follow-up scheduled"}`,
      suggested_message: null,
      status: "pending",
      due_date: lead.next_action_date,
      completed_at: null,
      created_at: new Date().toISOString(),
    });
  }

  // 2. Stale engaged leads (no activity in 7+ days)
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: allLeads } = await supabase
    .from("leads")
    .select("id, first_name, last_name, company, raw_data, updated_at")
    .eq("user_id", userId)
    .lt("updated_at", sevenDaysAgo)
    .limit(20);

  for (const lead of (allLeads || [])) {
    const rawData = (lead.raw_data || {}) as Record<string, unknown>;
    const contactStatus = rawData.contactStatus as string;

    // Only flag leads that were previously engaged
    if (contactStatus === "positive" || contactStatus === "neutral") {
      actions.push({
        id: `computed_stale_${lead.id}`,
        user_id: userId,
        lead_id: lead.id,
        action_type: "stale_lead",
        priority: contactStatus === "positive" ? "high" : "medium",
        channel: "email",
        reason: `No activity in 7+ days. Previously ${contactStatus}. Re-engage.`,
        suggested_message: null,
        status: "pending",
        due_date: todayStr,
        completed_at: null,
        created_at: new Date().toISOString(),
      });
    }
  }

  // 3. Hot leads without meetings scheduled
  const { data: hotLeads } = await supabase
    .from("leads")
    .select("id, first_name, last_name, company, raw_data, icp_score")
    .eq("user_id", userId)
    .limit(200);

  for (const lead of (hotLeads || [])) {
    const rawData = (lead.raw_data || {}) as Record<string, unknown>;
    const icpScore = (lead.icp_score || {}) as Record<string, unknown>;
    const tier = icpScore.tier as string;
    const contactStatus = rawData.contactStatus as string;
    const meetingScheduled = rawData.meetingScheduled as boolean;

    if (tier === "hot" && contactStatus === "positive" && !meetingScheduled) {
      actions.push({
        id: `computed_hot_${lead.id}`,
        user_id: userId,
        lead_id: lead.id,
        action_type: "hot_signal",
        priority: "urgent",
        channel: "call",
        reason: `Hot lead with positive response. No meeting scheduled. Push for a meeting.`,
        suggested_message: null,
        status: "pending",
        due_date: todayStr,
        completed_at: null,
        created_at: new Date().toISOString(),
      });
    }
  }

  return actions;
}

// ─── Enrich Actions with Lead Info ───────────────────────────────

async function enrichWithLeadInfo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actions: Array<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
  // Get unique lead IDs
  const leadIds = [...new Set(actions.filter(a => a.lead_id).map(a => a.lead_id as string))];

  if (leadIds.length === 0) return actions;

  const { data: leads } = await supabase
    .from("leads")
    .select("id, first_name, last_name, company, position, email, icp_score")
    .in("id", leadIds);

  const leadMap = new Map((leads || []).map(l => [l.id, l]));

  return actions.map(action => {
    const lead = leadMap.get(action.lead_id as string);
    if (lead) {
      return {
        ...action,
        lead_name: `${lead.first_name} ${lead.last_name}`.trim(),
        lead_company: lead.company,
        lead_position: lead.position,
        lead_email: lead.email,
        lead_tier: (lead.icp_score as Record<string, unknown>)?.tier,
      };
    }
    return action;
  });
}
