/**
 * Universal Event Tracking — Phase 2.5 + Phase 7 Full Instrumentation
 *
 * Central tracking utility for ALL platform actions.
 * Server-side: trackEvent()  — fire-and-forget Supabase insert
 * Client-side: trackEventClient() — fire-and-forget POST to /api/track
 *
 * PHILOSOPHY: Track EVERYTHING. Every click, every generation, every outcome.
 * When we go live with Amplemarket, HubSpot, Aircall, LinkedIn — all that
 * external data merges with these events to build the unbeatable playbook
 * intelligence engine. The more data we have, the better our recommendations.
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
  | "team"
  | "event"         // Event Command Center
  | "communication"; // Communication Hub

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
  | "draft_expanded"
  | "draft_reviewed"
  | "content_suggestions_generated"
  // Email popup
  | "email_popup_opened"
  | "email_popup_closed"
  | "email_ai_generated"
  | "email_sent_from_popup"
  // LinkedIn popup
  | "linkedin_popup_opened"
  | "linkedin_popup_closed"
  | "linkedin_ai_generated"
  | "linkedin_copy_and_open"
  | "linkedin_sales_nav_opened"
  | "linkedin_profile_viewed"
  | "linkedin_redirect_clicked"
  // Proposal popup
  | "proposal_popup_opened"
  | "proposal_popup_closed"
  | "proposal_doc_type_selected"
  | "proposal_ai_generated"
  | "proposal_saved_as_draft";

export type DealAction =
  | "deal_viewed"
  | "deal_stage_changed"
  | "deal_created"
  | "deal_health_changed";

export type CallAction =
  | "call_logged"
  | "call_outcome_detected"
  | "call_drafts_generated"
  | "call_script_generated"
  | "click_to_call"
  // Cold Call Script component
  | "call_dialer_clicked"
  | "call_timer_started"
  | "call_timer_paused"
  | "call_timer_resumed"
  | "call_timer_stopped"
  | "call_outcome_selected"
  | "call_outcome_saved"
  | "call_script_requested"
  | "call_script_regenerated"
  | "call_script_section_copied"
  | "call_script_tab_viewed";

export type AnalysisAction =
  | "lead_analyzed"
  | "deal_analyzed"
  | "pipeline_analyzed"
  | "research_query"
  | "deep_research"
  | "lead_summarized"
  // Deep Research Panel
  | "deep_research_panel_opened"
  | "deep_research_panel_closed"
  | "deep_research_tab_clicked"
  | "deep_research_tab_completed"
  | "deep_research_all_tabs"
  // Lead Summarizer
  | "lead_summary_requested"
  | "lead_summary_expanded"
  | "lead_summary_collapsed";

export type EnablementAction =
  | "video_prep_created"
  | "prep_kit_created"
  | "prep_kit_viewed"
  | "battle_card_created"
  | "battle_card_viewed"
  // Meeting Scheduler
  | "meeting_scheduler_opened"
  | "meeting_message_generated"
  | "meeting_draft_saved";

export type SignalAction =
  | "signal_received"
  | "signal_action_completed"
  | "signal_snoozed";

export type EventCenterAction =
  | "event_viewed"
  | "event_selected"
  | "event_tab_switched"
  | "event_attendee_filtered"
  | "event_attendee_sorted"
  | "event_attendee_email_opened"
  | "event_attendee_linkedin_opened"
  | "event_attendee_navigated_to_lead"
  | "event_outreach_plan_generated"
  | "event_outreach_plan_requested";

export type CommunicationAction =
  | "communication_hub_viewed"
  | "communication_channel_filtered"
  | "communication_thread_expanded"
  | "communication_thread_collapsed";

export type NavigationAction =
  | "section_viewed"
  | "filter_changed"
  | "vasco_context_opened";

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
  | EventCenterAction
  | CommunicationAction
  | NavigationAction
  | TeamAction;

// ─── TrackEvent Params ──────────────────────────────────────────────

export interface TrackEventParams {
  eventCategory: EventCategory;
  eventAction: EventAction;
  leadId?: string;
  dealId?: string;
  accountId?: string;
  channel?: "email" | "linkedin" | "call" | "sms" | "whatsapp";
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
