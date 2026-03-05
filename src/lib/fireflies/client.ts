/**
 * Fireflies.ai GraphQL API Client
 *
 * Handles communication with Fireflies.ai's GraphQL API for meeting
 * transcript retrieval. Fireflies records and transcribes meetings
 * so Balboa can match them to leads and extract intel.
 *
 * API Docs: https://docs.fireflies.ai/
 * Endpoint: https://api.fireflies.ai/graphql
 * Auth: Bearer token via API key (Business plan required)
 */

const FIREFLIES_GRAPHQL_URL = "https://api.fireflies.ai/graphql";

// ─── Types ────────────────────────────────────────────────────────

export interface FirefliesSentence {
  text: string;
  speaker_name: string;
  start_time: number;
  end_time: number;
}

export interface FirefliesSummary {
  overview: string | null;
  action_items: string | null;
  keywords: string | null;
}

export interface FirefliesMeetingAttendee {
  displayName: string;
  email: string;
  name: string;
}

export interface FirefliesTranscript {
  id: string;
  title: string;
  date: string;
  dateString: string;
  duration: number;
  participants: string[];
  meeting_attendees: FirefliesMeetingAttendee[];
  sentences: FirefliesSentence[];
  summary: FirefliesSummary | null;
  host_email: string | null;
  organizer_email: string | null;
  transcript_url: string | null;
}

interface GraphQLResponse<T> {
  data: T;
  errors?: Array<{ message: string; locations?: Array<{ line: number; column: number }> }>;
}

// ─── GraphQL Queries ──────────────────────────────────────────────

const TRANSCRIPTS_LIST_QUERY = `
  query Transcripts($limit: Int, $skip: Int) {
    transcripts(limit: $limit, skip: $skip) {
      id
      title
      date
      dateString
      duration
      participants
      meeting_attendees {
        displayName
        email
        name
      }
      sentences {
        text
        speaker_name
        start_time
        end_time
      }
      summary {
        overview
        action_items
        keywords
      }
      host_email
      organizer_email
      transcript_url
    }
  }
`;

const TRANSCRIPT_DETAIL_QUERY = `
  query Transcript($id: String!) {
    transcript(id: $id) {
      id
      title
      date
      dateString
      duration
      participants
      meeting_attendees {
        displayName
        email
        name
      }
      sentences {
        text
        speaker_name
        start_time
        end_time
      }
      summary {
        overview
        action_items
        keywords
      }
      host_email
      organizer_email
      transcript_url
    }
  }
`;

// Lightweight query used only for connection validation
const TRANSCRIPTS_COUNT_QUERY = `
  query TranscriptsCount {
    transcripts(limit: 1) {
      id
      title
    }
  }
`;

// ─── Helpers ──────────────────────────────────────────────────────

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function graphqlRequest<T>(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(FIREFLIES_GRAPHQL_URL, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[fireflies] GraphQL request failed (${res.status}):`, text);

    if (res.status === 401 || res.status === 403) {
      throw new Error("Invalid Fireflies API key or insufficient permissions. Business plan required.");
    }
    if (res.status === 429) {
      throw new Error("Fireflies API rate limit exceeded. Try again later.");
    }
    throw new Error(`Fireflies API error (${res.status}): ${text}`);
  }

  const json: GraphQLResponse<T> = await res.json();

  if (json.errors && json.errors.length > 0) {
    const messages = json.errors.map((e) => e.message).join("; ");
    console.error("[fireflies] GraphQL errors:", messages);
    throw new Error(`Fireflies GraphQL error: ${messages}`);
  }

  return json.data;
}

// ─── API Functions ────────────────────────────────────────────────

/**
 * Fetch a list of recent transcripts from Fireflies.
 * Maximum limit per request is 50 (Fireflies API constraint).
 */
export async function fetchTranscripts(
  apiKey: string,
  limit: number = 50
): Promise<FirefliesTranscript[]> {
  const clampedLimit = Math.min(limit, 50);

  console.log(`[fireflies] Fetching up to ${clampedLimit} transcripts...`);

  const data = await graphqlRequest<{ transcripts: FirefliesTranscript[] }>(
    apiKey,
    TRANSCRIPTS_LIST_QUERY,
    { limit: clampedLimit }
  );

  console.log(`[fireflies] Fetched ${data.transcripts?.length ?? 0} transcripts`);
  return data.transcripts || [];
}

/**
 * Fetch a single transcript by ID with full detail.
 */
export async function fetchTranscript(
  apiKey: string,
  transcriptId: string
): Promise<FirefliesTranscript> {
  console.log(`[fireflies] Fetching transcript ${transcriptId}...`);

  const data = await graphqlRequest<{ transcript: FirefliesTranscript }>(
    apiKey,
    TRANSCRIPT_DETAIL_QUERY,
    { id: transcriptId }
  );

  if (!data.transcript) {
    throw new Error(`Transcript ${transcriptId} not found`);
  }

  return data.transcript;
}

/**
 * Validate a Fireflies API key by attempting to fetch one transcript.
 * Returns the count of transcripts available if successful.
 */
export async function validateApiKey(
  apiKey: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const data = await graphqlRequest<{
      transcripts: Array<{ id: string; title: string }>;
    }>(apiKey, TRANSCRIPTS_COUNT_QUERY);

    return { valid: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { valid: false, error: message };
  }
}
