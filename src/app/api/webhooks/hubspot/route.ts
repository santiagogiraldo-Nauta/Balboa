import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processWebhookEvent, findLeadByEmail } from "@/lib/track-touchpoint";
import { logWebhook } from "@/lib/db-touchpoints";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * POST /api/webhooks/hubspot
 *
 * Handles HubSpot webhook events:
 * - contact.propertyChange: Contact property updated
 * - deal.propertyChange: Deal stage changed
 * - email events: open, click, reply, bounce (from HubSpot sequences)
 *
 * HubSpot sends an array of events in each webhook call.
 */
export async function POST(req: NextRequest) {
  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ received: true, error: "Service not configured" });
  }

  try {
    const payload = await req.json();

    // HubSpot sends arrays of events
    const events = Array.isArray(payload) ? payload : [payload];

    console.log(`[HubSpot Webhook] Received ${events.length} events`);

    let processed = 0;

    for (const event of events) {
      const eventType = event.subscriptionType || event.eventType || "unknown";
      const objectType = event.objectType || "";
      const propertyName = event.propertyName || "";

      // Try to find the lead via email
      let leadId: string | undefined;
      let userId: string | undefined;
      const email = event.properties?.email || event.propertyValue;

      if (email && email.includes("@")) {
        const lead = await findLeadByEmail(supabase, email);
        if (lead) {
          leadId = lead.id;
          userId = lead.user_id;
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

      if (!userId) continue;

      // Process by event type
      if (eventType.includes("contact") && propertyName === "lifecyclestage") {
        // Contact lifecycle stage change
        await processWebhookEvent(supabase, "hubspot", "contact.stage_change", event, {
          userId,
          leadId,
          source: "hubspot",
          channel: "email",
          eventType: "stage_change",
          metadata: {
            hubspot_object_id: event.objectId,
            property: propertyName,
            old_value: event.previousValue,
            new_value: event.propertyValue,
          },
        });
        processed++;
      } else if (eventType.includes("deal") && propertyName === "dealstage") {
        // Deal stage change
        await processWebhookEvent(supabase, "hubspot", "deal.stage_change", event, {
          userId,
          leadId,
          source: "hubspot",
          channel: "email",
          eventType: "deal_stage_change",
          metadata: {
            hubspot_deal_id: event.objectId,
            old_stage: event.previousValue,
            new_stage: event.propertyValue,
          },
        });

        // Sync deal stage to our deals table
        if (event.objectId) {
          await supabase
            .from("deals")
            .update({
              deal_stage: mapHubSpotDealStage(event.propertyValue),
              updated_at: new Date().toISOString(),
            })
            .eq("hubspot_deal_id", String(event.objectId));
        }
        processed++;
      } else if (eventType === "email.open" || event.eventType === "OPEN") {
        // Email opened
        await processWebhookEvent(supabase, "hubspot", "email.open", event, {
          userId,
          leadId,
          source: "hubspot",
          channel: "email",
          eventType: "opened",
          direction: "outbound",
          subject: event.subject || event.emailSubject,
          metadata: {
            hubspot_email_id: event.emailId,
            hubspot_sequence_id: event.sequenceId,
            open_count: event.openCount || 1,
          },
        });
        processed++;
      } else if (eventType === "email.click" || event.eventType === "CLICK") {
        // Email link clicked
        await processWebhookEvent(supabase, "hubspot", "email.click", event, {
          userId,
          leadId,
          source: "hubspot",
          channel: "email",
          eventType: "clicked",
          direction: "outbound",
          subject: event.subject || event.emailSubject,
          metadata: {
            hubspot_email_id: event.emailId,
            link_url: event.url || event.linkUrl,
          },
        });
        processed++;
      } else if (eventType === "email.reply" || event.eventType === "REPLY") {
        // Email reply received
        await processWebhookEvent(supabase, "hubspot", "email.reply", event, {
          userId,
          leadId,
          source: "hubspot",
          channel: "email",
          eventType: "replied",
          direction: "inbound",
          subject: event.subject || event.emailSubject,
          bodyPreview: (event.body || event.textBody || "").slice(0, 200),
          metadata: {
            hubspot_email_id: event.emailId,
            hubspot_sequence_id: event.sequenceId,
          },
          sentiment: "neutral", // HubSpot doesn't provide sentiment
        });
        processed++;
      } else if (eventType === "email.bounce" || event.eventType === "BOUNCE") {
        // Email bounced
        await processWebhookEvent(supabase, "hubspot", "email.bounce", event, {
          userId,
          leadId,
          source: "hubspot",
          channel: "email",
          eventType: "bounced",
          direction: "outbound",
          subject: event.subject || event.emailSubject,
          metadata: {
            bounce_type: event.bounceType || event.category,
          },
        });
        processed++;
      } else if (eventType === "email.sent" || event.eventType === "SENT") {
        // Email sent via sequence
        await processWebhookEvent(supabase, "hubspot", "email.sent", event, {
          userId,
          leadId,
          source: "hubspot",
          channel: "email",
          eventType: "sent",
          direction: "outbound",
          subject: event.subject || event.emailSubject,
          metadata: {
            hubspot_email_id: event.emailId,
            hubspot_sequence_id: event.sequenceId,
            step: event.step,
          },
        });
        processed++;
      } else {
        // Log unhandled event types
        await logWebhook(supabase, "hubspot", eventType, event);
      }
    }

    return NextResponse.json({ received: true, processed });
  } catch (error) {
    console.error("[HubSpot Webhook] Error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function mapHubSpotDealStage(hubspotStage: string): string {
  const stageMap: Record<string, string> = {
    appointmentscheduled: "qualification",
    qualifiedtobuy: "qualification",
    presentationscheduled: "proposal",
    decisionmakerboughtin: "proposal",
    contractsent: "negotiation",
    closedwon: "closed_won",
    closedlost: "closed_lost",
  };

  return stageMap[hubspotStage?.toLowerCase()] || hubspotStage || "qualification";
}
