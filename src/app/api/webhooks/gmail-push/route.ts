import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processWebhookEvent, findLeadByEmail } from "@/lib/track-touchpoint";
import { logWebhook } from "@/lib/db-touchpoints";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * POST /api/webhooks/gmail-push
 *
 * Google Cloud Pub/Sub push notification receiver.
 * Replaces polling-based Gmail sync with real-time push notifications.
 *
 * When Gmail detects a new message/label change, it publishes to our
 * Pub/Sub topic, which POSTs here with the notification.
 *
 * Payload structure:
 * {
 *   message: {
 *     data: base64-encoded JSON { emailAddress, historyId },
 *     messageId: string,
 *     publishTime: string
 *   },
 *   subscription: string
 * }
 */
export async function POST(req: NextRequest) {
  const supabase = getServiceClient();

  try {
    const payload = await req.json();

    // Decode the Pub/Sub message
    const message = payload.message;
    if (!message?.data) {
      return NextResponse.json({ error: "Missing message data" }, { status: 400 });
    }

    const decodedData = JSON.parse(
      Buffer.from(message.data, "base64").toString("utf-8")
    );

    const emailAddress = decodedData.emailAddress;
    const historyId = decodedData.historyId;

    console.log(`[Gmail Push] Notification for ${emailAddress}, historyId: ${historyId}`);

    // Find the Gmail token for this email address
    const { data: tokenRow } = await supabase
      .from("gmail_tokens")
      .select("*")
      .eq("email", emailAddress)
      .single();

    if (!tokenRow) {
      console.warn(`[Gmail Push] No token found for ${emailAddress}`);
      await logWebhook(supabase, "gmail-push", "notification", payload, false, "No token found");
      // Return 200 so Pub/Sub doesn't retry
      return NextResponse.json({ received: true, processed: false });
    }

    const userId = tokenRow.user_id;

    // Use the history API to get changes since last known historyId
    const lastHistoryId = tokenRow.last_history_id || historyId;

    try {
      // Refresh token if needed
      const accessToken = await refreshGmailToken(tokenRow);

      // Fetch history changes
      const historyResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${lastHistoryId}&historyTypes=messageAdded`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        const histories = historyData.history || [];

        let newMessages = 0;

        for (const history of histories) {
          const messagesAdded = history.messagesAdded || [];

          for (const msgInfo of messagesAdded) {
            const msgId = msgInfo.message?.id;
            if (!msgId) continue;

            // Fetch the message details
            const msgResponse = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`,
              {
                headers: { Authorization: `Bearer ${accessToken}` },
              }
            );

            if (!msgResponse.ok) continue;

            const msgData = await msgResponse.json();
            const headers = msgData.payload?.headers || [];

            const from = headers.find((h: { name: string }) => h.name === "From")?.value || "";
            const to = headers.find((h: { name: string }) => h.name === "To")?.value || "";
            const subject = headers.find((h: { name: string }) => h.name === "Subject")?.value || "";

            // Determine direction
            const isInbound = !from.includes(emailAddress);
            const otherEmail = isInbound
              ? extractEmail(from)
              : extractEmail(to);

            // Find the lead
            let leadId: string | undefined;
            if (otherEmail) {
              const lead = await findLeadByEmail(supabase, otherEmail);
              if (lead) leadId = lead.id;
            }

            // Track the touchpoint
            await processWebhookEvent(supabase, "gmail-push", "new_message", {
              messageId: msgId,
              from,
              to,
              subject,
            }, {
              userId,
              leadId,
              source: "gmail",
              channel: "email",
              eventType: isInbound ? "replied" : "sent",
              direction: isInbound ? "inbound" : "outbound",
              subject,
              metadata: {
                gmail_message_id: msgId,
                gmail_thread_id: msgData.threadId,
                from,
                to,
              },
            });

            newMessages++;
          }
        }

        // Update last history ID
        if (historyData.historyId) {
          await supabase
            .from("gmail_tokens")
            .update({ last_history_id: historyData.historyId })
            .eq("email", emailAddress);
        }

        console.log(`[Gmail Push] Processed ${newMessages} new messages for ${emailAddress}`);
      } else {
        const errorText = await historyResponse.text();
        console.error(`[Gmail Push] History API error:`, errorText);

        // If history is too old, just update the historyId
        if (historyResponse.status === 404) {
          await supabase
            .from("gmail_tokens")
            .update({ last_history_id: historyId })
            .eq("email", emailAddress);
        }
      }
    } catch (gmailError) {
      console.error("[Gmail Push] Error processing Gmail:", gmailError);
      await logWebhook(supabase, "gmail-push", "error", payload, false, String(gmailError));
    }

    return NextResponse.json({ received: true, processed: true });
  } catch (error) {
    console.error("[Gmail Push] Error:", error);
    // Return 200 to prevent Pub/Sub from retrying on parse errors
    return NextResponse.json({ received: true, error: "Parse error" });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function extractEmail(headerValue: string): string | null {
  const match = headerValue.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase();
  if (headerValue.includes("@")) return headerValue.trim().toLowerCase();
  return null;
}

async function refreshGmailToken(tokenRow: Record<string, unknown>): Promise<string> {
  const accessToken = tokenRow.access_token as string;
  const refreshToken = tokenRow.refresh_token as string;
  const expiresAt = tokenRow.expires_at as number;

  // Check if token is still valid (with 5-minute buffer)
  if (expiresAt && Date.now() < (expiresAt - 300) * 1000) {
    return accessToken;
  }

  // Refresh the token
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh Gmail token");
  }

  const data = await response.json();

  // Update the stored token
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  await supabase
    .from("gmail_tokens")
    .update({
      access_token: data.access_token,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    })
    .eq("id", tokenRow.id);

  return data.access_token;
}
