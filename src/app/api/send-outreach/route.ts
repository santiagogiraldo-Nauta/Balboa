import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { insertPlaybookMetric, createSignalAndAction, upsertLead } from "@/lib/db";
import { getLeads } from "@/lib/db";
import { trackEvent } from "@/lib/tracking";

export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { leadId, channel, message, subject } = await req.json();

    if (!leadId || !channel || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Get lead
    const leads = await getLeads(supabase, user.id);
    const lead = leads.find((l) => l.id === leadId);

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Record in playbook metrics
    await insertPlaybookMetric(supabase, user.id, {
      action_type: channel === "email" ? "email_sent" : "linkedin_message",
      channel,
      timing_day: new Date().toLocaleDateString("en-US", { weekday: "long" }),
      timing_hour: new Date().getHours(),
      sequence_number: 1,
      lead_id: leadId,
    });

    // Add to lead's draft messages
    const newDraft: import("@/lib/types").DraftMessage = {
      id: `draft-${Date.now()}`,
      type: "email_followup" as const,
      channel: channel as "email" | "linkedin",
      subject: subject || "",
      body: message,
      status: "sent" as const,
      createdAt: new Date().toISOString(),
      personalization: [],
    };

    const updatedLead = {
      ...lead,
      draftMessages: [...(lead.draftMessages || []), newDraft],
    };

    await upsertLead(supabase, user.id, updatedLead);

    // Track event (fire-and-forget)
    trackEvent(supabase, user.id, {
      eventCategory: "outreach",
      eventAction: "message_sent",
      leadId,
      channel: channel as "email" | "linkedin",
      leadTier: lead.icpScore?.tier,
      leadIndustry: lead.companyIntel?.industry,
      leadPosition: lead.position,
      sequenceNumber: (lead.draftMessages?.filter((d) => d.status === "sent").length || 0) + 1,
      source: "api",
    });

    return NextResponse.json({
      success: true,
      leadId,
      channel,
      message: "Message sent and logged",
    });
  } catch (error) {
    console.error("Send outreach error:", error);
    return NextResponse.json({ error: "Failed to send outreach" }, { status: 500 });
  }
}
