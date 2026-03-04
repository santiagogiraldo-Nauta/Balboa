import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { getGmailClient, fetchGmailThreads } from "@/lib/gmail/service";
import { matchGmailToLeads } from "@/lib/gmail/match";
import { persistGmailThreads } from "@/lib/gmail/persist";

/**
 * GET /api/gmail/sync
 * Fetch recent Gmail threads and match them to the user's leads.
 * Returns data in the CommunicationThread format the Inbox expects.
 *
 * Query params:
 *   maxResults — max threads to fetch (default 200)
 *   q — Gmail search query (default "newer_than:90d")
 *   fullSync — if "true", fetch all history (no date filter, max 500)
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
    const isFullSync = request.nextUrl.searchParams.get("fullSync") === "true";
    const defaultMaxResults = isFullSync ? 500 : 200;
    const defaultQuery = isFullSync ? "" : "newer_than:90d";

    const maxResults = parseInt(
      request.nextUrl.searchParams.get("maxResults") || String(defaultMaxResults)
    );
    const query = request.nextUrl.searchParams.get("q") || defaultQuery;

    // Fetch Gmail threads
    const gmailThreads = await fetchGmailThreads(gmail, { maxResults, query });

    // Fetch user's leads with full data for matching (email, name, company)
    const { data: leadsData } = await supabase
      .from("leads")
      .select("id, email, first_name, last_name, company, linkedin_url, raw_data")
      .eq("user_id", user.id);

    // Build leads array with all available data for matching
    const leads = (leadsData || []).map((l) => {
      const rawData = l.raw_data as Record<string, unknown> | null;
      return {
        id: l.id as string,
        email:
          (l.email as string) ||
          (rawData?.email as string) ||
          undefined,
        firstName: (l.first_name as string) || "",
        lastName: (l.last_name as string) || "",
        company: (l.company as string) || "",
      };
    });

    // Match threads to leads (now with name + domain matching)
    const { matched, unmatched } = matchGmailToLeads(
      gmailThreads,
      leads,
      tokenRow.gmail_email
    );

    // Persist threads to database (conversations + messages tables)
    // Must await on Vercel — serverless functions terminate after response
    try {
      const persistResult = await persistGmailThreads(supabase, user.id, matched, unmatched);
      console.log(`[gmail-sync] Persisted ${persistResult.conversationsUpserted} conversations, ${persistResult.messagesUpserted} messages`);
    } catch (persistErr) {
      console.error("[gmail-sync] Persistence error:", persistErr);
    }

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
