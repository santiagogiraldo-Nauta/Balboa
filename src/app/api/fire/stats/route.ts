import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getFireStats } from "@/lib/fire/db-fire";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET /api/fire/stats
 * Fire engine metrics — actions today, classifications, execution rate.
 *
 * Query params: userId, since (default: today)
 */
export async function GET(req: NextRequest) {
  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service not configured" }, { status: 503 });
  }

  const params = req.nextUrl.searchParams;
  const userId = params.get("userId");
  const since = params.get("since") || new Date().toISOString().split("T")[0];

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const stats = await getFireStats(supabase, userId, since);

  return NextResponse.json({
    ...stats,
    since,
    generatedAt: new Date().toISOString(),
  });
}
