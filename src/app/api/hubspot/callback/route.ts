import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCode } from "@/lib/hubspot";
import { upsertIntegrationConfig } from "@/lib/db-integrations";

/**
 * GET /api/hubspot/callback
 *
 * HubSpot OAuth callback.
 * Exchanges auth code for tokens and stores in integration_configs.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // userId

  if (!code || !state) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || ""}/?error=hubspot_auth_failed`
    );
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://balboa-xi.vercel.app";
    const redirectUri = `${baseUrl}/api/hubspot/callback`;

    const tokens = await exchangeCode(code, redirectUri);

    const supabase = await createClient();

    await upsertIntegrationConfig(supabase, state, "hubspot", {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
      connected_at: new Date().toISOString(),
    }, "connected");

    console.log("[HubSpot] OAuth completed for user:", state);

    return NextResponse.redirect(
      `${baseUrl}/?hubspot=connected`
    );
  } catch (error) {
    console.error("[HubSpot] OAuth callback error:", error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || ""}/?error=hubspot_auth_failed`
    );
  }
}
