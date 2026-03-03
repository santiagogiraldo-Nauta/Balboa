/**
 * DB Compliance — Supabase Access Layer for Compliance Tracking
 *
 * Provides CRUD operations for compliance events, consent records,
 * and rate limit tracking. All functions handle errors gracefully
 * (try/catch, never throw, log errors).
 *
 * Tables used:
 * - compliance_events: tracks message_sent, opt_in, opt_out, etc.
 * - lead_consent: tracks consent status per lead/channel
 */

import { SupabaseClient } from "@supabase/supabase-js";

// ─── Rate Limit Counts ────────────────────────────────────────────────

/**
 * Query compliance_events table for message_sent events in the given period.
 * Returns the count of events matching the user, channel, and time window.
 */
export async function getRateLimitCounts(
  supabase: SupabaseClient,
  userId: string,
  channel: string,
  period: "hour" | "day" | "week" | "month"
): Promise<number> {
  try {
    const now = new Date();
    let since: string;

    switch (period) {
      case "hour":
        since = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
        break;
      case "day":
        since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        break;
      case "week":
        since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case "month":
        since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        break;
    }

    const { count, error } = await supabase
      .from("compliance_events")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("channel", channel)
      .eq("event_type", "message_sent")
      .gte("created_at", since);

    if (error) {
      console.error("[db-compliance] getRateLimitCounts error:", error.message);
      return 0;
    }

    return count || 0;
  } catch (err) {
    console.error("[db-compliance] getRateLimitCounts unexpected error:", err);
    return 0;
  }
}

// ─── Record Compliance Event ──────────────────────────────────────────

/**
 * Insert a compliance event into the compliance_events table.
 * Fire-and-forget: logs errors but never throws.
 */
export async function recordComplianceEvent(
  supabase: SupabaseClient,
  userId: string,
  event: {
    leadId?: string;
    channel: string;
    eventType: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const { error } = await supabase.from("compliance_events").insert([
      {
        user_id: userId,
        lead_id: event.leadId || null,
        channel: event.channel,
        event_type: event.eventType,
        metadata: event.metadata || {},
        created_at: new Date().toISOString(),
      },
    ]);

    if (error) {
      console.error("[db-compliance] recordComplianceEvent error:", error.message);
    }
  } catch (err) {
    console.error("[db-compliance] recordComplianceEvent unexpected error:", err);
  }
}

// ─── Get Lead Consent ─────────────────────────────────────────────────

/**
 * Query lead_consent table for active consent records for a specific lead.
 * Returns an array of consent records with channel, type, and active status.
 */
export async function getLeadConsent(
  supabase: SupabaseClient,
  userId: string,
  leadId: string
): Promise<{ channel: string; consentType: string; isActive: boolean }[]> {
  try {
    const { data, error } = await supabase
      .from("lead_consent")
      .select("channel, consent_type, is_active")
      .eq("user_id", userId)
      .eq("lead_id", leadId)
      .eq("is_active", true);

    if (error) {
      console.error("[db-compliance] getLeadConsent error:", error.message);
      return [];
    }

    return (data || []).map((row: { channel: string; consent_type: string; is_active: boolean }) => ({
      channel: row.channel,
      consentType: row.consent_type,
      isActive: row.is_active,
    }));
  } catch (err) {
    console.error("[db-compliance] getLeadConsent unexpected error:", err);
    return [];
  }
}

// ─── Record Consent ───────────────────────────────────────────────────

/**
 * Upsert a consent record into lead_consent table.
 * For opt_out/unsubscribe/gdpr_withdraw, deactivates the record.
 * For opt_in/gdpr_consent, activates the record.
 */
export async function recordConsent(
  supabase: SupabaseClient,
  userId: string,
  leadId: string,
  channel: string,
  consentType: "opt_in" | "opt_out" | "unsubscribe" | "gdpr_consent" | "gdpr_withdraw",
  source?: string
): Promise<void> {
  try {
    const isActive = consentType === "opt_in" || consentType === "gdpr_consent";

    const { error } = await supabase.from("lead_consent").upsert(
      {
        user_id: userId,
        lead_id: leadId,
        channel,
        consent_type: consentType,
        is_active: isActive,
        source: source || "manual",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,lead_id,channel" }
    );

    if (error) {
      console.error("[db-compliance] recordConsent error:", error.message);
    }

    // Also record this as a compliance event for audit trail
    await recordComplianceEvent(supabase, userId, {
      leadId,
      channel,
      eventType: `consent_${consentType}`,
      metadata: { source: source || "manual", isActive },
    });
  } catch (err) {
    console.error("[db-compliance] recordConsent unexpected error:", err);
  }
}

// ─── Compliance Dashboard Data ────────────────────────────────────────

/**
 * Aggregate data for the compliance dashboard.
 * Returns rate limit usage, recent events, and consent summary.
 */
export async function getComplianceDashboardData(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  rateLimits: Record<string, { used: number; limit: number }>;
  recentEvents: Array<{
    eventType: string;
    channel: string;
    leadId?: string;
    createdAt: string;
  }>;
  consentSummary: {
    totalLeads: number;
    optedIn: number;
    optedOut: number;
    gdprConsent: number;
  };
}> {
  const defaultResult = {
    rateLimits: {} as Record<string, { used: number; limit: number }>,
    recentEvents: [] as Array<{
      eventType: string;
      channel: string;
      leadId?: string;
      createdAt: string;
    }>,
    consentSummary: { totalLeads: 0, optedIn: 0, optedOut: 0, gdprConsent: 0 },
  };

  try {
    // Fetch rate limit counts in parallel
    const [
      linkedinMessagesToday,
      linkedinConnectionsToday,
      emailMessagesToday,
      smsMessagesToday,
    ] = await Promise.all([
      getRateLimitCounts(supabase, userId, "linkedin", "day"),
      getRateLimitCounts(supabase, userId, "linkedin_connection", "day"),
      getRateLimitCounts(supabase, userId, "email", "day"),
      getRateLimitCounts(supabase, userId, "sms", "day"),
    ]);

    defaultResult.rateLimits = {
      linkedin_messages: { used: linkedinMessagesToday, limit: 50 },
      linkedin_connections: { used: linkedinConnectionsToday, limit: 20 },
      email_messages: { used: emailMessagesToday, limit: 200 },
      sms_messages: { used: smsMessagesToday, limit: 50 },
    };

    // Fetch recent compliance events (last 50)
    const { data: recentEventsData, error: eventsError } = await supabase
      .from("compliance_events")
      .select("event_type, channel, lead_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (eventsError) {
      console.error("[db-compliance] getComplianceDashboardData events error:", eventsError.message);
    } else {
      defaultResult.recentEvents = (recentEventsData || []).map(
        (row: { event_type: string; channel: string; lead_id: string | null; created_at: string }) => ({
          eventType: row.event_type,
          channel: row.channel,
          leadId: row.lead_id || undefined,
          createdAt: row.created_at,
        })
      );
    }

    // Fetch consent summary
    const { data: consentData, error: consentError } = await supabase
      .from("lead_consent")
      .select("consent_type, is_active")
      .eq("user_id", userId);

    if (consentError) {
      console.error("[db-compliance] getComplianceDashboardData consent error:", consentError.message);
    } else {
      const consentRecords = consentData || [];
      const uniqueLeadIds = new Set<string>();

      // Count unique leads from compliance events (approximate)
      const { count: totalLeadsCount, error: leadsCountError } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);

      if (leadsCountError) {
        console.error("[db-compliance] getComplianceDashboardData leads count error:", leadsCountError.message);
      }

      // Tally consent records - use Set to avoid type issues with direct counting
      let optedIn = 0;
      let optedOut = 0;
      let gdprConsent = 0;

      for (const record of consentRecords) {
        const r = record as { consent_type: string; is_active: boolean };
        if (r.consent_type === "opt_in" && r.is_active) optedIn++;
        if ((r.consent_type === "opt_out" || r.consent_type === "unsubscribe") && r.is_active) optedOut++;
        if (r.consent_type === "gdpr_consent" && r.is_active) gdprConsent++;
      }

      defaultResult.consentSummary = {
        totalLeads: totalLeadsCount || 0,
        optedIn,
        optedOut,
        gdprConsent,
      };
    }

    return defaultResult;
  } catch (err) {
    console.error("[db-compliance] getComplianceDashboardData unexpected error:", err);
    return defaultResult;
  }
}
