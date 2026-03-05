import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";

// ─── GET /api/touchpoints ────────────────────────────────────────
// Returns recent touchpoint_events joined with lead name/company.
// Query params: channel, event_type, since (ISO), limit (default 100)

export async function GET(req: NextRequest) {
  const { user, supabase, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const channel = url.searchParams.get("channel");
    const eventType = url.searchParams.get("event_type");
    const since = url.searchParams.get("since");
    const limit = Math.min(Number(url.searchParams.get("limit") || "100"), 500);

    // Default: last 30 days
    const defaultSince = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    let query = supabase
      .from("touchpoint_events")
      .select(
        "id, user_id, lead_id, source, channel, event_type, direction, subject, body_preview, metadata, sentiment, created_at"
      )
      .eq("user_id", user.id)
      .gte("created_at", since || defaultSince)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (channel) query = query.eq("channel", channel);
    if (eventType) query = query.eq("event_type", eventType);

    const { data: touchpoints, error: tpError } = await query;

    if (tpError) {
      console.error("[api/touchpoints] Query error:", tpError);
      return NextResponse.json(
        { error: "Failed to fetch touchpoint events" },
        { status: 500 }
      );
    }

    // Collect unique lead_ids to fetch lead names
    const leadIds = [
      ...new Set(
        (touchpoints || []).filter((t) => t.lead_id).map((t) => t.lead_id as string)
      ),
    ];

    let leadLookup: Record<
      string,
      { firstName: string; lastName: string; company: string }
    > = {};

    if (leadIds.length > 0) {
      const { data: leads } = await supabase
        .from("leads")
        .select("id, first_name, last_name, company")
        .in("id", leadIds);

      for (const lead of leads || []) {
        leadLookup[lead.id as string] = {
          firstName: lead.first_name as string,
          lastName: lead.last_name as string,
          company: (lead.company as string) || "",
        };
      }
    }

    // Enrich touchpoints with lead name + company
    const enriched = (touchpoints || []).map((tp) => {
      const lead = tp.lead_id ? leadLookup[tp.lead_id as string] : null;
      return {
        ...tp,
        lead_name: lead
          ? `${lead.firstName} ${lead.lastName}`.trim()
          : null,
        lead_company: lead?.company || null,
      };
    });

    return NextResponse.json({ touchpoints: enriched });
  } catch (err) {
    console.error("[api/touchpoints] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
