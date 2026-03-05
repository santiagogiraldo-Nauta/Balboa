import { SupabaseClient } from "@supabase/supabase-js";
import { insertTouchpointEvent, insertDailyAction, logWebhook } from "./db-touchpoints";

// ─── Types ────────────────────────────────────────────────────────

export interface TrackTouchpointInput {
  userId: string;
  leadId?: string;
  source: string; // 'amplemarket', 'hubspot', 'aircall', 'gmail', 'linkedin', 'manual'
  channel: string; // 'email', 'call', 'linkedin', 'meeting'
  eventType: string; // 'sent', 'opened', 'clicked', 'replied', 'bounced', 'call_completed', etc.
  direction?: string; // 'inbound' or 'outbound'
  subject?: string;
  bodyPreview?: string;
  metadata?: Record<string, unknown>;
  sentiment?: string; // 'positive', 'negative', 'neutral'
}

// ─── Main Tracking Function ─────────────────────────────────────

/**
 * Universal touchpoint tracking function.
 * Used by ALL webhook handlers and manual actions.
 *
 * 1. Inserts into touchpoint_events table
 * 2. Updates lead's touchpointTimeline (in raw_data)
 * 3. Checks for signal-worthy patterns
 * 4. Auto-creates daily_actions if needed
 */
export async function trackTouchpoint(
  supabase: SupabaseClient,
  input: TrackTouchpointInput
): Promise<{ success: boolean; touchpointId?: string; actionsCreated?: number }> {
  try {
    // 1. Insert touchpoint event
    const touchpoint = await insertTouchpointEvent(supabase, {
      user_id: input.userId,
      lead_id: input.leadId || null,
      source: input.source,
      channel: input.channel,
      event_type: input.eventType,
      direction: input.direction || null,
      subject: input.subject || null,
      body_preview: input.bodyPreview || null,
      metadata: input.metadata || {},
      sentiment: input.sentiment || null,
    });

    if (!touchpoint) {
      return { success: false };
    }

    // 2. Update lead's touchpointTimeline if we have a leadId
    if (input.leadId) {
      await updateLeadTimeline(supabase, input);
    }

    // 3. Check for signal-worthy patterns and create daily actions
    let actionsCreated = 0;
    if (input.leadId) {
      actionsCreated = await checkForSignals(supabase, input);
    }

    return {
      success: true,
      touchpointId: touchpoint.id,
      actionsCreated,
    };
  } catch (error) {
    console.error("[track-touchpoint] Error:", error);
    return { success: false };
  }
}

// ─── Lead Timeline Update ────────────────────────────────────────

async function updateLeadTimeline(
  supabase: SupabaseClient,
  input: TrackTouchpointInput
): Promise<void> {
  if (!input.leadId) return;

  try {
    // Fetch current lead
    const { data: lead } = await supabase
      .from("leads")
      .select("contact_history, raw_data")
      .eq("id", input.leadId)
      .single();

    if (!lead) return;

    const timeline = (lead.contact_history || []) as Array<Record<string, unknown>>;
    const newEvent = {
      id: `tp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      channel: input.channel,
      type: input.eventType,
      description: buildDescription(input),
      date: new Date().toISOString(),
      metadata: {
        source: input.source,
        direction: input.direction,
        sentiment: input.sentiment,
        ...input.metadata,
      },
    };

    // Prepend new event (most recent first), keep max 100
    const updatedTimeline = [newEvent, ...timeline].slice(0, 100);

    // Also update contactStatus and lastOutreachMethod
    const rawData = (lead.raw_data || {}) as Record<string, unknown>;
    const updates: Record<string, unknown> = {
      contact_history: updatedTimeline,
    };

    // Update outreach tracking fields
    if (input.eventType === "replied" && input.direction === "inbound") {
      rawData.contactStatus = input.sentiment === "positive" ? "positive" : "neutral";
      rawData.lastAction = "Received reply";
      rawData.lastActionDate = new Date().toISOString();
    } else if (input.eventType === "sent" && input.direction === "outbound") {
      if (rawData.contactStatus === "not_contacted") {
        rawData.contactStatus = "neutral";
      }
      rawData.lastAction = `Sent ${input.channel}`;
      rawData.lastActionDate = new Date().toISOString();
      rawData.lastOutreachMethod = input.channel;
    } else if (input.eventType === "call_completed") {
      rawData.lastAction = "Call completed";
      rawData.lastActionDate = new Date().toISOString();
      rawData.lastOutreachMethod = "call";
    } else if (input.eventType === "meeting_held") {
      rawData.lastAction = "Meeting held";
      rawData.lastActionDate = new Date().toISOString();
      rawData.meetingScheduled = false; // Meeting happened
    }

    updates.raw_data = rawData;

    await supabase
      .from("leads")
      .update(updates)
      .eq("id", input.leadId);
  } catch (error) {
    console.error("[track-touchpoint] Error updating lead timeline:", error);
  }
}

// ─── Signal Detection ────────────────────────────────────────────

async function checkForSignals(
  supabase: SupabaseClient,
  input: TrackTouchpointInput
): Promise<number> {
  let actionsCreated = 0;

  // Signal 1: Positive reply → urgent follow-up
  if (input.eventType === "replied" && input.sentiment === "positive") {
    await insertDailyAction(supabase, {
      user_id: input.userId,
      lead_id: input.leadId || null,
      action_type: "hot_signal",
      priority: "urgent",
      channel: input.channel,
      reason: `Positive reply received via ${input.channel}. Strike while the iron is hot.`,
      suggested_message: null,
      status: "pending",
      due_date: new Date().toISOString().split("T")[0],
    });
    actionsCreated++;
  }

  // Signal 2: Any reply → follow-up within 24h
  if (input.eventType === "replied" && input.sentiment !== "positive") {
    await insertDailyAction(supabase, {
      user_id: input.userId,
      lead_id: input.leadId || null,
      action_type: "reply_needed",
      priority: "high",
      channel: input.channel,
      reason: `Reply received via ${input.channel}. Respond within 24 hours.`,
      suggested_message: null,
      status: "pending",
      due_date: new Date().toISOString().split("T")[0],
    });
    actionsCreated++;
  }

  // Signal 3: Email opened multiple times (tracked via metadata)
  if (input.eventType === "opened" && input.metadata?.openCount && (input.metadata.openCount as number) >= 3) {
    await insertDailyAction(supabase, {
      user_id: input.userId,
      lead_id: input.leadId || null,
      action_type: "hot_signal",
      priority: "high",
      channel: "email",
      reason: `Email opened ${input.metadata.openCount} times. High interest — consider a follow-up call.`,
      suggested_message: null,
      status: "pending",
      due_date: new Date().toISOString().split("T")[0],
    });
    actionsCreated++;
  }

  // Signal 4: Call connected with duration > 2 min
  if (input.eventType === "call_completed" && input.metadata?.duration) {
    const duration = input.metadata.duration as number;
    if (duration > 120) {
      await insertDailyAction(supabase, {
        user_id: input.userId,
        lead_id: input.leadId || null,
        action_type: "follow_up",
        priority: "high",
        channel: "email",
        reason: `Call lasted ${Math.round(duration / 60)} minutes. Send a follow-up email summarizing key points.`,
        suggested_message: null,
        status: "pending",
        due_date: new Date().toISOString().split("T")[0],
      });
      actionsCreated++;
    }
  }

  // Signal 5: Meeting booked → create prep action
  if (input.eventType === "meeting_booked") {
    await insertDailyAction(supabase, {
      user_id: input.userId,
      lead_id: input.leadId || null,
      action_type: "hot_signal",
      priority: "urgent",
      channel: null,
      reason: `Meeting booked. Prepare by reviewing lead profile, company intel, and creating a prep kit.`,
      suggested_message: null,
      status: "pending",
      due_date: input.metadata?.meetingDate as string || new Date().toISOString().split("T")[0],
    });
    actionsCreated++;
  }

  // Signal 6: LinkedIn connection accepted → send first message
  if (input.eventType === "connection_accepted" && input.channel === "linkedin") {
    await insertDailyAction(supabase, {
      user_id: input.userId,
      lead_id: input.leadId || null,
      action_type: "first_touch",
      priority: "high",
      channel: "linkedin",
      reason: `LinkedIn connection accepted. Send a personalized first message within 24 hours.`,
      suggested_message: null,
      status: "pending",
      due_date: new Date().toISOString().split("T")[0],
    });
    actionsCreated++;
  }

  // Signal 7: Bounce → mark and alert
  if (input.eventType === "bounced") {
    await insertDailyAction(supabase, {
      user_id: input.userId,
      lead_id: input.leadId || null,
      action_type: "stale_lead",
      priority: "medium",
      channel: "email",
      reason: `Email bounced. Verify email address or try LinkedIn outreach instead.`,
      suggested_message: null,
      status: "pending",
      due_date: new Date().toISOString().split("T")[0],
    });
    actionsCreated++;

    // Update lead email status
    if (input.leadId) {
      const { data: lead } = await supabase
        .from("leads")
        .select("raw_data")
        .eq("id", input.leadId)
        .single();
      if (lead) {
        const rawData = (lead.raw_data || {}) as Record<string, unknown>;
        rawData.emailStatus = "bounced";
        await supabase.from("leads").update({ raw_data: rawData }).eq("id", input.leadId);
      }
    }
  }

  return actionsCreated;
}

// ─── Helpers ─────────────────────────────────────────────────────

function buildDescription(input: TrackTouchpointInput): string {
  const dir = input.direction === "inbound" ? "Received" : "Sent";
  const ch = input.channel.charAt(0).toUpperCase() + input.channel.slice(1);

  switch (input.eventType) {
    case "sent":
      return `${ch} sent${input.subject ? `: ${input.subject}` : ""}`;
    case "opened":
      return `${ch} opened${input.subject ? `: ${input.subject}` : ""}`;
    case "clicked":
      return `Link clicked in ${ch.toLowerCase()}`;
    case "replied":
      return `${dir} ${ch.toLowerCase()} reply${input.sentiment ? ` (${input.sentiment})` : ""}`;
    case "bounced":
      return `${ch} bounced`;
    case "call_completed":
      return `Call completed (${input.metadata?.duration ? Math.round((input.metadata.duration as number) / 60) + " min" : "unknown duration"})`;
    case "meeting_held":
      return `Meeting held`;
    case "meeting_booked":
      return `Meeting booked`;
    case "connection_accepted":
      return `LinkedIn connection accepted`;
    case "connection_sent":
      return `LinkedIn connection request sent`;
    case "enriched":
      return `Lead enriched via ${input.source}`;
    default:
      return `${ch} ${input.eventType}`;
  }
}

// ─── Batch Webhook Processor ─────────────────────────────────────

/**
 * Process a webhook payload by logging it and tracking the touchpoint.
 * Used by all webhook route handlers.
 */
export async function processWebhookEvent(
  supabase: SupabaseClient,
  source: string,
  eventType: string,
  payload: unknown,
  touchpointInput: TrackTouchpointInput
): Promise<{ success: boolean; touchpointId?: string }> {
  // Log the raw webhook
  await logWebhook(supabase, source, eventType, payload);

  // Track the touchpoint
  const result = await trackTouchpoint(supabase, touchpointInput);

  // Mark webhook as processed
  if (result.success) {
    // Update the latest webhook log entry
    await supabase
      .from("webhook_log")
      .update({ processed: true })
      .eq("source", source)
      .eq("event_type", eventType)
      .order("created_at", { ascending: false })
      .limit(1);
  }

  return result;
}

// ─── Lead Lookup Helpers ─────────────────────────────────────────

/**
 * Find a lead by email address
 */
export async function findLeadByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<{ id: string; user_id: string } | null> {
  const { data, error } = await supabase
    .from("leads")
    .select("id, user_id")
    .eq("email", email.toLowerCase())
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

/**
 * Find a lead by phone number (stored in metadata/raw_data)
 */
export async function findLeadByPhone(
  supabase: SupabaseClient,
  phone: string
): Promise<{ id: string; user_id: string } | null> {
  // Normalize phone: remove all non-digits
  const normalized = phone.replace(/\D/g, "");
  const shortPhone = normalized.slice(-10); // Last 10 digits

  // Search in raw_data for phone matches
  const { data, error } = await supabase
    .from("leads")
    .select("id, user_id, raw_data")
    .limit(100);

  if (error || !data) return null;

  // Check raw_data for phone number
  for (const lead of data) {
    const raw = (lead.raw_data || {}) as Record<string, unknown>;
    const leadPhone = ((raw.phone as string) || "").replace(/\D/g, "");
    if (leadPhone && leadPhone.slice(-10) === shortPhone) {
      return { id: lead.id, user_id: lead.user_id };
    }
  }

  return null;
}

/**
 * Find a lead by LinkedIn URL
 */
export async function findLeadByLinkedIn(
  supabase: SupabaseClient,
  linkedinUrl: string
): Promise<{ id: string; user_id: string } | null> {
  // Normalize LinkedIn URL
  const normalized = linkedinUrl
    .replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, "")
    .replace(/\/$/, "")
    .toLowerCase();

  const { data, error } = await supabase
    .from("leads")
    .select("id, user_id, linkedin_url")
    .not("linkedin_url", "is", null)
    .limit(500);

  if (error || !data) return null;

  for (const lead of data) {
    const leadNorm = (lead.linkedin_url || "")
      .replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, "")
      .replace(/\/$/, "")
      .toLowerCase();
    if (leadNorm === normalized) {
      return { id: lead.id, user_id: lead.user_id };
    }
  }

  return null;
}
