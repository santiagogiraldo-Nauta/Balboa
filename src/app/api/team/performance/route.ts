import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { trackEvent } from "@/lib/tracking";

export async function GET(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: aeList, error } = await supabase
      .from("account_executives")
      .select("*")
      .eq("team_id", user.id);

    if (error) throw error;

    // Track event (fire-and-forget)
    trackEvent(supabase, user.id, {
      eventCategory: "team",
      eventAction: "ae_performance_viewed",
      numericValue: (aeList || []).length,
      source: "api",
    });

    return NextResponse.json({ accountExecutives: aeList || [] });
  } catch (error) {
    console.error("Error fetching team performance:", error);
    return NextResponse.json({ error: "Failed to fetch team" }, { status: 500 });
  }
}
