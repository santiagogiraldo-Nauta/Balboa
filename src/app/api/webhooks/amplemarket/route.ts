import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processWebhookEvent, findLeadByEmail } from "@/lib/track-touchpoint";
import { findEnrollmentByLeadAndSequence, updateSequenceEnrollment } from "@/lib/db-touchpoints";

// Use service role for webhook processing (unauthenticated)
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * POST /api/webhooks/amplemarket
 *
 * Handles Amplemarket webhook events:
 * - reply: Lead replied to a sequence email (includes sentiment)
 * - stage_change: Lead moved to a new sequence stage
 * - bounce: Email bounced
 * - email_sent: Email was sent from a sequence
 * - call_completed: Call was completed via Amplemarket
 */
export async function POST(req: NextRequest) {
  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ received: true, error: "Service not configured" });
  }

  try {
    const payload = await req.json();
    const eventType = payload.event || payload.type || "unknown";

    console.log("[Amplemarket Webhook]", eventType, JSON.stringify(payload).slice(0, 500));

    // Extract common fields
    const email = payload.data?.email || payload.data?.lead?.email || payload.data?.contact?.email;
    const sequenceId = payload.data?.sequence_id || payload.data?.sequence?.id;

    // Try to find the lead
    let leadId: string | undefined;
    let userId: string | undefined;

    if (email) {
      const lead = await findLeadByEmail(supabase, email);
      if (lead) {
        leadId = lead.id;
        userId = lead.user_id;
      }
    }

    // Default userId — fall back to first user if we can't match
    if (!userId) {
      const { data: firstUser } = await supabase
        .from("leads")
        .select("user_id")
        .limit(1)
        .single();
      userId = firstUser?.user_id;
    }

    if (!userId) {
      console.warn("[Amplemarket Webhook] No user found for event:", eventType);
      return NextResponse.json({ received: true, matched: false });
    }

    switch (eventType) {
      case "reply":
      case "email_reply": {
        const sentiment = payload.data?.sentiment || "neutral";
        await processWebhookEvent(supabase, "amplemarket", eventType, payload, {
          userId,
          leadId,
          source: "amplemarket",
          channel: "email",
          eventType: "replied",
          direction: "inbound",
          subject: payload.data?.subject,
          bodyPreview: (payload.data?.body || "").slice(0, 200),
          metadata: {
            amplemarket_sequence_id: sequenceId,
            amplemarket_step: payload.data?.step,
            original_event: eventType,
          },
          sentiment,
        });

        // Update sequence enrollment status
        if (leadId && sequenceId) {
          const enrollment = await findEnrollmentByLeadAndSequence(supabase, leadId, sequenceId);
          if (enrollment) {
            await updateSequenceEnrollment(supabase, enrollment.id, {
              status: "replied",
              last_step_at: new Date().toISOString(),
            });
          }
        }
        break;
      }

      case "stage_change":
      case "sequence_step": {
        const newStep = payload.data?.step || payload.data?.stage || 1;
        await processWebhookEvent(supabase, "amplemarket", eventType, payload, {
          userId,
          leadId,
          source: "amplemarket",
          channel: "email",
          eventType: "stage_change",
          direction: "outbound",
          metadata: {
            amplemarket_sequence_id: sequenceId,
            new_step: newStep,
            step_type: payload.data?.step_type,
          },
        });

        // Update enrollment
        if (leadId && sequenceId) {
          const enrollment = await findEnrollmentByLeadAndSequence(supabase, leadId, sequenceId);
          if (enrollment) {
            await updateSequenceEnrollment(supabase, enrollment.id, {
              current_step: newStep,
              last_step_at: new Date().toISOString(),
            });
          }
        }
        break;
      }

      case "bounce":
      case "email_bounce": {
        await processWebhookEvent(supabase, "amplemarket", eventType, payload, {
          userId,
          leadId,
          source: "amplemarket",
          channel: "email",
          eventType: "bounced",
          direction: "outbound",
          subject: payload.data?.subject,
          metadata: {
            bounce_type: payload.data?.bounce_type,
            amplemarket_sequence_id: sequenceId,
          },
        });

        // Update enrollment
        if (leadId && sequenceId) {
          const enrollment = await findEnrollmentByLeadAndSequence(supabase, leadId, sequenceId);
          if (enrollment) {
            await updateSequenceEnrollment(supabase, enrollment.id, {
              status: "bounced",
            });
          }
        }
        break;
      }

      case "email_sent": {
        await processWebhookEvent(supabase, "amplemarket", eventType, payload, {
          userId,
          leadId,
          source: "amplemarket",
          channel: "email",
          eventType: "sent",
          direction: "outbound",
          subject: payload.data?.subject,
          bodyPreview: (payload.data?.body || "").slice(0, 200),
          metadata: {
            amplemarket_sequence_id: sequenceId,
            step: payload.data?.step,
          },
        });
        break;
      }

      case "call_completed": {
        await processWebhookEvent(supabase, "amplemarket", eventType, payload, {
          userId,
          leadId,
          source: "amplemarket",
          channel: "call",
          eventType: "call_completed",
          direction: "outbound",
          metadata: {
            duration: payload.data?.duration,
            recording_url: payload.data?.recording_url,
            outcome: payload.data?.outcome,
          },
        });
        break;
      }

      default: {
        // Log unhandled events for future processing
        await processWebhookEvent(supabase, "amplemarket", eventType, payload, {
          userId,
          leadId,
          source: "amplemarket",
          channel: "email",
          eventType: eventType,
          metadata: { raw: true },
        });
      }
    }

    return NextResponse.json({ received: true, matched: !!leadId });
  } catch (error) {
    console.error("[Amplemarket Webhook] Error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
