import { google } from "googleapis";

/**
 * Create a Google OAuth2 client configured with our app credentials.
 * Used for both the OAuth flow and authenticated Gmail API calls.
 */
export function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

/** Gmail scopes — read-only to start, send can be added later */
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];
