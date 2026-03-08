import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getAccountBrief,
  getDealBrief,
  getSignalPriorityQueue,
} from "@/lib/toretto/signals/agent-queries";
import type { SignalEntityType, SignalKey } from "@/lib/toretto/signals/types";
import type { PriorityQueueOptions } from "@/lib/toretto/signals/agent-queries";

/**
 * POST /api/toretto/signals/query
 *
 * Read-only query endpoint for agent consumption.
 * Returns structured briefs and priority queues built from computed signals.
 *
 * Auth: service role key as `secret` in body, or x-internal header.
 *
 * Body:
 *   {
 *     secret?: string,
 *     type: "account_brief" | "deal_brief" | "priority_queue",
 *     accountId?: string,           // required for account_brief
 *     dealId?: string,              // required for deal_brief
 *     entityTypes?: SignalEntityType[],  // optional filter for priority_queue
 *     signalKeys?: SignalKey[],     // optional filter for priority_queue
 *     minBand?: ScoreBand,          // optional for priority_queue (default: "low")
 *     limit?: number,               // optional for priority_queue (default: 25)
 *   }
 *
 * Responses:
 *   200 — query result
 *   400 — invalid request
 *   401 — unauthorized
 *   404 — entity not found / Toretto not enabled
 *   503 — not configured
 */
export async function POST(req: NextRequest) {
  // Gate: Toretto must be enabled
  if (process.env.TORETTO_INGEST_ENABLED !== "true") {
    return NextResponse.json(
      { error: "Toretto is not enabled" },
      { status: 404 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 }
    );
  }

  // Auth check: service key in body OR x-internal header
  const body = await req.json().catch(() => ({}));
  const isInternal = req.headers.get("x-internal") === "true";

  if (!isInternal && body.secret !== serviceKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const queryType = body.type as string;

  try {
    switch (queryType) {
      // ── Account Brief ───────────────────────────────────────
      case "account_brief": {
        const accountId = body.accountId as string | undefined;
        if (!accountId) {
          return NextResponse.json(
            { error: "accountId is required for account_brief" },
            { status: 400 }
          );
        }

        const brief = await getAccountBrief(supabase, accountId);
        if (!brief) {
          return NextResponse.json(
            { error: `Account not found: ${accountId}` },
            { status: 404 }
          );
        }

        return NextResponse.json({ success: true, type: "account_brief", data: brief });
      }

      // ── Deal Brief ──────────────────────────────────────────
      case "deal_brief": {
        const dealId = body.dealId as string | undefined;
        if (!dealId) {
          return NextResponse.json(
            { error: "dealId is required for deal_brief" },
            { status: 400 }
          );
        }

        const brief = await getDealBrief(supabase, dealId);
        if (!brief) {
          return NextResponse.json(
            { error: `Deal not found: ${dealId}` },
            { status: 404 }
          );
        }

        return NextResponse.json({ success: true, type: "deal_brief", data: brief });
      }

      // ── Priority Queue ──────────────────────────────────────
      case "priority_queue": {
        const options: PriorityQueueOptions = {};
        if (body.entityTypes) options.entityTypes = body.entityTypes as SignalEntityType[];
        if (body.signalKeys) options.signalKeys = body.signalKeys as SignalKey[];
        if (body.minBand) options.minBand = body.minBand;
        if (body.limit) options.limit = Math.min(body.limit as number, 100);

        const queue = await getSignalPriorityQueue(supabase, options);
        return NextResponse.json({ success: true, type: "priority_queue", data: queue });
      }

      default:
        return NextResponse.json(
          { error: `Unknown query type: ${queryType}. Valid: account_brief, deal_brief, priority_queue` },
          { status: 400 }
        );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[toretto/signals/query] Error:`, msg);
    return NextResponse.json(
      { error: `Query failed: ${msg}` },
      { status: 500 }
    );
  }
}
