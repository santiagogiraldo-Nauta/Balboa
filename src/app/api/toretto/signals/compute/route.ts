import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  computeSignalsBatch,
  computeSignalsForSingleEntity,
} from "@/lib/toretto/signals/engine";
import type { SignalEntityType, SignalKey } from "@/lib/toretto/signals/types";

/**
 * POST /api/toretto/signals/compute
 *
 * Batch signal computation engine.
 * Computes deterministic signals from toretto.interactions.
 * Upserts results into toretto.signals, appends to toretto.signal_log.
 *
 * Called by cron (n8n, Vercel cron, or manual trigger).
 * Auth: service role key as `secret` in body, or x-internal header.
 *
 * Body:
 *   {
 *     secret: string,             // required unless x-internal header
 *     scope?: "all" | "account" | "deal" | "contact",  // default: "all"
 *     entityId?: string,          // compute for a single entity (requires scope != "all")
 *     signalKeys?: SignalKey[],   // compute only specific signals
 *     batchSize?: number,         // max entities per type (default: 50, max: 200)
 *     userId?: string,            // user_id for fire_action ownership (enables trigger evaluation)
 *   }
 *
 * Responses:
 *   200 — computation completed, returns SignalBatchResult
 *   401 — unauthorized
 *   404 — Toretto not enabled
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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Service not configured" },
      { status: 503 }
    );
  }

  // Auth: service role key or internal header
  const body = await req.json().catch(() => ({}));
  const secret = body.secret;
  const isInternal = req.headers.get("x-internal") === "true";

  if (!isInternal && secret !== serviceKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse options
  const scope: string = body.scope || "all";
  const entityId: string | undefined = body.entityId;
  const signalKeys: SignalKey[] | undefined = body.signalKeys;
  const batchSize = Math.min(Math.max(Number(body.batchSize) || 50, 1), 200);
  const userId: string | undefined = body.userId; // for fire_action ownership (trigger evaluation)

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    // Single entity mode
    if (entityId && scope !== "all") {
      const entityType = scope as SignalEntityType;
      if (!["account", "deal", "contact"].includes(entityType)) {
        return NextResponse.json(
          { error: `Invalid scope: ${scope}. Use account, deal, or contact.` },
          { status: 400 }
        );
      }

      console.log(
        `[Toretto Signals] Computing signals for ${entityType}:${entityId}`
      );

      const result = await computeSignalsForSingleEntity(
        supabase,
        entityType,
        entityId,
        userId
      );

      return NextResponse.json({
        success: true,
        mode: "single",
        entityType,
        entityId,
        ...result,
        executedAt: new Date().toISOString(),
      });
    }

    // Batch mode
    const entityTypes: SignalEntityType[] =
      scope === "all"
        ? ["account", "deal", "contact"]
        : [scope as SignalEntityType];

    console.log(
      `[Toretto Signals] Batch compute — scope: ${scope}, batchSize: ${batchSize}, signalKeys: ${signalKeys?.join(",") || "all"}`
    );

    const result = await computeSignalsBatch(supabase, {
      entityTypes,
      signalKeys,
      batchSize,
      userId,
    });

    return NextResponse.json({
      success: true,
      mode: "batch",
      scope,
      batchSize,
      ...result,
      executedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Toretto Signals] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Computation failed",
      },
      { status: 500 }
    );
  }
}
