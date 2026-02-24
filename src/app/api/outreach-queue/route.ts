import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { getQueueItems, approveQueueItem, rejectQueueItem, cancelQueueItem } from "@/lib/db-outreach";

// GET: List outreach queue items
export async function GET(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status") as "pending_approval" | "approved" | "rejected" | "sent" | "cancelled" | null;

    const items = await getQueueItems(supabase, user.id, status || undefined);

    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    console.error("Outreach queue GET error:", error);
    return NextResponse.json({ error: "Failed to fetch queue" }, { status: 500 });
  }
}

// POST: Approve, reject, or cancel a queue item
export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { action, queueId, reason } = await req.json();

    if (!queueId || !action) {
      return NextResponse.json({ error: "Missing queueId or action" }, { status: 400 });
    }

    let result;
    switch (action) {
      case "approve":
        result = await approveQueueItem(supabase, user.id, queueId);
        break;
      case "reject":
        result = await rejectQueueItem(supabase, user.id, queueId, reason);
        break;
      case "cancel":
        result = await cancelQueueItem(supabase, user.id, queueId);
        break;
      default:
        return NextResponse.json({ error: "Invalid action. Use: approve, reject, cancel" }, { status: 400 });
    }

    if (!result) {
      return NextResponse.json({ error: "Failed to update queue item" }, { status: 500 });
    }

    return NextResponse.json({ success: true, item: result });
  } catch (error) {
    console.error("Outreach queue POST error:", error);
    return NextResponse.json({ error: "Failed to process queue action" }, { status: 500 });
  }
}
