import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { getGmailClient, type ParsedGmailThread } from "@/lib/gmail/service";
import { matchGmailToLeads } from "@/lib/gmail/match";
import { persistGmailThreads } from "@/lib/gmail/persist";

/**
 * GET /api/gmail/sync-page
 *
 * Paginated background sync endpoint.
 * Fetches ONE page of Gmail threads, matches them to leads,
 * and persists to the database.
 *
 * The frontend can call this in a loop to progressively sync
 * a large email history without hitting Vercel's 60s timeout.
 *
 * Query params:
 *   pageToken  — Gmail pagination token (omit for first page)
 *   batchSize  — threads per page (default 50, max 500)
 *   query      — Gmail search query (default "newer_than:180d")
 */
export async function GET(request: NextRequest) {
  const { user, supabase, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gmailResult = await getGmailClient(supabase, user.id);
  if (!gmailResult) {
    return NextResponse.json(
      { error: "Gmail not connected" },
      { status: 400 }
    );
  }

  const { gmail, tokenRow } = gmailResult;

  try {
    const searchParams = request.nextUrl.searchParams;
    const pageToken = searchParams.get("pageToken") || undefined;
    const batchSize = Math.min(
      parseInt(searchParams.get("batchSize") || "50"),
      500
    );
    const query = searchParams.get("query") || "newer_than:180d";

    // ── 1. List thread IDs for ONE page ──────────────────────────
    const { data: listData } = await gmail.users.threads.list({
      userId: "me",
      maxResults: batchSize,
      q: query,
      ...(pageToken ? { pageToken } : {}),
    });

    if (!listData.threads || listData.threads.length === 0) {
      return NextResponse.json({
        persisted: 0,
        nextPageToken: null,
        hasMore: false,
        threadsInPage: 0,
      });
    }

    // ── 2. Fetch thread metadata in batches of 5 (rate-limit safe) ─
    const parsedThreads: ParsedGmailThread[] = [];
    const detailBatchSize = 5;
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    for (let i = 0; i < listData.threads.length; i += detailBatchSize) {
      const batch = listData.threads.slice(i, i + detailBatchSize);
      const batchResults = await Promise.all(
        batch.map(async (t) => {
          try {
            const { data: thread } = await gmail.users.threads.get({
              userId: "me",
              id: t.id!,
              format: "metadata",
              metadataHeaders: ["From", "To", "Subject", "Date", "Message-ID"],
            });
            return thread;
          } catch {
            return null;
          }
        })
      );

      for (const thread of batchResults) {
        if (!thread?.messages) continue;

        // Parse inline to avoid needing the private parseGmailThread helper.
        // We use the same structure as ParsedGmailThread.
        const messages = thread.messages.map((msg) => {
          const headers = msg.payload?.headers || [];
          const getHeader = (name: string) =>
            headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
              ?.value || "";

          const from = getHeader("From");
          const to = getHeader("To");
          const subject = getHeader("Subject");
          const dateStr = getHeader("Date");

          let date: string;
          try {
            date = dateStr
              ? new Date(dateStr).toISOString()
              : msg.internalDate
                ? new Date(parseInt(msg.internalDate)).toISOString()
                : new Date().toISOString();
          } catch {
            date = new Date().toISOString();
          }

          const fromEmail = (() => {
            const match = from.match(/<([^>]+)>/);
            return match ? match[1].toLowerCase() : from.toLowerCase().trim();
          })();

          const toEmail = (() => {
            const match = to.match(/<([^>]+)>/);
            return match ? match[1].toLowerCase() : to.toLowerCase().trim();
          })();

          return {
            gmailId: msg.id || "",
            threadId: msg.threadId || "",
            from,
            fromEmail,
            to,
            toEmail,
            subject,
            snippet: msg.snippet || "",
            date,
            isRead: !msg.labelIds?.includes("UNREAD"),
            direction: "inbound" as const,
          };
        });

        const lastMsg = messages[messages.length - 1];
        parsedThreads.push({
          threadId: thread.id || "",
          subject: messages[0]?.subject || "(no subject)",
          messages,
          lastMessageDate: lastMsg?.date || new Date().toISOString(),
          snippet: thread.snippet || "",
        });
      }

      // Rate-limit: small delay between batches to avoid quota exhaustion
      if (i + detailBatchSize < listData.threads.length) {
        await delay(200);
      }
    }

    // ── 3. Fetch leads for matching ──────────────────────────────
    const { data: leadsData } = await supabase
      .from("leads")
      .select(
        "id, email, first_name, last_name, company, linkedin_url, raw_data"
      )
      .eq("user_id", user.id);

    const leads = (leadsData || []).map((l) => {
      const rawData = l.raw_data as Record<string, unknown> | null;
      return {
        id: l.id as string,
        email:
          (l.email as string) || (rawData?.email as string) || undefined,
        firstName: (l.first_name as string) || "",
        lastName: (l.last_name as string) || "",
        company: (l.company as string) || "",
      };
    });

    // ── 4. Match threads to leads ────────────────────────────────
    const { matched, unmatched } = matchGmailToLeads(
      parsedThreads,
      leads,
      tokenRow.gmail_email
    );

    // ── 5. Persist to database ───────────────────────────────────
    let persistedCount = 0;
    try {
      const result = await persistGmailThreads(
        supabase,
        user.id,
        matched,
        unmatched
      );
      persistedCount = result.conversationsUpserted;
      console.log(
        `[gmail-sync-page] Persisted ${result.conversationsUpserted} conversations, ${result.messagesUpserted} messages`
      );
    } catch (persistErr) {
      console.error("[gmail-sync-page] Persistence error:", persistErr);
    }

    // ── 6. Store historyId for future incremental sync ───────────
    if (listData.resultSizeEstimate) {
      await supabase
        .from("gmail_tokens")
        .update({
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", tokenRow.id);
    }

    const nextToken = listData.nextPageToken || null;
    return NextResponse.json({
      persisted: persistedCount,
      nextPageToken: nextToken,
      hasMore: !!nextToken,
      threadsInPage: parsedThreads.length,
      matchedCount: Object.values(matched).flat().length,
      unmatchedCount: unmatched.length,
    });
  } catch (err: unknown) {
    console.error("[gmail-sync-page] Error:", err);

    const error = err as { code?: number; message?: string };

    if (error.code === 401 || error.message?.includes("invalid_grant")) {
      await supabase
        .from("gmail_tokens")
        .update({ is_active: false })
        .eq("id", tokenRow.id);

      return NextResponse.json(
        { error: "Gmail access was revoked. Please reconnect." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Sync page failed", details: error.message },
      { status: 500 }
    );
  }
}
