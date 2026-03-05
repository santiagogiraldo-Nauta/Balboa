import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processWebhookEvent, findLeadByPhone, findLeadByEmail } from "@/lib/track-touchpoint";
import { logWebhook } from "@/lib/db-touchpoints";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * POST /api/webhooks/aircall
 *
 * Handles Aircall webhook events:
 * - call.created: Call initiated
 * - call.answered: Call answered
 * - call.hungup: Call ended (one party hung up)
 * - call.ended: Call fully ended (with final duration + recording)
 * - call.commented: Agent added a note to a call
 * - call.tagged: Tag added to a call
 *
 * Aircall payload structure:
 * {
 *   event: "call.ended",
 *   resource: "call",
 *   data: {
 *     id: number,
 *     direction: "inbound" | "outbound",
 *     status: "done" | "no-answer" | "busy" | "failed",
 *     duration: number (seconds),
 *     started_at: number (timestamp),
 *     answered_at: number | null,
 *     ended_at: number (timestamp),
 *     raw_digits: string (phone number),
 *     recording: string | null (URL),
 *     asset: string | null (voicemail URL),
 *     user: { id, name, email },
 *     contact: { id, first_name, last_name, emails, phone_numbers },
 *     tags: string[],
 *     comments: Array<{ id, body, posted_at }>,
 *   }
 * }
 */
export async function POST(req: NextRequest) {
  const supabase = getServiceClient();

  try {
    const payload = await req.json();
    const eventType = payload.event || "unknown";
    const callData = payload.data || {};

    console.log(`[Aircall Webhook] ${eventType}, call ID: ${callData.id}, status: ${callData.status}`);

    // Find the lead by phone number or contact info
    let leadId: string | undefined;
    let userId: string | undefined;

    // Try matching by phone number
    const phoneNumber = callData.raw_digits || callData.number?.digits;
    if (phoneNumber) {
      const lead = await findLeadByPhone(supabase, phoneNumber);
      if (lead) {
        leadId = lead.id;
        userId = lead.user_id;
      }
    }

    // Try matching by Aircall contact email
    if (!leadId && callData.contact?.emails?.length) {
      for (const emailObj of callData.contact.emails) {
        const email = typeof emailObj === "string" ? emailObj : emailObj.value;
        if (email) {
          const lead = await findLeadByEmail(supabase, email);
          if (lead) {
            leadId = lead.id;
            userId = lead.user_id;
            break;
          }
        }
      }
    }

    // Default userId
    if (!userId) {
      const { data: firstUser } = await supabase
        .from("leads")
        .select("user_id")
        .limit(1)
        .single();
      userId = firstUser?.user_id;
    }

    if (!userId) {
      await logWebhook(supabase, "aircall", eventType, payload, false, "No user found");
      return NextResponse.json({ received: true, matched: false });
    }

    const direction = callData.direction === "inbound" ? "inbound" : "outbound";
    const duration = callData.duration || 0;
    const status = callData.status || "unknown";

    switch (eventType) {
      case "call.ended": {
        // Full call processing with recording and duration
        await processWebhookEvent(supabase, "aircall", "call.ended", payload, {
          userId,
          leadId,
          source: "aircall",
          channel: "call",
          eventType: "call_completed",
          direction,
          metadata: {
            aircall_call_id: callData.id,
            duration,
            status,
            recording_url: callData.recording || null,
            voicemail_url: callData.asset || null,
            phone_number: phoneNumber,
            agent_name: callData.user?.name,
            agent_email: callData.user?.email,
            started_at: callData.started_at ? new Date(callData.started_at * 1000).toISOString() : null,
            ended_at: callData.ended_at ? new Date(callData.ended_at * 1000).toISOString() : null,
            tags: callData.tags || [],
            comments: (callData.comments || []).map((c: { body: string }) => c.body),
          },
        });

        // Also log to lead's callLogs if matched
        if (leadId) {
          await addCallToLead(supabase, leadId, {
            aircallId: callData.id,
            direction,
            duration,
            status,
            recording: callData.recording,
            agentName: callData.user?.name,
            startedAt: callData.started_at,
            endedAt: callData.ended_at,
            tags: callData.tags,
            comments: callData.comments,
          });
        }
        break;
      }

      case "call.created": {
        await processWebhookEvent(supabase, "aircall", "call.created", payload, {
          userId,
          leadId,
          source: "aircall",
          channel: "call",
          eventType: "call_initiated",
          direction,
          metadata: {
            aircall_call_id: callData.id,
            phone_number: phoneNumber,
            agent_name: callData.user?.name,
          },
        });
        break;
      }

      case "call.answered": {
        await processWebhookEvent(supabase, "aircall", "call.answered", payload, {
          userId,
          leadId,
          source: "aircall",
          channel: "call",
          eventType: "call_answered",
          direction,
          metadata: {
            aircall_call_id: callData.id,
            phone_number: phoneNumber,
          },
        });
        break;
      }

      case "call.commented": {
        // Agent added notes to the call
        const comment = callData.comment?.body || callData.comments?.[0]?.body;
        if (comment && leadId) {
          await processWebhookEvent(supabase, "aircall", "call.commented", payload, {
            userId,
            leadId,
            source: "aircall",
            channel: "call",
            eventType: "note_added",
            metadata: {
              aircall_call_id: callData.id,
              note: comment,
            },
          });
        }
        break;
      }

      default: {
        await logWebhook(supabase, "aircall", eventType, payload);
      }
    }

    return NextResponse.json({ received: true, matched: !!leadId });
  } catch (error) {
    console.error("[Aircall Webhook] Error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

// ─── Add call to lead's callLogs ─────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function addCallToLead(
  supabase: any,
  leadId: string,
  callInfo: {
    aircallId: number;
    direction: string;
    duration: number;
    status: string;
    recording?: string;
    agentName?: string;
    startedAt?: number;
    endedAt?: number;
    tags?: string[];
    comments?: Array<{ body: string }>;
  }
) {
  try {
    const { data: lead } = await supabase
      .from("leads")
      .select("raw_data")
      .eq("id", leadId)
      .single();

    if (!lead) return;

    const rawData = (lead.raw_data || {}) as Record<string, unknown>;
    const callLogs = (rawData.callLogs || []) as Array<Record<string, unknown>>;

    const newCall = {
      id: `aircall_${callInfo.aircallId}`,
      leadId,
      callLink: callInfo.recording || undefined,
      platform: "phone" as const,
      date: callInfo.startedAt
        ? new Date(callInfo.startedAt * 1000).toISOString()
        : new Date().toISOString(),
      duration: `${Math.floor(callInfo.duration / 60)}m ${callInfo.duration % 60}s`,
      notes: (callInfo.comments || []).map((c) => c.body).join("\n") || "",
      outcomes: [] as Array<Record<string, unknown>>,
      generatedDrafts: [] as string[],
      generatedReminders: [] as string[],
    };

    // Determine call outcome
    if (callInfo.status === "done" && callInfo.duration > 30) {
      newCall.outcomes.push({
        type: "schedule_followup",
        description: `Call connected (${Math.floor(callInfo.duration / 60)} min). Follow up.`,
        completed: false,
      });
    } else if (callInfo.status === "no-answer") {
      newCall.outcomes.push({
        type: "custom",
        description: "No answer — try again later or leave voicemail.",
        completed: false,
      });
    }

    // Prepend (most recent first), keep max 50
    callLogs.unshift(newCall);
    rawData.callLogs = callLogs.slice(0, 50);
    rawData.lastOutreachMethod = "call";
    rawData.lastAction = callInfo.status === "done" ? "Call completed" : `Call (${callInfo.status})`;
    rawData.lastActionDate = new Date().toISOString();

    await supabase
      .from("leads")
      .update({ raw_data: rawData })
      .eq("id", leadId);
  } catch (error) {
    console.error("[Aircall] Error adding call to lead:", error);
  }
}
