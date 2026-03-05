import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import {
  fetchAmplemarketCalls,
  fetchCallRecording,
  type AmplemarketCall,
} from "@/lib/amplemarket/calls";

// ─── Types ────────────────────────────────────────────────────────

interface CallWithTranscription extends AmplemarketCall {
  matched_lead_id?: string;
  matched_lead_name?: string;
  recording?: {
    transcription?: string;
    duration: number;
    recording_url?: string;
  };
}

// ─── Route ───────────────────────────────────────────────────────

/**
 * GET /api/amplemarket/calls
 *
 * Fetches call data from Amplemarket and matches calls to Balboa leads
 * by phone number or contact email. Optionally fetches transcriptions.
 *
 * Query params:
 *   startDate — ISO date string, only return calls after this date
 *   userId — Filter by Amplemarket user ID
 *   includeTranscriptions — "true" to fetch recording/transcription per call (slower)
 *   limit — Max calls to return (default: 100)
 */
export async function GET(request: NextRequest) {
  const { user, supabase, error } = await getAuthUser();
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
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get("startDate") || undefined;
    const userId = searchParams.get("userId") || undefined;
    const includeTranscriptions =
      searchParams.get("includeTranscriptions") === "true";
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    // 1. Fetch calls from Amplemarket
    console.log("[amplemarket-calls] Fetching calls...");
    const calls = await fetchAmplemarketCalls(apiKey, { userId, startDate });

    console.log(
      `[amplemarket-calls] Fetched ${calls.length} calls from Amplemarket`
    );

    // 2. Trim to limit
    const trimmedCalls = calls.slice(0, limit);

    // 3. Fetch all leads for matching (email + phone)
    const { data: leadsData, error: leadsError } = await supabase
      .from("leads")
      .select("id, first_name, last_name, email, phone, raw_data")
      .eq("user_id", user.id);

    if (leadsError) {
      console.error(
        "[amplemarket-calls] Failed to fetch leads for matching:",
        leadsError
      );
    }

    // Build lookup maps
    const leadByEmail = new Map<
      string,
      { id: string; name: string }
    >();
    const leadByPhone = new Map<
      string,
      { id: string; name: string }
    >();

    for (const lead of leadsData || []) {
      const name = `${lead.first_name || ""} ${lead.last_name || ""}`.trim();
      if (lead.email) {
        leadByEmail.set(lead.email.toLowerCase().trim(), {
          id: lead.id,
          name,
        });
      }
      // Check phone in dedicated column
      if (lead.phone) {
        const normalizedPhone = normalizePhone(lead.phone as string);
        if (normalizedPhone) {
          leadByPhone.set(normalizedPhone, { id: lead.id, name });
        }
      }
      // Also check phone in raw_data
      const rawData = lead.raw_data as Record<string, unknown> | null;
      if (rawData?.phone) {
        const normalizedPhone = normalizePhone(rawData.phone as string);
        if (normalizedPhone) {
          leadByPhone.set(normalizedPhone, { id: lead.id, name });
        }
      }
    }

    // 4. Match calls to leads and optionally fetch transcriptions
    const enrichedCalls: CallWithTranscription[] = [];

    for (const call of trimmedCalls) {
      const enriched: CallWithTranscription = { ...call };

      // Match by email
      if (call.contact_email) {
        const match = leadByEmail.get(
          call.contact_email.toLowerCase().trim()
        );
        if (match) {
          enriched.matched_lead_id = match.id;
          enriched.matched_lead_name = match.name;
        }
      }

      // Match by phone (if not already matched by email)
      if (!enriched.matched_lead_id && call.contact_phone) {
        const normalized = normalizePhone(call.contact_phone);
        if (normalized) {
          const match = leadByPhone.get(normalized);
          if (match) {
            enriched.matched_lead_id = match.id;
            enriched.matched_lead_name = match.name;
          }
        }
      }

      // Fetch transcription if requested
      if (includeTranscriptions && call.id) {
        try {
          const recording = await fetchCallRecording(apiKey, call.id);
          enriched.recording = recording;

          // Rate limit between transcription fetches
          await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (recErr) {
          console.warn(
            `[amplemarket-calls] Failed to fetch recording for call ${call.id}:`,
            recErr
          );
        }
      }

      enrichedCalls.push(enriched);
    }

    // 5. Store call data in raw_data for matched leads
    const leadsToUpdate = new Map<
      string,
      CallWithTranscription[]
    >();

    for (const call of enrichedCalls) {
      if (call.matched_lead_id) {
        const existing = leadsToUpdate.get(call.matched_lead_id) || [];
        existing.push(call);
        leadsToUpdate.set(call.matched_lead_id, existing);
      }
    }

    let leadsUpdated = 0;
    for (const [leadId, leadCalls] of leadsToUpdate) {
      // Fetch current raw_data for this lead
      const { data: leadData } = await supabase
        .from("leads")
        .select("raw_data")
        .eq("id", leadId)
        .eq("user_id", user.id)
        .single();

      const existingRawData =
        (leadData?.raw_data as Record<string, unknown>) || {};
      const existingAmplemarket =
        (existingRawData.amplemarket as Record<string, unknown>) || {};

      const callSummaries = leadCalls.map((c) => ({
        call_id: c.id,
        direction: c.direction,
        status: c.status,
        duration: c.duration,
        date: c.started_at,
        outcome: c.outcome,
        has_transcription: !!c.recording?.transcription,
        notes: c.notes,
      }));

      const { error: updateError } = await supabase
        .from("leads")
        .update({
          raw_data: {
            ...existingRawData,
            amplemarket: {
              ...existingAmplemarket,
              calls: callSummaries,
              calls_synced_at: new Date().toISOString(),
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", leadId)
        .eq("user_id", user.id);

      if (!updateError) {
        leadsUpdated++;
      }
    }

    const matchedCount = enrichedCalls.filter(
      (c) => c.matched_lead_id
    ).length;

    console.log(
      `[amplemarket-calls] Complete: ${enrichedCalls.length} calls, ${matchedCount} matched to leads, ${leadsUpdated} leads updated`
    );

    return NextResponse.json({
      calls: enrichedCalls,
      total: enrichedCalls.length,
      matched: matchedCount,
      leadsUpdated,
    });
  } catch (err) {
    console.error("[amplemarket-calls] Error:", err);

    const message =
      err instanceof Error ? err.message : "Failed to fetch calls";

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

// ─── Utilities ───────────────────────────────────────────────────

/**
 * Normalize a phone number by stripping non-digit chars (except leading +).
 * Returns last 10 digits for comparison.
 */
function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  // Strip everything except digits
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  // Use last 10 digits for matching (ignores country code differences)
  return digits.slice(-10);
}
