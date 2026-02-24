import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { trackEvent, TrackEventParams } from "@/lib/tracking";

/**
 * POST /api/track — Lightweight endpoint for frontend event tracking.
 * Authenticates user, sets source to "frontend", delegates to trackEvent().
 */
export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: TrackEventParams = await req.json();

    // Validate required fields
    if (!body.eventCategory || !body.eventAction) {
      return NextResponse.json(
        { error: "Missing eventCategory or eventAction" },
        { status: 400 }
      );
    }

    // Override source to "frontend" — this endpoint is only for client-side events
    await trackEvent(supabase, user.id, {
      ...body,
      source: "frontend",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[track route] error:", error);
    return NextResponse.json({ error: "Tracking failed" }, { status: 500 });
  }
}
