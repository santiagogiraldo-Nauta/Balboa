import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";

/**
 * POST /api/gmail/disconnect
 * Disconnect Gmail by deactivating the stored token.
 */
export async function POST() {
  const { user, supabase, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await supabase
    .from("gmail_tokens")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("is_active", true);

  return NextResponse.json({ disconnected: true });
}
