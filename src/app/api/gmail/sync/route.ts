import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import {
  getGmailClient,
  fetchGmailThreads,
  fetchGmailThreadsPaginated,
} from "@/lib/gmail/service";
import { matchGmailToLeads } from "@/lib/gmail/match";
import { persistGmailThreads } from "@/lib/gmail/persist";

/**
 * GET /api/gmail/sync
 * Fetch recent Gmail threads and match them to the user's leads.
 * Returns data in the CommunicationThread format the Inbox expects.
 *
 * Query params:
 *   mode       — "recent" (default) or "full"
 *                recent: newer_than:90d, maxResults 200, single page
 *                full:   newer_than:180d, maxResults 500, paginated (up to 5 pages)
 *   maxResults — override max threads per page (default depends on mode)
 *   q          — override Gmail search query (default depends on mode)
 *   fullSync   — (legacy) if "true", equivalent to mode=full
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
    // ── Parse mode ────────────────────────────────────────────────
    const searchParams = request.nextUrl.searchParams;
    const isLegacyFullSync = searchParams.get("fullSync") === "true";
    const mode = searchParams.get("mode") || (isLegacyFullSync ? "full" : "recent");
    const isFullMode = mode === "full";

    const defaultMaxResults = isFullMode ? 500 : 200;
    const defaultQuery = isFullMode ? "newer_than:180d" : "newer_than:90d";

    const maxResults = parseInt(
      searchParams.get("maxResults") || String(defaultMaxResults)
    );
    const query = searchParams.get("q") || defaultQuery;

    // ── Fetch Gmail threads ───────────────────────────────────────
    let gmailThreads;
    let paginationMeta: { totalPages?: number; nextPageToken?: string } = {};

    if (isFullMode) {
      // Full mode: paginated fetch (up to 5 pages)
      const result = await fetchGmailThreadsPaginated(gmail, {
        maxResults,
        query,
        maxPages: 5,
      });
      gmailThreads = result.threads;
      paginationMeta = {
        totalPages: result.totalPages,
        nextPageToken: result.nextPageToken,
      };
    } else {
      // Recent mode: single-page fetch (backward compatible)
      gmailThreads = await fetchGmailThreads(gmail, { maxResults, query });
    }

    // ── Fetch user's leads for matching ───────────────────────────
    const { data: leadsData } = await supabase
      .from("leads")
      .select("id, email, first_name, last_name, company, linkedin_url, raw_data")
      .eq("user_id", user.id);

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

    // ── Match threads to leads ────────────────────────────────────
    const { matched, unmatched } = matchGmailToLeads(
      gmailThreads,
      leads,
      tokenRow.gmail_email
    );

    // ── Persist threads to database ───────────────────────────────
    try {
      const persistResult = await persistGmailThreads(supabase, user.id, matched, unmatched);
      console.log(
        `[gmail-sync] Persisted ${persistResult.conversationsUpserted} conversations, ${persistResult.messagesUpserted} messages`
      );
    } catch (persistErr) {
      console.error("[gmail-sync] Persistence error:", persistErr);
    }

    // ── Store historyId + update last_sync_at ─────────────────────
    // Fetch the latest historyId from Gmail for future incremental sync
    const syncUpdates: Record<string, unknown> = {
      last_sync_at: new Date().toISOString(),
    };

    try {
      const { data: profile } = await gmail.users.getProfile({
        userId: "me",
      });
      if (profile.historyId) {
        syncUpdates.sync_history_id = profile.historyId;
      }
    } catch (profileErr) {
      console.error("[gmail-sync] Failed to fetch historyId:", profileErr);
    }

    await supabase
      .from("gmail_tokens")
      .update(syncUpdates)
      .eq("id", tokenRow.id);

    // ── Response ──────────────────────────────────────────────────
    return NextResponse.json({
      connected: true,
      email: tokenRow.gmail_email,
      mode,
      matched,
      unmatched,
      threadCount: gmailThreads.length,
      matchedCount: Object.values(matched).flat().length,
      unmatchedCount: unmatched.length,
      lastSyncAt: new Date().toISOString(),
      ...(isFullMode
        ? {
            totalPages: paginationMeta.totalPages,
            nextPageToken: paginationMeta.nextPageToken || null,
            hasMore: !!paginationMeta.nextPageToken,
          }
        : {}),
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
