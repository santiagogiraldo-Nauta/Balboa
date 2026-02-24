import { SupabaseClient } from "@supabase/supabase-js";
import { PlaybookMetricsSummary } from "./types";

/**
 * Calculate playbook metrics and recommendations based on historical data
 */

export async function getPlaybookMetricsSummary(
  supabase: SupabaseClient,
  userId: string,
  days: number = 90
): Promise<PlaybookMetricsSummary[]> {
  // Fire-and-forget: refresh the playbook summary from action_events before querying
  supabase.rpc("refresh_playbook_summary", { p_user_id: userId }).then(({ error: rpcErr }) => {
    if (rpcErr) console.error("[playbook] refresh_playbook_summary RPC error:", rpcErr.message);
  });

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("playbook_metrics_summary")
    .select("*")
    .eq("user_id", userId)
    .gte("last_updated", since);

  if (error) {
    console.error("Error fetching playbook metrics summary:", error);
    return [];
  }

  return data || [];
}

/**
 * Get best channel for a lead based on playbook metrics
 */
export async function getBestChannel(
  supabase: SupabaseClient,
  userId: string,
  leadTier: string,
  sequenceNumber: number = 1
): Promise<{ channel: "email" | "linkedin"; replyRate: number }> {
  const metrics = await getPlaybookMetricsSummary(supabase, userId);

  const emailMetrics = metrics.find(
    (m) => m.channel === "email" && m.lead_tier === leadTier && m.sequence_number === sequenceNumber
  );
  const linkedinMetrics = metrics.find(
    (m) => m.channel === "linkedin" && m.lead_tier === leadTier && m.sequence_number === sequenceNumber
  );

  const emailRate = emailMetrics?.reply_rate || 0;
  const linkedinRate = linkedinMetrics?.reply_rate || 0;

  return {
    channel: emailRate > linkedinRate ? "email" : "linkedin",
    replyRate: Math.max(emailRate, linkedinRate),
  };
}

/**
 * Get best timing for outreach based on playbook metrics
 */
export async function getBestTiming(
  supabase: SupabaseClient,
  userId: string,
  channel: "email" | "linkedin",
  leadTier: string
): Promise<{ day: string; hour: number }> {
  const metrics = await getPlaybookMetricsSummary(supabase, userId);

  const channelMetrics = metrics.filter((m) => m.channel === channel && m.lead_tier === leadTier);

  if (channelMetrics.length === 0) {
    // Default to Tuesday 10am
    return { day: "Tuesday", hour: 10 };
  }

  // Find highest reply rate
  const best = channelMetrics.reduce((prev, current) =>
    (current.reply_rate || 0) > (prev.reply_rate || 0) ? current : prev
  );

  return {
    day: best.timing_day || "Tuesday",
    hour: best.timing_hour || 10,
  };
}

/**
 * Get expected outcome probabilities based on channel and lead tier
 */
export async function getExpectedOutcomes(
  supabase: SupabaseClient,
  userId: string,
  channel: "email" | "linkedin",
  leadTier: string,
  sequenceNumber: number = 1
): Promise<{
  replyRate: number;
  meetingRate: number;
  closeRate: number;
}> {
  const metrics = await getPlaybookMetricsSummary(supabase, userId);

  const metric = metrics.find(
    (m) =>
      m.channel === channel &&
      m.lead_tier === leadTier &&
      m.sequence_number === sequenceNumber
  );

  if (!metric) {
    return { replyRate: 0, meetingRate: 0, closeRate: 0 };
  }

  return {
    replyRate: metric.reply_rate || 0,
    meetingRate: metric.meeting_rate || 0,
    closeRate: metric.close_rate || 0,
  };
}

/**
 * Recommend action for a lead based on playbook
 */
export async function getRecommendedAction(
  supabase: SupabaseClient,
  userId: string,
  leadTier: string,
  sequenceNumber: number = 1
): Promise<{
  action: string;
  channel: "email" | "linkedin";
  timing: { day: string; hour: number };
  expectedReplyRate: number;
}> {
  const { channel, replyRate } = await getBestChannel(supabase, userId, leadTier, sequenceNumber);
  const timing = await getBestTiming(supabase, userId, channel, leadTier);

  let actionText = "";
  if (channel === "email") {
    actionText = `Send email to ${leadTier} lead on ${timing.day} at ${timing.hour}:00`;
  } else {
    actionText = `Send LinkedIn message to ${leadTier} lead on ${timing.day} at ${timing.hour}:00`;
  }

  return {
    action: actionText,
    channel,
    timing,
    expectedReplyRate: replyRate,
  };
}

/**
 * Calculate deal close probability based on stage and metrics
 */
export async function getDealCloseProbability(
  supabase: SupabaseClient,
  userId: string,
  dealStage: string
): Promise<number> {
  const stageCloseProbabilities: Record<string, number> = {
    qualification: 20,
    proposal: 65,
    negotiation: 75,
    closed_won: 100,
    closed_lost: 0,
  };

  return stageCloseProbabilities[dealStage] || 30;
}

/**
 * Get playbook adherence score for an AE
 */
export async function getPlaybookAdherenceScore(
  supabase: SupabaseClient,
  accountExecutiveId: string
): Promise<number> {
  const { data: metrics, error } = await supabase
    .from("playbook_metrics")
    .select("*")
    .eq("user_id", accountExecutiveId);

  if (error || !metrics || metrics.length === 0) {
    return 0;
  }

  // Simple scoring: percentage of actions that resulted in positive outcomes
  const successful = metrics.filter((m) => m.reply_received || m.meeting_booked || m.deal_closed).length;

  return Math.round((successful / metrics.length) * 100);
}
