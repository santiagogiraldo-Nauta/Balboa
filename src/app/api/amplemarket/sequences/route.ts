import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";

const AMPLEMARKET_BASE_URL = "https://api.amplemarket.com";

// ─── Types ────────────────────────────────────────────────────────

interface AmplemarketSequence {
  id: string;
  name: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  steps_count?: number;
  enrolled_count?: number;
  completed_count?: number;
  replied_count?: number;
  bounced_count?: number;
  steps?: Array<{
    id: string;
    step_number: number;
    channel: string;
    delay_days: number;
    subject?: string;
    body?: string;
  }>;
}

interface SequencesResponse {
  sequences: AmplemarketSequence[];
  _pagination?: {
    current_page: number;
    page_size: number;
    total_count: number;
  };
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
      const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
      const waitMs = Math.min(retryAfter * 1000, 10000);
      console.warn(
        `[amplemarket-sequences] Rate limited, waiting ${waitMs}ms (attempt ${attempt + 1}/${retries + 1})`
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

// ─── Route ───────────────────────────────────────────────────────

/**
 * GET /api/amplemarket/sequences
 *
 * Fetches all sequences from Amplemarket and returns them with
 * summary stats. This data can be used to show which sequences
 * exist and their enrollment/completion counts.
 *
 * Query params:
 *   status — Filter by sequence status ("active", "paused", "draft", etc.)
 *   includeSteps — "true" to include step details per sequence
 *
 * Returns: { sequences: [...], total: count }
 */
export async function GET(request: Request) {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.AMPLEMARKET_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Amplemarket is not configured. Set AMPLEMARKET_API_KEY." },
      { status: 500 }
    );
  }

  try {
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status") || undefined;
    const includeSteps = url.searchParams.get("includeSteps") === "true";

    // 1. Fetch all sequences (paginated)
    console.log("[amplemarket-sequences] Fetching sequences...");
    const allSequences: AmplemarketSequence[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "100",
      });

      if (statusFilter) {
        params.set("status", statusFilter);
      }

      const fetchUrl = `${AMPLEMARKET_BASE_URL}/api/v1/sequences?${params.toString()}`;
      const res = await fetchWithRetry(fetchUrl, apiKey);
      const data: SequencesResponse = await res.json();

      if (data.sequences && data.sequences.length > 0) {
        allSequences.push(...data.sequences);
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

      // Safety: cap at 5 pages (500 sequences max)
      if (page > 5) {
        hasMore = false;
      }

      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    console.log(
      `[amplemarket-sequences] Fetched ${allSequences.length} sequences`
    );

    // 2. Format the response
    const formattedSequences = allSequences.map((seq) => ({
      id: seq.id,
      name: seq.name,
      status: seq.status,
      stepsCount: seq.steps_count || seq.steps?.length || 0,
      enrolledCount: seq.enrolled_count || 0,
      completedCount: seq.completed_count || 0,
      repliedCount: seq.replied_count || 0,
      bouncedCount: seq.bounced_count || 0,
      createdAt: seq.created_at,
      updatedAt: seq.updated_at,
      ...(includeSteps &&
        seq.steps && {
          steps: seq.steps.map((step) => ({
            id: step.id,
            stepNumber: step.step_number,
            channel: step.channel,
            delayDays: step.delay_days,
            subject: step.subject,
            body: step.body,
          })),
        }),
    }));

    // 3. Compute summary stats
    const activeCount = formattedSequences.filter(
      (s) => s.status === "active"
    ).length;
    const totalEnrolled = formattedSequences.reduce(
      (sum, s) => sum + s.enrolledCount,
      0
    );
    const totalCompleted = formattedSequences.reduce(
      (sum, s) => sum + s.completedCount,
      0
    );
    const totalReplied = formattedSequences.reduce(
      (sum, s) => sum + s.repliedCount,
      0
    );

    return NextResponse.json({
      sequences: formattedSequences,
      total: formattedSequences.length,
      summary: {
        active: activeCount,
        totalEnrolled,
        totalCompleted,
        totalReplied,
        completionRate:
          totalEnrolled > 0
            ? Math.round((totalCompleted / totalEnrolled) * 100)
            : 0,
        replyRate:
          totalEnrolled > 0
            ? Math.round((totalReplied / totalEnrolled) * 100)
            : 0,
      },
    });
  } catch (err) {
    console.error("[amplemarket-sequences] Error:", err);

    const message =
      err instanceof Error ? err.message : "Failed to fetch sequences";

    if (message.includes("Invalid Amplemarket API key")) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    if (message.includes("rate limit") || message.includes("Rate limit")) {
      return NextResponse.json({ error: message }, { status: 429 });
    }

    return NextResponse.json(
      { error: message, details: String(err) },
      { status: 500 }
    );
  }
}
