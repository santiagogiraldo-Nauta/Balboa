import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { getDeals, getAccounts } from "@/lib/db";

export async function GET() {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [rawDeals, rawAccounts] = await Promise.all([
      getDeals(supabase, user.id),
      getAccounts(supabase, user.id),
    ]);

    // Build account lookup
    const accountMap = new Map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (rawAccounts || []).map((a: any) => [a.id, a])
    );

    // Enrich deals with account + lead info
    const leadIds = [...new Set(rawDeals.filter(d => d.lead_id).map(d => d.lead_id))];
    let leadMap = new Map();
    if (leadIds.length > 0) {
      const { data: leads } = await supabase
        .from("leads")
        .select("id, first_name, last_name, position")
        .in("id", leadIds);
      leadMap = new Map((leads || []).map(l => [l.id, l]));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deals = rawDeals.map((d: any) => {
      const account = accountMap.get(d.account_id);
      const lead = leadMap.get(d.lead_id);
      const daysSinceUpdate = d.updated_at
        ? Math.floor((Date.now() - new Date(d.updated_at).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        id: d.id,
        deal_name: d.deal_name,
        company_name: account?.company_name || null,
        amount: d.amount,
        deal_stage: mapDealStage(d.deal_stage),
        probability: d.probability,
        deal_health: d.deal_health || "warm",
        deal_owner: "Santiago Giraldo",
        pipeline: "sales",
        contact_name: lead ? `${lead.first_name} ${lead.last_name}`.trim() : null,
        lead_id: d.lead_id,
        close_date: d.next_action_date,
        days_in_stage: daysSinceUpdate,
        last_activity_days: daysSinceUpdate,
        last_activity_type: "email",
        next_step: d.next_action || d.strategy_recommendation,
        contacts_count: 1,
        created_at: d.created_at,
      };
    });

    return NextResponse.json({ deals });
  } catch (error) {
    console.error("Error fetching deals:", error);
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 });
  }
}

// ── PUT: update a deal (stage, amount, etc.) ──

const reverseStageMap: Record<string, string> = {
  discovery: "Discovery",
  scope: "Scope",
  proposal_review: "Proposal Review",
  go: "Go",
  contracting: "Contracting",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
  lead: "Lead",
  meeting_scheduled: "Meeting Scheduled",
  meeting_held: "Meeting Held",
  qualified: "Qualified",
};

export async function PUT(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { dealId, updates } = body;

    if (!dealId || !updates) {
      return NextResponse.json({ error: "dealId and updates required" }, { status: 400 });
    }

    // Map frontend stage IDs back to DB stage names
    const dbUpdates: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() };
    if (dbUpdates.deal_stage && typeof dbUpdates.deal_stage === "string") {
      dbUpdates.deal_stage = reverseStageMap[dbUpdates.deal_stage as string] || dbUpdates.deal_stage;
    }

    const { data, error } = await supabase
      .from("deals")
      .update(dbUpdates)
      .eq("id", dealId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating deal:", error);
      return NextResponse.json({ error: "Failed to update deal" }, { status: 500 });
    }

    return NextResponse.json({ deal: data });
  } catch (error) {
    console.error("Error in PUT /api/deals:", error);
    return NextResponse.json({ error: "Failed to update deal" }, { status: 500 });
  }
}

/** Map DB deal_stage strings to PipelineDeal stage IDs */
function mapDealStage(stage: string): string {
  const stageMap: Record<string, string> = {
    "Discovery": "discovery",
    "Scope": "scope",
    "Proposal Review": "proposal_review",
    "Go": "go",
    "Contracting": "contracting",
    "Closed Won": "closed_won",
    "Closed Lost": "closed_lost",
    "Lead": "lead",
    "Meeting Scheduled": "meeting_scheduled",
    "Meeting Held": "meeting_held",
    "Qualified": "qualified",
  };
  return stageMap[stage] || stage.toLowerCase().replace(/\s+/g, "_");
}
