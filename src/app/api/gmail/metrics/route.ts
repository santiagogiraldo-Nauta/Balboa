import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";

/**
 * GET /api/gmail/metrics
 *
 * Compute email activity metrics from persisted messages in the database.
 * Returns aggregated stats for the inbox metrics bar and dashboards.
 */
export async function GET() {
  const { user, supabase, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Run all queries in parallel
    const [
      totalConvResult,
      matchedConvResult,
      totalMsgResult,
      sentResult,
      receivedResult,
      todayResult,
      unreadResult,
      recentThreadsResult,
    ] = await Promise.all([
      // Total conversations
      supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("channel", "email"),

      // Matched conversations (has lead_id)
      supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("channel", "email")
        .not("lead_id", "is", null),

      // Total messages
      supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("channel", "email"),

      // Sent messages
      supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("channel", "email")
        .eq("direction", "outbound"),

      // Received messages
      supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("channel", "email")
        .eq("direction", "inbound"),

      // Messages today
      supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("channel", "email")
        .gte("created_at", todayStart),

      // Unread conversations
      supabase
        .from("conversations")
        .select("unread_count")
        .eq("user_id", user.id)
        .eq("channel", "email")
        .gt("unread_count", 0),

      // Recent threads for response rate calculation (last 7 days)
      supabase
        .from("conversations")
        .select("id, last_message_direction, message_count")
        .eq("user_id", user.id)
        .eq("channel", "email")
        .gte("last_message_date", sevenDaysAgo)
        .not("lead_id", "is", null),
    ]);

    // Calculate total unread
    const totalUnread = (unreadResult.data || []).reduce(
      (sum, row) => sum + ((row.unread_count as number) || 0),
      0
    );

    // Calculate response rate from matched threads
    const recentThreads = recentThreadsResult.data || [];
    const threadsWithReplies = recentThreads.filter(
      (t) => (t.message_count as number) > 1
    ).length;
    const responseRate =
      recentThreads.length > 0
        ? Math.round((threadsWithReplies / recentThreads.length) * 100)
        : 0;

    const totalThreads = totalConvResult.count || 0;
    const matchedThreads = matchedConvResult.count || 0;

    return NextResponse.json({
      totalThreads,
      totalMessages: totalMsgResult.count || 0,
      sent: sentResult.count || 0,
      received: receivedResult.count || 0,
      matchedThreads,
      unmatchedThreads: totalThreads - matchedThreads,
      messagesToday: todayResult.count || 0,
      unreadCount: totalUnread,
      responseRate,
    });
  } catch (err) {
    console.error("[gmail-metrics] Error:", err);
    return NextResponse.json(
      { error: "Failed to compute metrics" },
      { status: 500 }
    );
  }
}
