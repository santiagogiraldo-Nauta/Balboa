// Outreach safety gate — routes outreach through approval queue in production
import { SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

export type OutreachStatus = "pending_approval" | "approved" | "rejected" | "sent" | "cancelled";

export interface QueueResult {
  queued: boolean;
  queueId?: string;
  sent?: boolean;
  sandbox?: boolean;
  message?: string;
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
