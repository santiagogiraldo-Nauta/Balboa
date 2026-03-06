// ============================================================
// Balboa Fire — Signal Triggers
// Maps existing signal types to autonomous fire actions.
// Only fires when the lead's enrollment has fire_enabled = true.
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";
import {
  insertFireAction,
  hasExistingFireAction,
  getFireEnabledEnrollments,
} from "./db-fire";
import type {
  TriggerConfig,
  FireActionType,
  FireChannel,
  ClassificationResult,
} from "./types";
import type { TrackTouchpointInput } from "../track-touchpoint";

// ─── Signal → Action Mapping ─────────────────────────────────
// Each signal type maps to an automatic Fire action.
// These are the defaults; can be overridden by branching rules.

const SIGNAL_TRIGGERS: Record<string, TriggerConfig> = {
  // LinkedIn connection accepted → send intro message after 15 min delay
  connection_accepted: {
    action: "send_linkedin",
    channel: "linkedin",
    template: "linkedin_intro",
    delayMinutes: 15,
    priority: "high",
  },

  // Email opened 3+ times → create call task (hot lead)
  hot_open_signal: {
    action: "create_call_task",
    channel: "call",
    priority: "urgent",
    metadata: { reason: "Multiple email opens detected — high interest signal" },
  },

  // Meeting booked → notify via Slack for prep
  meeting_booked: {
    action: "notify",
    channel: "slack",
    template: "meeting_prep",
    priority: "urgent",
    metadata: { notification_type: "meeting_prep" },
  },

  // Email bounced → switch to LinkedIn
  bounced: {
    action: "switch_channel",
    channel: "linkedin",
    priority: "medium",
    metadata: { reason: "Email bounced — switching to LinkedIn" },
  },

  // Call completed (>2 min) → send follow-up email
  call_completed_long: {
    action: "send_email",
    channel: "email",
    template: "call_followup",
    delayMinutes: 30,
    priority: "high",
    metadata: { reason: "Meaningful call completed — follow up" },
  },

  // Connection request sent → no auto action (wait for accept)
  connection_sent: {
    action: "notify",
    channel: "slack",
    priority: "low",
    metadata: { reason: "LinkedIn connection request sent" },
  },
};

// ─── Signal Evaluation ───────────────────────────────────────

/**
 * Evaluate signal triggers for an event.
 * Only creates Fire actions if the lead has a fire-enabled enrollment.
 *
 * Returns number of fire actions created.
 */
export async function evaluateSignalTriggers(
  supabase: SupabaseClient,
  event: TrackTouchpointInput,
  touchpointId: string,
  classification?: ClassificationResult | null
): Promise<number> {
  if (!event.leadId) return 0;

  // Determine which signal trigger applies
  const triggerKey = resolveSignalKey(event);
  if (!triggerKey) return 0;

  const triggerConfig = SIGNAL_TRIGGERS[triggerKey];
  if (!triggerConfig) return 0;

  // Check if lead has any fire-enabled enrollment
  const enrollments = await getFireEnabledEnrollments(supabase, event.leadId);
  if (!enrollments.length) return 0;

  // Cycle prevention: don't fire on events we created
  if (await hasExistingFireAction(supabase, touchpointId)) {
    return 0;
  }

  // Use the first enrollment (most relevant)
  const enrollment = enrollments[0];

  // Calculate scheduled time (if delay is configured)
  const scheduledFor = triggerConfig.delayMinutes
    ? new Date(Date.now() + triggerConfig.delayMinutes * 60 * 1000).toISOString()
    : null;

  const action = await insertFireAction(supabase, {
    user_id: enrollment.user_id,
    lead_id: event.leadId,
    enrollment_id: enrollment.enrollment_id,
    trigger_event_id: touchpointId,
    trigger_rule_id: null,
    trigger_type: "signal_trigger",
    action_type: triggerConfig.action as FireActionType,
    channel: (triggerConfig.channel as FireChannel) || null,
    subject: null,
    body: null,
    template_key: triggerConfig.template || null,
    status: "pending",
    scheduled_for: scheduledFor,
    reply_classification: classification?.classification || null,
    reply_confidence: classification?.confidence || null,
    metadata: {
      signal_key: triggerKey,
      signal_priority: triggerConfig.priority,
      enrollment_step: enrollment.current_step,
      sequence_name: enrollment.sequence_name,
      event_channel: event.channel,
      event_source: event.source,
      ...(triggerConfig.metadata || {}),
    },
  });

  if (action) {
    console.log(
      `[signal-triggers] ${triggerKey} → ${triggerConfig.action} ` +
      `(${triggerConfig.channel || "n/a"}) for lead ${event.leadId}` +
      `${scheduledFor ? ` scheduled at ${scheduledFor}` : ""}`
    );
    return 1;
  }

  return 0;
}

// ─── Signal Key Resolution ───────────────────────────────────

/**
 * Map an event to its signal trigger key.
 * Some signals need extra context (like email open count).
 */
function resolveSignalKey(event: TrackTouchpointInput): string | null {
  switch (event.eventType) {
    case "connection_accepted":
      if (event.channel === "linkedin") return "connection_accepted";
      return null;

    case "connection_sent":
      if (event.channel === "linkedin") return "connection_sent";
      return null;

    case "bounced":
      return "bounced";

    case "meeting_booked":
      return "meeting_booked";

    case "opened":
      // Only trigger for hot opens (3+ times)
      if (event.metadata?.openCount && (event.metadata.openCount as number) >= 3) {
        return "hot_open_signal";
      }
      return null;

    case "call_completed":
      // Only trigger for meaningful calls (>2 min)
      if (event.metadata?.duration && (event.metadata.duration as number) > 120) {
        return "call_completed_long";
      }
      return null;

    // Replies are handled by the reply classifier, not signal triggers
    case "replied":
      return null;

    default:
      return null;
  }
}

// ─── Exports for testing/configuration ───────────────────────

export { SIGNAL_TRIGGERS };
export type { TriggerConfig };
