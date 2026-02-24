/**
 * Universal Event Tracking — Phase 2.5
 *
 * Central tracking utility for ALL platform actions.
 * Server-side: trackEvent()  — fire-and-forget Supabase insert
 * Client-side: trackEventClient() — fire-and-forget POST to /api/track
 */

import { SupabaseClient } from "@supabase/supabase-js";

// ─── Event Type Definitions ─────────────────────────────────────────

export type EventCategory =
  | "lead"
  | "outreach"
  | "deal"
  | "call"
  | "analysis"
  | "enablement"
  | "signal"
  | "navigation"
  | "team";

export type LeadAction =
  | "csv_imported"
  | "icp_scored"
  | "lead_status_changed"
  | "lead_disqualified"
  | "lead_viewed"
  | "note_added"
  | "lead_created";

export type OutreachAction =
  | "message_generated"
  | "message_sent"
  | "message_queued"
  | "message_copied"
  | "draft_created"
  | "draft_approved"
  | "draft_rejected"
  | "content_suggestions_generated";

export type DealAction =
  | "deal_viewed"
  | "deal_stage_changed"
  | "deal_created"
  | "deal_health_changed";

export type CallAction =
  | "call_logged"
  | "call_outcome_detected"
  | "call_drafts_generated";

export type AnalysisAction =
  | "lead_analyzed"
  | "deal_analyzed"
  | "pipeline_analyzed"
  | "research_query";

export type EnablementAction =
  | "video_prep_created"
  | "prep_kit_created"
  | "prep_kit_viewed"
  | "battle_card_created"
  | "battle_card_viewed";

export type SignalAction =
  | "signal_received"
  | "signal_action_completed"
  | "signal_snoozed";

export type NavigationAction =
  | "section_viewed"
  | "filter_changed";

export type TeamAction =
  | "ae_performance_viewed";

export type EventAction =
  | LeadAction
  | OutreachAction
  | DealAction
  | CallAction
  | AnalysisAction
  | EnablementAction
  | SignalAction
  | NavigationAction
  | TeamAction;

// ─── TrackEvent Params ──────────────────────────────────────────────

export interface TrackEventParams {
  eventCategory: EventCategory;
  eventAction: EventAction;
  leadId?: string;
  dealId?: string;
  accountId?: string;
  channel?: "email" | "linkedin" | "call";
  leadTier?: string;
  leadIndustry?: string;
  leadPosition?: string;
  templateType?: string;
  numericValue?: number;
  sequenceNumber?: number;
  outcomeReply?: boolean;
  outcomeMeeting?: boolean;
  outcomeDealClosed?: boolean;
  outcomeDealAmount?: number;
  metadata?: Record<string, unknown>;
  source?: "frontend" | "api" | "system" | "mock";
}

// ─── Server-Side: trackEvent() ──────────────────────────────────────
// Fire-and-forget insert into action_events via Supabase client.
// Never throws — logs errors silently so it doesn't break the caller.

export async function trackEvent(
  supabase: SupabaseClient,
  userId: string,
  params: TrackEventParams
): Promise<void> {
  const now = new Date();

  try {
    const { error } = await supabase.from("action_events").insert([
      {
        user_id: userId,
        event_category: params.eventCategory,
        event_action: params.eventAction,
        lead_id: params.leadId || null,
        deal_id: params.dealId || null,
        account_id: params.accountId || null,
        channel: params.channel || null,
        lead_tier: params.leadTier || null,
        lead_industry: params.leadIndustry || null,
        lead_position: params.leadPosition || null,
        template_type: params.templateType || null,
        event_day: now.toLocaleDateString("en-US", { weekday: "long" }),
        event_hour: now.getHours(),
        numeric_value: params.numericValue ?? null,
        sequence_number: params.sequenceNumber ?? null,
        outcome_reply: params.outcomeReply ?? false,
        outcome_meeting: params.outcomeMeeting ?? false,
        outcome_deal_closed: params.outcomeDealClosed ?? false,
        outcome_deal_amount: params.outcomeDealAmount ?? null,
        metadata: params.metadata || {},
        source: params.source || "api",
      },
    ]);

    if (error) {
      console.error("[tracking] insert error:", error.message);
    }
  } catch (err) {
    console.error("[tracking] unexpected error:", err);
  }
}

// ─── Client-Side: trackEventClient() ────────────────────────────────
// Fire-and-forget POST to /api/track. Uses keepalive so it survives
// page navigations.

export function trackEventClient(params: TrackEventParams): void {
  try {
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      keepalive: true,
    }).catch((err) => {
      console.error("[tracking] client fetch error:", err);
    });
  } catch (err) {
    console.error("[tracking] client error:", err);
  }
}
