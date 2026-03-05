import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { fetchTranscripts, type FirefliesTranscript } from "@/lib/fireflies/client";

// ─── Types ────────────────────────────────────────────────────────

interface MeetingRecord {
  id: string;
  title: string;
  date: string;
  duration: number;
  participants: string[];
  summary: string;
  actionItems: string;
  keywords: string;
  transcriptHighlights: string;
}

interface SyncResult {
  synced: number;
  matched: number;
  unmatched: number;
  meetings: Array<{
    id: string;
    title: string;
    matchedLeadId?: string;
    matchedLeadName?: string;
  }>;
}

// ─── Route ────────────────────────────────────────────────────────

/**
 * POST /api/fireflies/sync
 *
 * Syncs Fireflies.ai meeting transcripts to Balboa leads.
 * For each transcript, attempts to match participants to existing
 * leads by email or name and stores meeting data in raw_data.meetings.
 *
 * Body params (all optional):
 *   limit — Max transcripts to fetch (default: 50, max: 50)
 */
export async function POST(request: Request) {
  const { user, supabase, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Fireflies is not configured. Set FIREFLIES_API_KEY in environment variables." },
      { status: 500 }
    );
  }

  try {
    // Parse optional body params
    let limit = 50;
    try {
      const body = await request.json();
      if (body.limit && typeof body.limit === "number") {
        limit = Math.min(body.limit, 50);
      }
    } catch {
      // No body or invalid JSON is fine — use defaults
    }

    // 1. Fetch transcripts from Fireflies
    console.log("[fireflies-sync] Fetching transcripts...");
    const transcripts = await fetchTranscripts(apiKey, limit);
    console.log(`[fireflies-sync] Fetched ${transcripts.length} transcripts`);

    if (transcripts.length === 0) {
      return NextResponse.json({
        synced: 0,
        matched: 0,
        unmatched: 0,
        meetings: [],
        message: "No transcripts found in Fireflies.",
      });
    }

    // 2. Fetch all leads for matching
    const { data: leadsData, error: leadsError } = await supabase
      .from("leads")
      .select("id, first_name, last_name, email, company, company_intel, raw_data")
      .eq("user_id", user.id);

    if (leadsError) {
      console.error("[fireflies-sync] Failed to fetch leads:", leadsError);
      return NextResponse.json(
        { error: "Failed to fetch leads for matching" },
        { status: 500 }
      );
    }

    const leads = leadsData || [];

    // Build lookup maps for matching
    const leadByEmail = new Map<string, { id: string; name: string; company: string }>();
    const leadByName = new Map<string, { id: string; name: string; company: string }>();

    for (const lead of leads) {
      const fullName = `${lead.first_name || ""} ${lead.last_name || ""}`.trim();
      const entry = { id: lead.id, name: fullName, company: lead.company || "" };

      if (lead.email) {
        leadByEmail.set(lead.email.toLowerCase().trim(), entry);
      }
      if (fullName) {
        leadByName.set(fullName.toLowerCase().trim(), entry);
      }
    }

    // 3. Process each transcript — match to leads
    const result: SyncResult = {
      synced: transcripts.length,
      matched: 0,
      unmatched: 0,
      meetings: [],
    };

    // Track which leads need updates: leadId -> array of meetings
    const leadsToUpdate = new Map<string, {
      lead: typeof leads[0];
      meetings: MeetingRecord[];
    }>();

    for (const transcript of transcripts) {
      const matchedLead = matchTranscriptToLead(transcript, leadByEmail, leadByName);

      const meetingEntry: SyncResult["meetings"][0] = {
        id: transcript.id,
        title: transcript.title || "Untitled Meeting",
      };

      if (matchedLead) {
        meetingEntry.matchedLeadId = matchedLead.id;
        meetingEntry.matchedLeadName = matchedLead.name;
        result.matched++;

        // Build meeting record for storage
        const meetingRecord = buildMeetingRecord(transcript);

        // Find full lead data for this match
        const leadData = leads.find((l) => l.id === matchedLead.id);
        if (leadData) {
          const existing = leadsToUpdate.get(matchedLead.id);
          if (existing) {
            existing.meetings.push(meetingRecord);
          } else {
            leadsToUpdate.set(matchedLead.id, {
              lead: leadData,
              meetings: [meetingRecord],
            });
          }
        }
      } else {
        result.unmatched++;
      }

      result.meetings.push(meetingEntry);
    }

    // 4. Update leads with meeting data
    let leadsUpdated = 0;
    for (const [leadId, { lead, meetings }] of leadsToUpdate) {
      try {
        const existingRawData = (lead.raw_data as Record<string, unknown>) || {};
        const existingMeetings = (existingRawData.meetings as MeetingRecord[]) || [];

        // Merge new meetings with existing, avoiding duplicates by ID
        const existingIds = new Set(existingMeetings.map((m) => m.id));
        const newMeetings = meetings.filter((m) => !existingIds.has(m.id));
        const mergedMeetings = [...existingMeetings, ...newMeetings];

        // Extract new intel from meeting summaries for company_intel
        const existingIntel = (lead.company_intel as Record<string, unknown>) || {};
        const updatedIntel = enrichCompanyIntel(existingIntel, meetings);

        const { error: updateError } = await supabase
          .from("leads")
          .update({
            raw_data: {
              ...existingRawData,
              meetings: mergedMeetings,
              meetings_synced_at: new Date().toISOString(),
            },
            company_intel: updatedIntel,
            updated_at: new Date().toISOString(),
          })
          .eq("id", leadId)
          .eq("user_id", user.id);

        if (!updateError) {
          leadsUpdated++;
        } else {
          console.error(`[fireflies-sync] Failed to update lead ${leadId}:`, updateError);
        }
      } catch (err) {
        console.error(`[fireflies-sync] Error updating lead ${leadId}:`, err);
      }
    }

    console.log(
      `[fireflies-sync] Complete: ${result.synced} transcripts, ${result.matched} matched, ${result.unmatched} unmatched, ${leadsUpdated} leads updated`
    );

    return NextResponse.json({
      ...result,
      leadsUpdated,
    });
  } catch (err) {
    console.error("[fireflies-sync] Error:", err);

    const message = err instanceof Error ? err.message : "Failed to sync Fireflies transcripts";

    if (message.includes("Invalid Fireflies API key")) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    if (message.includes("rate limit")) {
      return NextResponse.json({ error: message }, { status: 429 });
    }

    return NextResponse.json(
      { error: message, details: String(err) },
      { status: 500 }
    );
  }
}

// ─── Matching Logic ───────────────────────────────────────────────

/**
 * Attempt to match a Fireflies transcript to an existing lead.
 * Strategy: first try email match from meeting_attendees,
 * then fall back to name matching against participants.
 */
function matchTranscriptToLead(
  transcript: FirefliesTranscript,
  leadByEmail: Map<string, { id: string; name: string; company: string }>,
  leadByName: Map<string, { id: string; name: string; company: string }>
): { id: string; name: string } | null {
  // Strategy 1: Match by attendee email
  if (transcript.meeting_attendees) {
    for (const attendee of transcript.meeting_attendees) {
      if (attendee.email) {
        const match = leadByEmail.get(attendee.email.toLowerCase().trim());
        if (match) {
          return { id: match.id, name: match.name };
        }
      }
    }
  }

  // Strategy 2: Match by participant name (from the participants string array)
  if (transcript.participants) {
    for (const participant of transcript.participants) {
      if (!participant) continue;
      const normalized = participant.toLowerCase().trim();
      const match = leadByName.get(normalized);
      if (match) {
        return { id: match.id, name: match.name };
      }
    }
  }

  // Strategy 3: Match by attendee displayName or name
  if (transcript.meeting_attendees) {
    for (const attendee of transcript.meeting_attendees) {
      const nameToTry = attendee.displayName || attendee.name;
      if (nameToTry) {
        const normalized = nameToTry.toLowerCase().trim();
        const match = leadByName.get(normalized);
        if (match) {
          return { id: match.id, name: match.name };
        }
      }
    }
  }

  // Strategy 4: Fuzzy match — check if any lead name appears in any participant name
  if (transcript.participants) {
    for (const participant of transcript.participants) {
      if (!participant) continue;
      const participantLower = participant.toLowerCase().trim();

      for (const [leadName, lead] of leadByName) {
        // Only match if lead name has at least 2 parts (first + last)
        const parts = leadName.split(" ");
        if (parts.length < 2) continue;

        if (participantLower.includes(leadName) || leadName.includes(participantLower)) {
          return { id: lead.id, name: lead.name };
        }
      }
    }
  }

  return null;
}

// ─── Meeting Record Builder ──────────────────────────────────────

/**
 * Build a meeting record suitable for storing in raw_data.meetings.
 * Truncates transcript text to first 500 chars to avoid DB bloat.
 */
function buildMeetingRecord(transcript: FirefliesTranscript): MeetingRecord {
  // Build transcript highlights from sentences (first 500 chars)
  let transcriptHighlights = "";
  if (transcript.sentences && transcript.sentences.length > 0) {
    const fullText = transcript.sentences
      .map((s) => `${s.speaker_name}: ${s.text}`)
      .join(" ");
    transcriptHighlights = fullText.substring(0, 500);
    if (fullText.length > 500) {
      transcriptHighlights += "...";
    }
  }

  // Build participant list from both sources
  const participantSet = new Set<string>();
  if (transcript.participants) {
    transcript.participants.forEach((p) => {
      if (p) participantSet.add(p);
    });
  }
  if (transcript.meeting_attendees) {
    transcript.meeting_attendees.forEach((a) => {
      const name = a.displayName || a.name;
      if (name) participantSet.add(name);
    });
  }

  return {
    id: `fireflies-${transcript.id}`,
    title: transcript.title || "Untitled Meeting",
    date: transcript.date || transcript.dateString || new Date().toISOString(),
    duration: transcript.duration || 0,
    participants: Array.from(participantSet),
    summary: transcript.summary?.overview || "",
    actionItems: transcript.summary?.action_items || "",
    keywords: transcript.summary?.keywords || "",
    transcriptHighlights,
  };
}

// ─── Company Intel Enrichment ─────────────────────────────────────

/**
 * Merge keywords and action items from meetings into company_intel.
 * Adds meeting-sourced data to recentNews and painPoints.
 */
function enrichCompanyIntel(
  existing: Record<string, unknown>,
  meetings: MeetingRecord[]
): Record<string, unknown> {
  const updated = { ...existing };

  // Gather all keywords from meetings
  const allKeywords = meetings
    .map((m) => m.keywords)
    .filter(Boolean)
    .join(", ");

  // Add meeting summaries as recent news entries
  const existingNews = (updated.recentNews as string[]) || [];
  const meetingNewsEntries = meetings
    .filter((m) => m.summary)
    .map((m) => `[Meeting: ${m.title}] ${m.summary.substring(0, 200)}`);

  // Deduplicate and limit to 20 entries
  const newsSet = new Set([...meetingNewsEntries, ...existingNews]);
  updated.recentNews = Array.from(newsSet).slice(0, 20);

  // Extract pain points from action items
  const existingPainPoints = (updated.painPoints as string[]) || [];
  const meetingPainPoints = meetings
    .filter((m) => m.actionItems)
    .map((m) => `[From meeting] ${m.actionItems.substring(0, 150)}`);

  const painSet = new Set([...meetingPainPoints, ...existingPainPoints]);
  updated.painPoints = Array.from(painSet).slice(0, 15);

  // Store keywords in tech stack if they look technical
  if (allKeywords) {
    const existingTech = (updated.techStack as string[]) || [];
    updated.techStack = existingTech; // Preserve existing, don't auto-add meeting keywords
  }

  return updated;
}
