import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { getOAuthUrl } from "@/lib/hubspot";

/**
 * GET /api/hubspot/auth
 *
 * Initiates HubSpot OAuth flow.
 * Redirects user to HubSpot authorization page.
 */
export async function GET() {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://balboa-xi.vercel.app";
  const redirectUri = `${baseUrl}/api/hubspot/callback`;

  const authUrl = getOAuthUrl(redirectUri, user.id);

  return NextResponse.redirect(authUrl);
}
