import { google } from "googleapis";

/**
 * Create a Google OAuth2 client configured with our app credentials.
 * Used for both the OAuth flow and authenticated Gmail API calls.
 * Redirect URI: uses GOOGLE_REDIRECT_URI if set, otherwise derives from NEXT_PUBLIC_APP_URL.
 */
export function createOAuth2Client() {
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/gmail/callback`;
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

/** Gmail scopes — read + send + user identity */
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];
