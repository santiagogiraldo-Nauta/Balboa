import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { createOAuth2Client, GMAIL_SCOPES } from "@/lib/gmail/client";

/**
 * GET /api/gmail/auth
 * Returns the Google OAuth authorization URL.
 * The frontend redirects the user to this URL to start the OAuth flow.
 */
export async function GET() {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Gmail integration not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
      { status: 500 }
    );
  }

  const oauth2Client = createOAuth2Client();
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline", // Required to get refresh_token
    prompt: "consent", // Force consent screen to always return refresh_token
    scope: GMAIL_SCOPES,
    state: user.id, // Carry user ID through OAuth round-trip
  });

  return NextResponse.json({ url: authUrl });
}
