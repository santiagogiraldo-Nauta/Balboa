import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { getSequences } from "@/lib/db-sequences";

/**
 * GET /api/sequences
 *
 * Returns all sequences for the authenticated user.
 * Includes sequences from all sources (Amplemarket, HubSpot, Rocket).
 */
export async function GET() {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  try {
    const sequences = await getSequences(supabase, user.id);

    return NextResponse.json({
      sequences,
      total: sequences.length,
    });
  } catch (err) {
    console.error("[Sequences API] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch sequences" },
      { status: 500 }
    );
  }
}
