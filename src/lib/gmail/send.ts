import { gmail_v1 } from "googleapis";

/**
 * Build an RFC 2822 email, base64url-encode it, and send via the Gmail API.
 *
 * Supports threading: when `threadId` and `inReplyTo` are provided the
 * In-Reply-To and References headers are set so Gmail groups the message
 * into the existing thread.
 */
export async function sendGmailMessage(
  gmail: gmail_v1.Gmail,
  params: {
    to: string;
    from: string;
    subject: string;
    body: string;
    threadId?: string;
    inReplyTo?: string;
  }
): Promise<{ messageId: string; threadId: string }> {
  const { to, from, subject, body, threadId, inReplyTo } = params;

  // ── Build RFC 2822 headers ──
  const headers: string[] = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset="UTF-8"`,
  ];

  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`);
    headers.push(`References: ${inReplyTo}`);
  }

  // RFC 2822: headers separated by CRLF, blank line before body
  const rawMessage = headers.join("\r\n") + "\r\n\r\n" + body;

  // Gmail API expects base64url encoding (no padding)
  const encoded = Buffer.from(rawMessage, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  // ── Send via Gmail API ──
  const { data } = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encoded,
      ...(threadId ? { threadId } : {}),
    },
  });

  if (!data.id || !data.threadId) {
    throw new Error("Gmail API returned an incomplete response (missing id or threadId)");
  }

  return {
    messageId: data.id,
    threadId: data.threadId,
  };
}
