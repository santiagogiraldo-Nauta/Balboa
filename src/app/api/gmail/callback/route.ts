import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createOAuth2Client } from "@/lib/gmail/client";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/gmail/callback
 * Google redirects here after the user grants (or denies) permission.
 * Exchanges the authorization code for tokens and stores them in Supabase.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state"); // user_id
  const error = request.nextUrl.searchParams.get("error");

  const baseUrl = request.nextUrl.origin;

  if (error) {
    return NextResponse.redirect(
      new URL(`/?section=settings&gmail=error&reason=${error}`, baseUrl)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/?section=settings&gmail=error&reason=missing_params", baseUrl)
    );
  }

  try {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    // Get the connected Gmail email address
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();
    const gmailEmail = userInfo.email || "";

    // Store tokens in Supabase
    const supabase = await createClient();

    // Deactivate any existing active token for this user
    await supabase
      .from("gmail_tokens")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("user_id", state)
      .eq("is_active", true);

    // Insert new token
    const { error: insertError } = await supabase.from("gmail_tokens").insert({
      user_id: state,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type || "Bearer",
      expiry_date: tokens.expiry_date,
      scope: tokens.scope,
      gmail_email: gmailEmail,
      is_active: true,
    });

    if (insertError) {
      console.error("Failed to store Gmail tokens:", insertError);
      return NextResponse.redirect(
        new URL("/?section=settings&gmail=error&reason=db_error", baseUrl)
      );
    }

    // Redirect back to settings with success
    return NextResponse.redirect(
      new URL("/?section=settings&gmail=connected", baseUrl)
    );
  } catch (err) {
    console.error("Gmail OAuth callback error:", err);
    return NextResponse.redirect(
      new URL("/?section=settings&gmail=error&reason=token_exchange_failed", baseUrl)
    );
  }
}
