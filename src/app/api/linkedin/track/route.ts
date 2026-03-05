import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processWebhookEvent, findLeadByLinkedIn, findLeadByEmail } from "@/lib/track-touchpoint";
import { logWebhook } from "@/lib/db-touchpoints";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * POST /api/linkedin/track
 *
 * Receives LinkedIn activity data from Apify scrapers via n8n.
 * Called on a schedule (every 15-30 min) by n8n workflow.
 *
 * Supported activity types:
 * - connection_accepted: Lead accepted our connection request
 * - message_reply: Lead replied to our LinkedIn message
 * - profile_view: Lead viewed our profile
 * - post_engagement: Lead engaged with our post (like, comment, share)
 * - connection_sent: We sent a connection request
 * - message_sent: We sent a LinkedIn message
 *
 * Expected payload:
 * {
 *   activities: [
 *     {
 *       type: "connection_accepted",
 *       linkedin_url: "linkedin.com/in/...",
 *       email?: "...",
 *       name?: "First Last",
 *       company?: "...",
 *       timestamp: "2024-...",
 *       details?: { ... }
 *     }
 *   ]
 * }
 */
export async function POST(req: NextRequest) {
  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ received: true, error: "Service not configured" });
  }

  try {
    const payload = await req.json();
    const activities = payload.activities || payload.data || [];

    if (!Array.isArray(activities) || activities.length === 0) {
      return NextResponse.json({ error: "No activities provided" }, { status: 400 });
    }

    console.log(`[LinkedIn Track] Processing ${activities.length} activities`);

    let matched = 0;
    let processed = 0;

    for (const activity of activities) {
      const linkedinUrl = activity.linkedin_url || activity.profileUrl || activity.url;
      const email = activity.email;
      const activityType = activity.type || "unknown";

      // Find the lead
      let leadId: string | undefined;
      let userId: string | undefined;

      if (linkedinUrl) {
        const lead = await findLeadByLinkedIn(supabase, linkedinUrl);
        if (lead) {
          leadId = lead.id;
          userId = lead.user_id;
        }
      }

      if (!leadId && email) {
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

      if (!userId) {
        console.warn(`[LinkedIn Track] Skipping unmatched activity: ${activityType} for ${linkedinUrl || email || "unknown"}`);
        continue;
      }

      if (leadId) matched++;

      // Map activity type to touchpoint
      switch (activityType) {
        case "connection_accepted": {
          await processWebhookEvent(supabase, "linkedin", "connection_accepted", activity, {
            userId,
            leadId,
            source: "linkedin",
            channel: "linkedin",
            eventType: "connection_accepted",
            direction: "inbound",
            metadata: {
              linkedin_url: linkedinUrl,
              name: activity.name,
              company: activity.company,
            },
          });

          // Update lead's LinkedIn stage
          if (leadId) {
            await supabase
              .from("leads")
              .update({ linkedin_stage: "connected" })
              .eq("id", leadId);
          }
          processed++;
          break;
        }

        case "message_reply": {
          await processWebhookEvent(supabase, "linkedin", "message_reply", activity, {
            userId,
            leadId,
            source: "linkedin",
            channel: "linkedin",
            eventType: "replied",
            direction: "inbound",
            bodyPreview: (activity.message || activity.body || "").slice(0, 200),
            metadata: {
              linkedin_url: linkedinUrl,
              name: activity.name,
            },
            sentiment: activity.sentiment || "neutral",
          });

          // Update lead's LinkedIn stage
          if (leadId) {
            await supabase
              .from("leads")
              .update({ linkedin_stage: "dm_replied" })
              .eq("id", leadId);
          }
          processed++;
          break;
        }

        case "profile_view": {
          await processWebhookEvent(supabase, "linkedin", "profile_view", activity, {
            userId,
            leadId,
            source: "linkedin",
            channel: "linkedin",
            eventType: "profile_viewed",
            direction: "inbound",
            metadata: {
              linkedin_url: linkedinUrl,
              name: activity.name,
              company: activity.company,
              title: activity.title,
            },
          });
          processed++;
          break;
        }

        case "post_engagement": {
          const engagementType = activity.engagement_type || "like"; // like, comment, share
          await processWebhookEvent(supabase, "linkedin", "post_engagement", activity, {
            userId,
            leadId,
            source: "linkedin",
            channel: "linkedin",
            eventType: `post_${engagementType}`,
            direction: "inbound",
            metadata: {
              linkedin_url: linkedinUrl,
              engagement_type: engagementType,
              post_url: activity.post_url,
              comment_text: activity.comment_text,
            },
          });

          // Update LinkedIn stage if not already engaged
          if (leadId) {
            const { data: lead } = await supabase
              .from("leads")
              .select("linkedin_stage")
              .eq("id", leadId)
              .single();

            if (lead && ["not_connected", "connection_sent"].includes(lead.linkedin_stage)) {
              await supabase
                .from("leads")
                .update({ linkedin_stage: "engaged" })
                .eq("id", leadId);
            }
          }
          processed++;
          break;
        }

        case "connection_sent": {
          await processWebhookEvent(supabase, "linkedin", "connection_sent", activity, {
            userId,
            leadId,
            source: "linkedin",
            channel: "linkedin",
            eventType: "connection_sent",
            direction: "outbound",
            metadata: {
              linkedin_url: linkedinUrl,
              note: activity.note || activity.message,
            },
          });

          if (leadId) {
            await supabase
              .from("leads")
              .update({ linkedin_stage: "connection_sent" })
              .eq("id", leadId);
          }
          processed++;
          break;
        }

        case "message_sent": {
          await processWebhookEvent(supabase, "linkedin", "message_sent", activity, {
            userId,
            leadId,
            source: "linkedin",
            channel: "linkedin",
            eventType: "sent",
            direction: "outbound",
            bodyPreview: (activity.message || "").slice(0, 200),
            metadata: {
              linkedin_url: linkedinUrl,
            },
          });

          if (leadId) {
            await supabase
              .from("leads")
              .update({ linkedin_stage: "dm_sent" })
              .eq("id", leadId);
          }
          processed++;
          break;
        }

        default: {
          await logWebhook(supabase, "linkedin", activityType, activity);
          processed++;
        }
      }
    }

    return NextResponse.json({
      received: true,
      total: activities.length,
      processed,
      matched,
    });
  } catch (error) {
    console.error("[LinkedIn Track] Error:", error);
    return NextResponse.json(
      { error: "Processing failed" },
      { status: 500 }
    );
  }
}
