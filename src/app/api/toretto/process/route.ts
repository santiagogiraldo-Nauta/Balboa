import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processBatch } from "@/lib/toretto/resolver";

/**
 * POST /api/toretto/process
 *
 * Batch processor for Toretto raw events.
 * Claims pending raw_events, resolves identities, creates interactions.
 *
 * Called by cron (n8n, Vercel cron, or manual trigger).
 * Auth: service role key as `secret` in body, or x-internal header.
 *
 * Body (optional):
 *   { secret: string, batchSize?: number }
 *
 * Default batchSize: 50
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

  const batchSize = Math.min(Math.max(Number(body.batchSize) || 50, 1), 200);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    const result = await processBatch(supabase, batchSize);

    console.log(
      `[Toretto Process] Batch complete: ${result.succeeded}/${result.processed} succeeded, ${result.failed} failed`
    );

    return NextResponse.json({
      success: true,
      ...result,
      executedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Toretto Process] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Processing failed" },
      { status: 500 }
    );
  }
}
