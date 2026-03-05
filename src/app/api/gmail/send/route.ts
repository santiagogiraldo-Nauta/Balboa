import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { getGmailClient } from "@/lib/gmail/service";
import { sendGmailMessage } from "@/lib/gmail/send";

/**
 * Deterministic UUID from a string — same logic as persist.ts
 * so that IDs are consistent across sync and send paths.
 */
function toUuid(input: string): string {
  const hash = createHash("sha256").update(input).digest("hex");
  const v = "5";
  const variantNibble = ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    v + hash.slice(13, 16),
    variantNibble + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join("-");
}

/**
 * POST /api/gmail/send
 *
 * Send an email via the user's connected Gmail account.
 *
 * Body:
 *   to        — recipient email address (required)
 *   subject   — email subject line (required)
 *   body      — HTML email body (required)
 *   threadId  — Gmail thread ID for replies (optional)
 *   inReplyTo — Message-ID header of the message being replied to (optional)
 */
export async function POST(req: NextRequest) {
  const { user, supabase, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Validate body ──
  const { to, subject, body, threadId, inReplyTo } = await req.json();

  if (!to || !subject || !body) {
    return NextResponse.json(
      { error: "Missing required fields: to, subject, body" },
      { status: 400 }
    );
  }

  // ── Get authenticated Gmail client ──
  const gmailResult = await getGmailClient(supabase, user.id);
  if (!gmailResult) {
    return NextResponse.json(
      { error: "Gmail not connected. Please connect your Gmail account first." },
      { status: 400 }
    );
  }

  const { gmail, tokenRow } = gmailResult;

  try {
    // ── Send the message ──
    const result = await sendGmailMessage(gmail, {
      to,
      from: tokenRow.gmail_email,
      subject,
      body,
      threadId,
      inReplyTo,
    });

    // ── Persist the sent message to the messages table ──
    const now = new Date().toISOString();
    const msgUuid = toUuid(`msg-${user.id}-${result.messageId}`);
    const convUuid = toUuid(`conv-${user.id}-gmail-${result.threadId}`);

    const messageRecord = {
      id: msgUuid,
      user_id: user.id,
      lead_id: null, // Caller (send-outreach) will handle lead association
      thread_id: convUuid,
      channel: "email",
      direction: "outbound",
      subject: subject || null,
      body: body || "",
      status: "delivered",
      sender: tokenRow.gmail_email,
      recipient: to,
      attachments: [],
      metadata: {
        source: "gmail",
        gmail_thread_id: result.threadId,
        gmail_message_id: result.messageId,
        sent_via: "api",
      },
      has_unsubscribe: false,
      has_physical_address: false,
      compliance_checked: false,
      sent_at: now,
      created_at: now,
      updated_at: now,
    };

    const { error: insertError } = await supabase
      .from("messages")
      .upsert(messageRecord, { onConflict: "id" });

    if (insertError) {
      // Log but don't fail the request — the email was already sent
      console.error("[gmail-send] Failed to persist message:", insertError);
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      threadId: result.threadId,
    });
  } catch (err: unknown) {
    console.error("[gmail-send] Error:", err);

    const error = err as { code?: number; status?: number; message?: string };

    // Handle insufficient scope (user connected with read-only before send scope was added)
    if (
      error.code === 403 ||
      error.status === 403 ||
      error.message?.includes("Insufficient Permission") ||
      error.message?.includes("insufficient")
    ) {
      return NextResponse.json(
        { error: "gmail_scope_missing" },
        { status: 403 }
      );
    }

    // Handle token revocation / expiration
    if (error.code === 401 || error.message?.includes("invalid_grant")) {
      await supabase
        .from("gmail_tokens")
        .update({ is_active: false })
        .eq("id", tokenRow.id);

      return NextResponse.json(
        { error: "Gmail access was revoked. Please reconnect." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to send email", details: error.message },
      { status: 500 }
    );
  }
}
