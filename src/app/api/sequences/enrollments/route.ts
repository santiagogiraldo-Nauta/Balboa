import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { getSequenceEnrollments } from "@/lib/db-touchpoints";

/**
 * GET /api/sequences/enrollments
 *
 * Returns all sequence enrollments for the authenticated user,
 * enriched with lead info.
 */
export async function GET() {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  try {
    const enrollments = await getSequenceEnrollments(supabase, user.id);

    // Enrich with lead info
    const leadIds = [...new Set(enrollments.filter(e => e.lead_id).map(e => e.lead_id!))];

    let leadMap: Map<string, Record<string, unknown>> = new Map();
    if (leadIds.length > 0) {
      const { data: leads } = await supabase
        .from("leads")
        .select("id, first_name, last_name, company, email")
        .in("id", leadIds);

      leadMap = new Map((leads || []).map(l => [l.id, l]));
    }

    const enrichedEnrollments = enrollments.map(e => {
      const lead = e.lead_id ? leadMap.get(e.lead_id) : null;
      return {
        ...e,
        lead_name: lead ? `${lead.first_name} ${lead.last_name}`.trim() : null,
        lead_company: lead?.company || null,
        lead_email: lead?.email || null,
      };
    });

    return NextResponse.json({
      enrollments: enrichedEnrollments,
      total: enrichedEnrollments.length,
    });
  } catch (err) {
    console.error("[Enrollments API] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch enrollments" },
      { status: 500 }
    );
  }
}
