import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { getGmailClient, fetchGmailThreads } from "@/lib/gmail/service";
import { matchGmailToLeads } from "@/lib/gmail/match";

/**
 * GET /api/gmail/sync
 * Fetch recent Gmail threads and match them to the user's leads.
 * Returns data in the CommunicationThread format the Inbox expects.
 *
 * Query params:
 *   maxResults — max threads to fetch (default 50)
 *   q — Gmail search query (default "newer_than:7d")
 */
export async function GET(request: NextRequest) {
  const { user, supabase, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check for Gmail connection
  const gmailResult = await getGmailClient(supabase, user.id);
  if (!gmailResult) {
    return NextResponse.json({
      connected: false,
      matched: {},
      unmatched: [],
    });
  }

  const { gmail, tokenRow } = gmailResult;

  try {
    // Parse query params
    const maxResults = parseInt(request.nextUrl.searchParams.get("maxResults") || "50");
    const query = request.nextUrl.searchParams.get("q") || "newer_than:7d";

    // Fetch Gmail threads
    const gmailThreads = await fetchGmailThreads(gmail, { maxResults, query });

    // Fetch user's leads for email matching
    const { data: leadsData } = await supabase
      .from("leads")
      .select("id, email:raw_data->email")
      .eq("user_id", user.id);

    // Also try the top-level email field from the lead record
    const { data: leadsWithEmail } = await supabase
      .from("leads")
      .select("id, email")
      .eq("user_id", user.id);

    // Merge: use direct email column first, fall back to raw_data
    const leads = (leadsWithEmail || []).map((l) => {
      const rawLead = leadsData?.find((r) => r.id === l.id);
      return {
        id: l.id,
        email: l.email || (rawLead?.email as string) || undefined,
      };
    });

    // Match threads to leads
    const { matched, unmatched } = matchGmailToLeads(
      gmailThreads,
      leads,
      tokenRow.gmail_email
    );

    // Update last_sync_at
    await supabase
      .from("gmail_tokens")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", tokenRow.id);

    return NextResponse.json({
      connected: true,
      email: tokenRow.gmail_email,
      matched,
      unmatched,
      threadCount: gmailThreads.length,
      matchedCount: Object.values(matched).flat().length,
      unmatchedCount: unmatched.length,
      lastSyncAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error("Gmail sync error:", err);

    const error = err as { code?: number; message?: string };

    // Handle token revocation / expiration
    if (error.code === 401 || error.message?.includes("invalid_grant")) {
      await supabase
        .from("gmail_tokens")
        .update({ is_active: false })
        .eq("id", tokenRow.id);

      return NextResponse.json({
        connected: false,
        error: "Gmail access was revoked. Please reconnect.",
        matched: {},
        unmatched: [],
      });
    }

    return NextResponse.json(
      { error: "Failed to sync Gmail", details: error.message },
      { status: 500 }
    );
  }
}
