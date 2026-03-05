import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { createClient } from "@/lib/supabase/server";
import { createOAuth2Client } from "@/lib/gmail/client";

/**
 * POST /api/gmail/watch
 *
 * Registers a Gmail push notification watch using Google Cloud Pub/Sub.
 * This makes Gmail send real-time notifications to our webhook endpoint
 * whenever new emails arrive.
 *
 * Prerequisites:
 * 1. Google Cloud project with Pub/Sub API enabled
 * 2. Pub/Sub topic created: projects/{PROJECT_ID}/topics/gmail-notifications
 * 3. Grant gmail-api-push@system.gserviceaccount.com publish permission on the topic
 * 4. Create push subscription pointing to: https://balboa-xi.vercel.app/api/webhooks/gmail-push
 *
 * The watch expires after ~7 days and must be renewed.
 * Use the n8n cron to call this endpoint every 6 days.
 */
export async function POST() {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const topicName = process.env.GMAIL_PUBSUB_TOPIC;
  if (!topicName) {
    return NextResponse.json(
      {
        error: "Gmail Pub/Sub not configured",
        setup: {
          step1: "Create a Google Cloud Pub/Sub topic",
          step2: "Set GMAIL_PUBSUB_TOPIC env var to: projects/YOUR_PROJECT/topics/gmail-notifications",
          step3: "Grant gmail-api-push@system.gserviceaccount.com publish access to the topic",
          step4: "Create a push subscription pointing to: https://balboa-xi.vercel.app/api/webhooks/gmail-push",
        },
      },
      { status: 503 }
    );
  }

  const supabase = await createClient();

  // Get stored Gmail tokens
  const { data: tokenRow } = await supabase
    .from("gmail_tokens")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!tokenRow) {
    return NextResponse.json(
      { error: "Gmail not connected. Connect Gmail first." },
      { status: 400 }
    );
  }

  try {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: tokenRow.access_token,
      refresh_token: tokenRow.refresh_token,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Register the watch
    const watchResponse = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName,
        labelIds: ["INBOX"],
      },
    });

    const historyId = watchResponse.data.historyId;
    const expiration = watchResponse.data.expiration;

    // Store the history ID and watch expiration
    await supabase
      .from("gmail_tokens")
      .update({
        last_history_id: historyId,
        watch_expiration: expiration ? new Date(parseInt(expiration)).toISOString() : null,
      })
      .eq("user_id", user.id);

    console.log(`[Gmail Watch] Registered for user ${user.id}, historyId: ${historyId}, expires: ${expiration}`);

    return NextResponse.json({
      success: true,
      historyId,
      expiration: expiration ? new Date(parseInt(expiration)).toISOString() : null,
      message: "Gmail push notifications enabled. Webhook will receive real-time email events.",
    });
  } catch (watchError) {
    console.error("[Gmail Watch] Error:", watchError);
    return NextResponse.json(
      { error: watchError instanceof Error ? watchError.message : "Watch registration failed" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/gmail/watch
 *
 * Stops the Gmail push notification watch.
 */
export async function DELETE() {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  const { data: tokenRow } = await supabase
    .from("gmail_tokens")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!tokenRow) {
    return NextResponse.json({ error: "Gmail not connected" }, { status: 400 });
  }

  try {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: tokenRow.access_token,
      refresh_token: tokenRow.refresh_token,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    await gmail.users.stop({ userId: "me" });

    // Clear watch expiration
    await supabase
      .from("gmail_tokens")
      .update({ watch_expiration: null })
      .eq("user_id", user.id);

    return NextResponse.json({ success: true, message: "Gmail push notifications stopped" });
  } catch (stopError) {
    console.error("[Gmail Watch] Stop error:", stopError);
    return NextResponse.json(
      { error: stopError instanceof Error ? stopError.message : "Stop failed" },
      { status: 500 }
    );
  }
}
