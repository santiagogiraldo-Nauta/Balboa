import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { classifyReply } from "@/lib/fire/reply-classifier";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * POST /api/fire/classify
 * Manually classify a reply (for testing the classifier).
 *
 * Body: { userId, leadId?, subject, bodyPreview }
 */
export async function POST(req: NextRequest) {
  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service not configured" }, { status: 503 });
  }

  const body = await req.json();
  const { userId, leadId, subject, bodyPreview } = body;

  if (!userId || !bodyPreview) {
    return NextResponse.json(
      { error: "userId and bodyPreview are required" },
      { status: 400 }
    );
  }

  const result = await classifyReply(supabase, {
    userId,
    leadId,
    subject: subject || "",
    bodyPreview,
  });

  if (!result) {
    return NextResponse.json({ error: "Classification failed" }, { status: 500 });
  }

  return NextResponse.json({ classification: result });
}
