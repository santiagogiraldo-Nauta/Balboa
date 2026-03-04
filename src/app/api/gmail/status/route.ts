import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";

/**
 * GET /api/gmail/status
 * Check if the current user has an active Gmail connection.
 */
export async function GET() {
  const { user, supabase, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data } = await supabase
    .from("gmail_tokens")
    .select("gmail_email, connected_at, last_sync_at")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  return NextResponse.json({
    connected: !!data,
    email: data?.gmail_email || null,
    connectedAt: data?.connected_at || null,
    lastSyncAt: data?.last_sync_at || null,
  });
}
