import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { validateApiKey } from "@/lib/fireflies/client";

/**
 * GET /api/fireflies/status
 *
 * Checks whether Fireflies.ai is properly configured and connected.
 * Verifies:
 *   1. FIREFLIES_API_KEY environment variable exists
 *   2. The key is valid by attempting to fetch from the API
 *
 * Returns: { connected: boolean, error?: string }
 */
export async function GET() {
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.FIREFLIES_API_KEY;

  // Check if API key is configured
  if (!apiKey) {
    return NextResponse.json({
      connected: false,
      error: "FIREFLIES_API_KEY is not configured. Add it to your environment variables.",
    });
  }

  try {
    // Validate the key by hitting the Fireflies API
    const result = await validateApiKey(apiKey);

    if (!result.valid) {
      return NextResponse.json({
        connected: false,
        error: result.error || "Failed to validate Fireflies API key.",
      });
    }

    return NextResponse.json({
      connected: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[fireflies-status] Error:", message);

    return NextResponse.json({
      connected: false,
      error: message,
    });
  }
}
