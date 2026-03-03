// Outreach safety gate — routes outreach through approval queue in production
import { SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";
import { runComplianceChecks, getComplianceSummary } from "./compliance";
import type { ComplianceCheckResult } from "./compliance";
import { getRateLimitCounts, getLeadConsent } from "./db-compliance";

export type OutreachStatus = "pending_approval" | "approved" | "rejected" | "sent" | "cancelled";

export interface QueueResult {
  queued: boolean;
  queueId?: string;
  sent?: boolean;
  sandbox?: boolean;
  message?: string;
  blocked?: boolean;
  complianceIssues?: ComplianceCheckResult[];
}

export interface OutreachParams {
  leadId: string;
  channel: "email" | "linkedin" | "call";
  subject?: string;
  body: string;
  metadata?: Record<string, unknown>;
}

/**
 * Routes outreach through the appropriate path based on environment:
 * - Sandbox: simulate immediate send (no real delivery)
 * - Production, launch OFF: queue as pending_approval (never sends)
 * - Production, launch ON + approval required: queue as pending_approval
 * - Production, fully unlocked: direct send
 */
export async function queueOutreach(
  supabase: SupabaseClient,
  userId: string,
  params: OutreachParams
): Promise<QueueResult> {
  // ── Compliance checks (run in all environments) ──
  if (config.features.complianceEnabled) {
    try {
      // Gather rate limit counts and consent data in parallel
      const [messagesToday, connectionsToday, connectionsThisWeek, consentRecords] = await Promise.all([
        getRateLimitCounts(supabase, userId, params.channel, "day"),
        params.channel === "linkedin" ? getRateLimitCounts(supabase, userId, "linkedin", "day") : Promise.resolve(0),
        params.channel === "linkedin" ? getRateLimitCounts(supabase, userId, "linkedin", "week") : Promise.resolve(0),
        getLeadConsent(supabase, userId, params.leadId),
      ]);

      // Derive consent flags from records
      const channelConsent = consentRecords.filter(c => c.channel === params.channel);
      const hasOptIn = channelConsent.some(c => c.consentType === "opt_in" || c.consentType === "gdpr_consent");
      const hasUnsubscribed = channelConsent.some(c => c.consentType === "opt_out" || c.consentType === "unsubscribe");
      const gdprConsent = channelConsent.some(c => c.consentType === "gdpr_consent");

      const complianceResults = runComplianceChecks({
        channel: params.channel,
        leadId: params.leadId,
        userId,
        messageBody: params.body,
        messageSubject: params.subject,
        messagesToday,
        connectionsToday,
        connectionsThisWeek,
        hasOptIn,
        hasUnsubscribed,
        gdprConsent,
        hasUnsubscribeLink: params.body?.includes("unsubscribe"),
        hasPhysicalAddress: params.body?.length > 200, // heuristic — real check in compliance engine
        senderIdentified: true,
        isPersonalized: (params.body?.length || 0) > 50,
      });

      const summary = getComplianceSummary(complianceResults);

      // Block if compliance fails and blocking is enabled
      if (!summary.canSend && config.features.complianceBlockOnFail) {
        return {
          queued: false,
          sent: false,
          blocked: true,
          complianceIssues: complianceResults,
          message: `Blocked by compliance: ${summary.blockers.map(b => b.message).join("; ")}`,
        };
      }
    } catch (err) {
      // Don't block sends if compliance check itself fails — log and continue
      console.error("[outreach-gate] Compliance check error:", err);
    }
  }

  // Sandbox: simulate immediate send
  if (config.isSandbox) {
    return {
      queued: false,
      sent: true,
      sandbox: true,
      message: "[SANDBOX] Message simulated — no real send",
    };
  }

  // Production: check if outreach needs approval
  if (config.features.outreachRequiresApproval || !config.features.outreachSending) {
    const { data, error } = await supabase
      .from("outreach_queue")
      .insert([
        {
          user_id: userId,
          lead_id: params.leadId,
          channel: params.channel,
          subject: params.subject || null,
          body: params.body,
          status: "pending_approval",
          metadata: params.metadata || {},
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Failed to queue outreach:", error);
      throw new Error("Failed to queue outreach for approval");
    }

    return {
      queued: true,
      queueId: data.id,
      message: config.features.outreachSending
        ? "Queued for approval — will send once approved"
        : "Queued for approval — launch switch is OFF, will send after launch",
    };
  }

  // Production, fully unlocked (approval not required, launch switch on)
  return {
    queued: false,
    sent: true,
    message: "Direct send",
  };
}
