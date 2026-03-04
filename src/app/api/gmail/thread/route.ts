import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { getGmailClient, fetchGmailThreadFull } from "@/lib/gmail/service";

/**
 * GET /api/gmail/thread?threadId=gmail-xxxx
 * Fetch full message bodies for a specific Gmail thread.
 * Called on-demand when user clicks on a conversation in the Inbox.
 */
export async function GET(request: NextRequest) {
  const { user, supabase, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const threadId = request.nextUrl.searchParams.get("threadId");
  if (!threadId) {
    return NextResponse.json({ error: "threadId parameter required" }, { status: 400 });
  }

  // Strip "gmail-" prefix if present
  const gmailThreadId = threadId.replace(/^gmail-/, "");

  const gmailResult = await getGmailClient(supabase, user.id);
  if (!gmailResult) {
    return NextResponse.json({ error: "Gmail not connected" }, { status: 400 });
  }

  try {
    const messages = await fetchGmailThreadFull(gmailResult.gmail, gmailThreadId);
    return NextResponse.json({ threadId, messages });
  } catch (err: unknown) {
    console.error("Gmail thread fetch error:", err);
    const error = err as { message?: string };
    return NextResponse.json(
      { error: "Failed to load thread", details: error.message },
      { status: 500 }
    );
  }
}
