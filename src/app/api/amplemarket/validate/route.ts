import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { validateApiKey } from "@/lib/amplemarket/client";

/**
 * POST /api/amplemarket/validate
 *
 * Validate an Amplemarket API key by making a test API call.
 * Used by the integration settings UI to verify the key before storing it.
 */
export async function POST(request: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const apiKey = body.apiKey as string;

    if (!apiKey) {
      return NextResponse.json(
        { valid: false, error: "API key is required" },
        { status: 400 }
      );
    }

    const valid = await validateApiKey(apiKey);

    return NextResponse.json({ valid });
  } catch (err) {
    console.error("[amplemarket-validate] Error:", err);
    return NextResponse.json(
      {
        valid: false,
        error: err instanceof Error ? err.message : "Validation failed",
      },
      { status: 500 }
    );
  }
}
