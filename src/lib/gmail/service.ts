import { google, gmail_v1 } from "googleapis";
import { createOAuth2Client } from "./client";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ──

export interface GmailTokenRow {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  gmail_email: string;
  sync_history_id: string | null;
}

export interface ParsedGmailMessage {
  gmailId: string;
  threadId: string;
  from: string;
  fromEmail: string;
  to: string;
  toEmail: string;
  subject: string;
  snippet: string;
  date: string;
  isRead: boolean;
  direction: "inbound" | "outbound";
}

export interface ParsedGmailThread {
  threadId: string;
  subject: string;
  messages: ParsedGmailMessage[];
  lastMessageDate: string;
  snippet: string;
}

// ── Gmail Client Factory ──

/**
 * Get an authenticated Gmail client for a user.
 * Loads tokens from Supabase, sets up auto-refresh.
 * Returns null if user has no active Gmail connection.
 */
export async function getGmailClient(
  supabase: SupabaseClient,
  userId: string
): Promise<{ gmail: gmail_v1.Gmail; tokenRow: GmailTokenRow } | null> {
  const { data: tokenRow } = await supabase
    .from("gmail_tokens")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  if (!tokenRow) return null;

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokenRow.access_token,
    refresh_token: tokenRow.refresh_token,
    expiry_date: tokenRow.expiry_date,
  });

  // Auto-persist refreshed tokens
  oauth2Client.on("tokens", async (newTokens) => {
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (newTokens.access_token) updates.access_token = newTokens.access_token;
    if (newTokens.expiry_date) updates.expiry_date = newTokens.expiry_date;
    if (newTokens.refresh_token) updates.refresh_token = newTokens.refresh_token;

    await supabase
      .from("gmail_tokens")
      .update(updates)
      .eq("id", tokenRow.id);
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  return { gmail, tokenRow: tokenRow as GmailTokenRow };
}

// ── Fetch Threads ──

/**
 * Fetch recent email threads from Gmail.
 * Uses metadata format (headers + snippet) for speed.
 * Full body is fetched on-demand via /api/gmail/thread.
 */
export async function fetchGmailThreads(
  gmail: gmail_v1.Gmail,
  options: {
    maxResults?: number;
    query?: string;
  } = {}
): Promise<ParsedGmailThread[]> {
  const { maxResults = 200, query = "newer_than:90d" } = options;

  // 1. List thread IDs
  const { data: listData } = await gmail.users.threads.list({
    userId: "me",
    maxResults,
    q: query,
  });

  if (!listData.threads || listData.threads.length === 0) return [];

  // 2. Fetch each thread's metadata in batches of 10
  const threads: ParsedGmailThread[] = [];
  const batchSize = 10;

  for (let i = 0; i < listData.threads.length; i += batchSize) {
    const batch = listData.threads.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (t) => {
        try {
          const { data: thread } = await gmail.users.threads.get({
            userId: "me",
            id: t.id!,
            format: "metadata",
            metadataHeaders: ["From", "To", "Subject", "Date", "Message-ID"],
          });
          return thread;
        } catch {
          return null; // Skip threads that fail to load
        }
      })
    );

    for (const thread of batchResults) {
      if (!thread?.messages) continue;
      threads.push(parseGmailThread(thread));
    }
  }

  return threads;
}

// ── Paginated Fetch ──

export interface PaginatedThreadsResult {
  threads: ParsedGmailThread[];
  nextPageToken?: string;
  totalPages: number;
}

/**
 * Fetch Gmail threads with full pagination support.
 * Loops through multiple pages of gmail.users.threads.list,
 * fetching thread metadata for each page.
 *
 * Designed for deep history sync (6 months).
 * Each page fetches up to `maxResults` thread IDs, then
 * resolves their metadata in batches of 10.
 */
export async function fetchGmailThreadsPaginated(
  gmail: gmail_v1.Gmail,
  options: {
    maxResults?: number;
    query?: string;
    maxPages?: number;
    startPageToken?: string;
  } = {}
): Promise<PaginatedThreadsResult> {
  const {
    maxResults = 100,
    query = "newer_than:180d",
    maxPages = 5,
    startPageToken,
  } = options;

  const allThreads: ParsedGmailThread[] = [];
  let pageToken: string | undefined = startPageToken;
  let pagesProcessed = 0;

  while (pagesProcessed < maxPages) {
    // List thread IDs for this page
    const { data: listData } = await gmail.users.threads.list({
      userId: "me",
      maxResults,
      q: query,
      ...(pageToken ? { pageToken } : {}),
    });

    if (!listData.threads || listData.threads.length === 0) break;

    // Fetch metadata for each thread in batches of 10
    const batchSize = 10;
    for (let i = 0; i < listData.threads.length; i += batchSize) {
      const batch = listData.threads.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (t) => {
          try {
            const { data: thread } = await gmail.users.threads.get({
              userId: "me",
              id: t.id!,
              format: "metadata",
              metadataHeaders: ["From", "To", "Subject", "Date", "Message-ID"],
            });
            return thread;
          } catch {
            return null;
          }
        })
      );

      for (const thread of batchResults) {
        if (!thread?.messages) continue;
        allThreads.push(parseGmailThread(thread));
      }
    }

    pagesProcessed++;
    pageToken = listData.nextPageToken || undefined;

    // No more pages available
    if (!pageToken) break;
  }

  return {
    threads: allThreads,
    nextPageToken: pageToken,
    totalPages: pagesProcessed,
  };
}

// ── Fetch Full Thread Body ──

/**
 * Fetch full message bodies for a single thread.
 * Called on-demand when user opens a conversation.
 */
export async function fetchGmailThreadFull(
  gmail: gmail_v1.Gmail,
  threadId: string
): Promise<{ id: string; from: string; to: string; subject: string; date: string; body: string; snippet: string }[]> {
  const { data: thread } = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });

  return (thread.messages || []).map((msg) => {
    const headers = msg.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

    return {
      id: msg.id || "",
      from: getHeader("From"),
      to: getHeader("To"),
      subject: getHeader("Subject"),
      date: getHeader("Date"),
      body: extractBody(msg),
      snippet: msg.snippet || "",
    };
  });
}

// ── Helpers ──

function parseGmailThread(thread: gmail_v1.Schema$Thread): ParsedGmailThread {
  const messages = (thread.messages || []).map((msg) => {
    const headers = msg.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

    const from = getHeader("From");
    const to = getHeader("To");
    const subject = getHeader("Subject");
    const dateStr = getHeader("Date");

    let date: string;
    try {
      date = dateStr
        ? new Date(dateStr).toISOString()
        : msg.internalDate
          ? new Date(parseInt(msg.internalDate)).toISOString()
          : new Date().toISOString();
    } catch {
      date = new Date().toISOString();
    }

    return {
      gmailId: msg.id || "",
      threadId: msg.threadId || "",
      from,
      fromEmail: extractEmail(from),
      to,
      toEmail: extractEmail(to),
      subject,
      snippet: msg.snippet || "",
      date,
      isRead: !msg.labelIds?.includes("UNREAD"),
      direction: "inbound" as const, // Corrected during lead matching
    };
  });

  const lastMsg = messages[messages.length - 1];
  return {
    threadId: thread.id || "",
    subject: messages[0]?.subject || "(no subject)",
    messages,
    lastMessageDate: lastMsg?.date || new Date().toISOString(),
    snippet: thread.snippet || "",
  };
}

function extractEmail(headerValue: string): string {
  const match = headerValue.match(/<([^>]+)>/);
  return match ? match[1].toLowerCase() : headerValue.toLowerCase().trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBody(message: any): string {
  const parts = message.payload?.parts || [];

  // Try text/plain first
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64").toString("utf-8");
    }
  }
  // Fall back to text/html stripped of tags
  for (const part of parts) {
    if (part.mimeType === "text/html" && part.body?.data) {
      const html = Buffer.from(part.body.data, "base64").toString("utf-8");
      return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    }
  }
  // Check for nested multipart parts
  for (const part of parts) {
    if (part.parts) {
      for (const subpart of part.parts) {
        if (subpart.mimeType === "text/plain" && subpart.body?.data) {
          return Buffer.from(subpart.body.data, "base64").toString("utf-8");
        }
      }
    }
  }
  // Single-part message
  if (message.payload?.body?.data) {
    return Buffer.from(message.payload.body.data, "base64").toString("utf-8");
  }

  return message.snippet || "";
}
