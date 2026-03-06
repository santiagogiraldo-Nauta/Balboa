// ============================================================
// Balboa Fire — Branching Engine
// Evaluates branching rules against events to determine
// sequence state transitions and autonomous actions.
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";
import {
  getBranchingRules,
  getFireEnabledEnrollments,
  updateEnrollmentForFire,
  insertFireAction,
  hasExistingFireAction,
  getSilentEnrollments,
} from "./db-fire";
import type {
  BranchingRuleRow,
  BranchingResult,
  ClassificationResult,
  FireActionType,
  FireChannel,
} from "./types";
import type { TrackTouchpointInput } from "../track-touchpoint";

// ─── Main Evaluation Function ────────────────────────────────

/**
 * Evaluate branching rules for an event.
 *
 * 1. Find all fire-enabled enrollments for this lead
 * 2. For each enrollment, load applicable rules (sequence + global)
 * 3. Sort by priority, evaluate triggers
 * 4. Execute first matching rule → create fire_action + update enrollment
 *
 * Returns results for all enrollments processed.
 */
export async function evaluateBranchingRules(
  supabase: SupabaseClient,
  event: TrackTouchpointInput,
  touchpointId: string,
  classification?: ClassificationResult | null
): Promise<BranchingResult[]> {
  if (!event.leadId) return [];

  const results: BranchingResult[] = [];

  // Get all fire-enabled enrollments for this lead
  const enrollments = await getFireEnabledEnrollments(supabase, event.leadId);
  if (!enrollments.length) return [];

  for (const enrollment of enrollments) {
    // Cycle prevention: don't process events triggered by our own actions
    if (await hasExistingFireAction(supabase, touchpointId)) {
      console.log(`[branching-engine] Skipping — event ${touchpointId} already has fire action (cycle prevention)`);
      continue;
    }

    // Load rules for this sequence + global rules
    const rules = await getBranchingRules(supabase, {
      userId: enrollment.user_id,
      sequenceId: enrollment.sequence_id,
      includeGlobal: true,
      activeOnly: true,
    });

    if (!rules.length) continue;

    // Evaluate rules in priority order (already sorted by priority ASC)
    const result = await evaluateRulesForEnrollment(
      supabase,
      enrollment,
      rules,
      event,
      touchpointId,
      classification
    );

    results.push(result);

    // Only execute the first matching rule per enrollment
    if (result.matched) break;
  }

  return results;
}

// ─── Rule Evaluation ─────────────────────────────────────────

async function evaluateRulesForEnrollment(
  supabase: SupabaseClient,
  enrollment: {
    enrollment_id: string;
    sequence_id: string;
    sequence_name: string;
    user_id: string;
    current_step: number;
    total_steps: number | null;
    branch_path: string;
    channel_override: string | null;
  },
  rules: BranchingRuleRow[],
  event: TrackTouchpointInput,
  touchpointId: string,
  classification?: ClassificationResult | null
): Promise<BranchingResult> {
  for (const rule of rules) {
    if (!matchesTrigger(rule, event, enrollment, classification)) {
      continue;
    }

    console.log(
      `[branching-engine] Rule matched: "${rule.name}" ` +
      `(${rule.trigger_event}) → ${rule.action_type} ` +
      `for enrollment ${enrollment.enrollment_id}`
    );

    // Execute the matched rule
    const fireActionId = await executeRule(
      supabase,
      rule,
      enrollment,
      event,
      touchpointId,
      classification
    );

    return {
      matched: true,
      rule,
      fireActionId: fireActionId || undefined,
      enrollmentUpdated: true,
      action: rule.action_type,
    };
  }

  return { matched: false };
}

/**
 * Check if a rule's trigger conditions match the current event.
 */
function matchesTrigger(
  rule: BranchingRuleRow,
  event: TrackTouchpointInput,
  enrollment: {
    current_step: number;
  },
  classification?: ClassificationResult | null
): boolean {
  // Must match event type
  if (rule.trigger_event !== event.eventType) return false;

  // Match sentiment (if specified)
  if (rule.trigger_sentiment && rule.trigger_sentiment !== event.sentiment) return false;

  // Match classification (if specified)
  if (rule.trigger_classification) {
    if (!classification || classification.classification !== rule.trigger_classification) {
      return false;
    }
  }

  // Match step number (if specified)
  if (rule.trigger_after_step !== null && rule.trigger_after_step !== undefined) {
    if (enrollment.current_step < rule.trigger_after_step) return false;
  }

  return true;
}

// ─── Rule Execution ──────────────────────────────────────────

async function executeRule(
  supabase: SupabaseClient,
  rule: BranchingRuleRow,
  enrollment: {
    enrollment_id: string;
    sequence_id: string;
    sequence_name: string;
    user_id: string;
    current_step: number;
    total_steps: number | null;
    branch_path: string;
    channel_override: string | null;
  },
  event: TrackTouchpointInput,
  touchpointId: string,
  classification?: ClassificationResult | null
): Promise<string | null> {
  const now = new Date().toISOString();
  let fireActionId: string | null = null;

  switch (rule.action_type) {
    case "advance": {
      // Move to next step in sequence
      const nextStep = enrollment.current_step + 1;
      const isComplete = enrollment.total_steps ? nextStep >= enrollment.total_steps : false;

      await updateEnrollmentForFire(supabase, enrollment.enrollment_id, {
        current_step: nextStep,
        last_step_at: now,
        ...(isComplete ? { status: "completed", completed_at: now } : {}),
      });
      break;
    }

    case "branch": {
      // Switch to a different branch path + optional step
      await updateEnrollmentForFire(supabase, enrollment.enrollment_id, {
        branch_path: rule.action_template || "branch_a",
        ...(rule.action_target_step !== null ? { current_step: rule.action_target_step } : {}),
        last_step_at: now,
      });
      break;
    }

    case "pause": {
      await updateEnrollmentForFire(supabase, enrollment.enrollment_id, {
        status: "paused",
      });
      break;
    }

    case "complete": {
      await updateEnrollmentForFire(supabase, enrollment.enrollment_id, {
        status: "completed",
        completed_at: now,
      });
      break;
    }

    case "switch_channel": {
      const newChannel = rule.action_channel || "linkedin";
      await updateEnrollmentForFire(supabase, enrollment.enrollment_id, {
        channel_override: newChannel,
        last_step_at: now,
      });

      // Create fire action for the channel switch
      const action = await insertFireAction(supabase, {
        user_id: enrollment.user_id,
        lead_id: event.leadId || null,
        enrollment_id: enrollment.enrollment_id,
        trigger_event_id: touchpointId,
        trigger_rule_id: rule.id,
        trigger_type: "rule_match",
        action_type: "switch_channel" as FireActionType,
        channel: newChannel as FireChannel,
        subject: null,
        body: null,
        template_key: rule.action_template || null,
        status: "pending",
        scheduled_for: null,
        reply_classification: classification?.classification || null,
        reply_confidence: classification?.confidence || null,
        metadata: {
          previous_channel: event.channel,
          new_channel: newChannel,
          rule_name: rule.name,
          enrollment_step: enrollment.current_step,
        },
      });
      fireActionId = action?.id || null;
      break;
    }

    case "snooze": {
      const snoozeDays = rule.action_snooze_days || 7;
      const wakeUp = new Date();
      wakeUp.setDate(wakeUp.getDate() + snoozeDays);

      await updateEnrollmentForFire(supabase, enrollment.enrollment_id, {
        status: "paused",
        silence_since: now,
      });

      // Schedule a wake-up action
      const action = await insertFireAction(supabase, {
        user_id: enrollment.user_id,
        lead_id: event.leadId || null,
        enrollment_id: enrollment.enrollment_id,
        trigger_event_id: touchpointId,
        trigger_rule_id: rule.id,
        trigger_type: "rule_match",
        action_type: "snooze" as FireActionType,
        channel: null,
        subject: null,
        body: null,
        template_key: null,
        status: "pending",
        scheduled_for: wakeUp.toISOString(),
        reply_classification: classification?.classification || null,
        reply_confidence: classification?.confidence || null,
        metadata: {
          snooze_days: snoozeDays,
          wake_up_at: wakeUp.toISOString(),
          rule_name: rule.name,
          reason: classification?.classification === "not_now"
            ? "Lead said not now — snoozing"
            : `Snoozed by rule: ${rule.name}`,
        },
      });
      fireActionId = action?.id || null;
      break;
    }

    case "create_task": {
      const action = await insertFireAction(supabase, {
        user_id: enrollment.user_id,
        lead_id: event.leadId || null,
        enrollment_id: enrollment.enrollment_id,
        trigger_event_id: touchpointId,
        trigger_rule_id: rule.id,
        trigger_type: "rule_match",
        action_type: "create_call_task" as FireActionType,
        channel: (rule.action_channel as FireChannel) || "call",
        subject: null,
        body: null,
        template_key: null,
        status: "pending",
        scheduled_for: null,
        reply_classification: classification?.classification || null,
        reply_confidence: classification?.confidence || null,
        metadata: {
          rule_name: rule.name,
          enrollment_step: enrollment.current_step,
          ...(rule.action_metadata || {}),
        },
      });
      fireActionId = action?.id || null;
      break;
    }

    case "send_message": {
      // Schedule a fire action to send a message
      const delayMinutes = (rule.action_metadata?.delay_minutes as number) || 0;
      const scheduledFor = delayMinutes > 0
        ? new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()
        : null;

      const channel = (rule.action_channel || enrollment.channel_override || "email") as FireChannel;
      const actionType: FireActionType = channel === "linkedin" ? "send_linkedin" : "send_email";

      const action = await insertFireAction(supabase, {
        user_id: enrollment.user_id,
        lead_id: event.leadId || null,
        enrollment_id: enrollment.enrollment_id,
        trigger_event_id: touchpointId,
        trigger_rule_id: rule.id,
        trigger_type: "rule_match",
        action_type: actionType,
        channel,
        subject: null,
        body: null,
        template_key: rule.action_template || null,
        status: "pending",
        scheduled_for: scheduledFor,
        reply_classification: classification?.classification || null,
        reply_confidence: classification?.confidence || null,
        metadata: {
          rule_name: rule.name,
          enrollment_step: enrollment.current_step,
          sequence_name: enrollment.sequence_name,
          classification: classification?.classification,
          ...(rule.action_metadata || {}),
        },
      });
      fireActionId = action?.id || null;

      // Advance the enrollment step
      await updateEnrollmentForFire(supabase, enrollment.enrollment_id, {
        current_step: enrollment.current_step + 1,
        last_step_at: now,
      });
      break;
    }
  }

  return fireActionId;
}

// ─── Silence Detection ───────────────────────────────────────

/**
 * Check for enrollments that have been silent for too long.
 * Called by the daily-actions/compute cron job.
 *
 * Finds enrollments with no activity for N days and evaluates
 * silence-specific branching rules against them.
 */
export async function checkSilenceRules(
  supabase: SupabaseClient
): Promise<number> {
  let actionsCreated = 0;

  // Get all silence rules (grouped by silence_days threshold)
  const { data: silenceRules } = await supabase
    .from("branching_rules")
    .select("*")
    .eq("trigger_event", "silence")
    .eq("is_active", true)
    .not("trigger_silence_days", "is", null)
    .order("trigger_silence_days", { ascending: true });

  if (!silenceRules?.length) return 0;

  // Get the minimum silence threshold to query efficiently
  const minDays = Math.min(...silenceRules.map(r => r.trigger_silence_days!));

  // Get all silent enrollments
  const silentEnrollments = await getSilentEnrollments(supabase, minDays);
  if (!silentEnrollments.length) return 0;

  for (const enrollment of silentEnrollments) {
    // Find applicable rules for this enrollment
    const applicableRules = silenceRules.filter(rule => {
      // Must match silence threshold
      if (enrollment.silence_days < (rule.trigger_silence_days || 999)) return false;

      // Must match sequence (or be global)
      if (!rule.is_global && rule.sequence_id !== enrollment.sequence_id) return false;

      // Must match step (if specified)
      if (rule.trigger_after_step !== null && enrollment.current_step < rule.trigger_after_step) return false;

      return true;
    });

    if (!applicableRules.length) continue;

    // Execute the highest-priority matching rule
    const rule = applicableRules[0]; // already sorted by priority

    // Prevent duplicate silence actions
    const existingKey = `silence_${enrollment.enrollment_id}_${rule.id}`;
    const alreadyHandled = await hasExistingFireAction(supabase, existingKey);
    if (alreadyHandled) continue;

    const action = await insertFireAction(supabase, {
      user_id: enrollment.user_id,
      lead_id: enrollment.lead_id,
      enrollment_id: enrollment.enrollment_id,
      trigger_event_id: existingKey, // use composite key for dedup
      trigger_rule_id: rule.id,
      trigger_type: "rule_match",
      action_type: mapBranchingToFireAction(rule.action_type),
      channel: (rule.action_channel as FireChannel) || null,
      subject: null,
      body: null,
      template_key: rule.action_template || null,
      status: "pending",
      scheduled_for: null,
      reply_classification: null,
      reply_confidence: null,
      metadata: {
        rule_name: rule.name,
        silence_days: enrollment.silence_days,
        last_step_at: enrollment.last_step_at,
        enrollment_step: enrollment.current_step,
      },
    });

    if (action) {
      actionsCreated++;
      console.log(
        `[branching-engine] Silence rule "${rule.name}" fired for lead ${enrollment.lead_id} ` +
        `(${enrollment.silence_days} days silent)`
      );

      // Execute enrollment-level changes
      if (rule.action_type === "pause") {
        await updateEnrollmentForFire(supabase, enrollment.enrollment_id, { status: "paused" });
      } else if (rule.action_type === "complete") {
        await updateEnrollmentForFire(supabase, enrollment.enrollment_id, {
          status: "completed",
          completed_at: new Date().toISOString(),
        });
      }
    }
  }

  return actionsCreated;
}

// ─── Helpers ─────────────────────────────────────────────────

function mapBranchingToFireAction(branchingAction: string): FireActionType {
  switch (branchingAction) {
    case "switch_channel": return "switch_channel";
    case "send_message": return "send_email";
    case "create_task": return "create_call_task";
    case "snooze": return "snooze";
    case "pause": return "update_status";
    case "complete": return "update_status";
    default: return "notify";
  }
}
