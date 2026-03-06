import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkSilenceRules } from "@/lib/fire/branching-engine";

/**
 * POST /api/fire/silence-check
 * Run silence detection across all active fire-enabled enrollments.
 * Called by daily-actions cron or on-demand.
 *
 * Body: { secret?: string }
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
    const actionsCreated = await checkSilenceRules(supabase);

    return NextResponse.json({
      success: true,
      actionsCreated,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Fire Silence Check] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Silence check failed" },
      { status: 500 }
    );
  }
}
