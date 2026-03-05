/**
 * Amplemarket Calls API Client
 *
 * Handles fetching call data, recordings, and transcriptions from Amplemarket.
 * Used by the /api/amplemarket/calls endpoint to pull call intelligence
 * and match it to Balboa leads.
 */

const AMPLEMARKET_BASE_URL = "https://api.amplemarket.com";

// ─── Types ────────────────────────────────────────────────────────

export interface AmplemarketCall {
  id: string;
  contact_email?: string;
  contact_name?: string;
  contact_phone?: string;
  direction: "inbound" | "outbound";
  status: "completed" | "missed" | "no_answer" | "voicemail" | "busy";
  duration: number; // seconds
  started_at: string;
  ended_at?: string;
  user_id?: string;
  user_name?: string;
  notes?: string;
  outcome?: string;
  recording_url?: string;
  transcription?: string;
}

export interface AmplemarketCallRecording {
  transcription?: string;
  duration: number;
  recording_url?: string;
}

interface CallsListResponse {
  calls: AmplemarketCall[];
  _pagination?: {
    current_page: number;
    page_size: number;
    total_count: number;
  };
}

interface CallRecordingResponse {
  transcription?: string;
  duration?: number;
  recording_url?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function fetchWithRetry(
  url: string,
  apiKey: string,
  retries = 2
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: headers(apiKey) });

    if (res.status === 401) {
      throw new Error("Invalid Amplemarket API key");
    }

    if (res.status === 429) {
      // Rate limited: wait and retry
      const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
      const waitMs = Math.min(retryAfter * 1000, 10000);
      console.warn(
        `[amplemarket-calls] Rate limited, waiting ${waitMs}ms (attempt ${attempt + 1}/${retries + 1})`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      lastError = new Error(
        `Amplemarket API error (${res.status}): ${text || res.statusText}`
      );
      if (attempt < retries) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (attempt + 1))
        );
        continue;
      }
      throw lastError;
    }

    return res;
  }

  throw lastError || new Error("Failed after retries");
}

// ─── API Functions ───────────────────────────────────────────────

/**
 * Fetch calls from Amplemarket with optional filters.
 *
 * @param apiKey - Amplemarket API key
 * @param options.userId - Filter calls by Amplemarket user ID
 * @param options.startDate - ISO date string, only return calls after this date
 */
export async function fetchAmplemarketCalls(
  apiKey: string,
  options?: { userId?: string; startDate?: string }
): Promise<AmplemarketCall[]> {
  const allCalls: AmplemarketCall[] = [];
  let page = 1;
  const pageSize = 100;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });

    if (options?.userId) {
      params.set("user_id", options.userId);
    }

    if (options?.startDate) {
      params.set("start_date", options.startDate);
    }

    const url = `${AMPLEMARKET_BASE_URL}/api/v1/calls?${params.toString()}`;

    try {
      const res = await fetchWithRetry(url, apiKey);
      const data: CallsListResponse = await res.json();

      if (data.calls && data.calls.length > 0) {
        allCalls.push(...data.calls);
      }

      // Check pagination
      if (
        data._pagination &&
        data._pagination.current_page * data._pagination.page_size <
          data._pagination.total_count
      ) {
        page++;
      } else {
        hasMore = false;
      }

      // Safety: stop after 10 pages (1000 calls max per sync)
      if (page > 10) {
        console.warn(
          `[amplemarket-calls] Stopping pagination at page ${page} (${allCalls.length} calls)`
        );
        hasMore = false;
      }
    } catch (err) {
      console.error(`[amplemarket-calls] Failed to fetch page ${page}:`, err);
      hasMore = false;
    }
  }

  return allCalls;
}

/**
 * Fetch recording and transcription for a specific call.
 *
 * @param apiKey - Amplemarket API key
 * @param callId - The ID of the call
 */
export async function fetchCallRecording(
  apiKey: string,
  callId: string
): Promise<AmplemarketCallRecording> {
  const url = `${AMPLEMARKET_BASE_URL}/api/v1/calls/${callId}/recording`;

  try {
    const res = await fetchWithRetry(url, apiKey);
    const data: CallRecordingResponse = await res.json();

    return {
      transcription: data.transcription || undefined,
      duration: data.duration || 0,
      recording_url: data.recording_url || undefined,
    };
  } catch (err) {
    console.error(
      `[amplemarket-calls] Failed to fetch recording for call ${callId}:`,
      err
    );
    return { duration: 0 };
  }
}
