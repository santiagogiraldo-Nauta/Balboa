import { SupabaseClient } from "@supabase/supabase-js";
import type { Lead, ICPScore, CompanyIntel, DraftMessage, TouchpointEvent, ChannelPresence, CallLog, PrepKit, VideoPrep, BattleCard, EmailCampaignEntry, EngagementAction, LinkedInOutreachStage, SupportedLanguage } from "./types";

// ─── Row ↔ Lead mapping ───────────────────────────────────────────

interface LeadRow {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  company: string;
  position: string;
  linkedin_url: string | null;
  linkedin_stage: string;
  icp_score: ICPScore;
  company_intel: CompanyIntel;
  draft_messages: DraftMessage[];
  contact_history: TouchpointEvent[];
  channels: ChannelPresence;
  next_action: string | null;
  next_action_date: string | null;
  follow_up_date: string | null;
  disqualify_reason: string | null;
  source: string;
  raw_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function rowToLead(row: LeadRow): Lead {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    company: row.company,
    position: row.position,
    connectedOn: row.created_at,
    email: row.email || undefined,
    linkedinUrl: row.linkedin_url || undefined,
    icpScore: row.icp_score || { overall: 0, companyFit: 0, roleFit: 0, industryFit: 0, signals: [], tier: "cold" as const },
    status: "new",
    notes: "",
    draftMessages: row.draft_messages || [],
    engagementActions: (row.raw_data?.engagementActions as EngagementAction[]) || [],
    companyIntel: row.company_intel || undefined,
    channels: row.channels || { linkedin: true, email: !!row.email, linkedinConnected: false, emailVerified: false },
    emailCampaigns: (row.raw_data?.emailCampaigns as EmailCampaignEntry[]) || [],
    touchpointTimeline: row.contact_history || [],
    callLogs: (row.raw_data?.callLogs as CallLog[]) || [],
    contactStatus: (row.raw_data?.contactStatus as Lead["contactStatus"]) || "not_contacted",
    nextStep: row.next_action || undefined,
    nextStepDate: row.next_action_date || undefined,
    outreachSource: row.source,
    disqualifyReason: row.disqualify_reason || undefined,
    linkedinStage: (row.linkedin_stage as LinkedInOutreachStage) || "not_connected",
    prepKits: (row.raw_data?.prepKits as PrepKit[]) || [],
    videoPreps: (row.raw_data?.videoPreps as VideoPrep[]) || [],
    battleCards: (row.raw_data?.battleCards as BattleCard[]) || [],
    preferredLanguage: (row.raw_data?.preferredLanguage as SupportedLanguage) || undefined,
    // Carry over any extra fields stored in raw_data
    lastAction: (row.raw_data?.lastAction as string) || undefined,
    lastActionDate: (row.raw_data?.lastActionDate as string) || undefined,
    meetingScheduled: (row.raw_data?.meetingScheduled as boolean) || undefined,
    lastOutreachMethod: (row.raw_data?.lastOutreachMethod as Lead["lastOutreachMethod"]) || undefined,
    emailsSentCount: (row.raw_data?.emailsSentCount as number) || undefined,
    lastEmailSentDate: (row.raw_data?.lastEmailSentDate as string) || undefined,
    emailStatus: (row.raw_data?.emailStatus as Lead["emailStatus"]) || undefined,
  };
}

function leadToRow(userId: string, lead: Lead): Omit<LeadRow, "created_at" | "updated_at"> {
  return {
    id: lead.id,
    user_id: userId,
    first_name: lead.firstName,
    last_name: lead.lastName,
    email: lead.email || null,
    company: lead.company,
    position: lead.position,
    linkedin_url: lead.linkedinUrl || null,
    linkedin_stage: lead.linkedinStage || "not_connected",
    icp_score: lead.icpScore,
    company_intel: lead.companyIntel || ({} as CompanyIntel),
    draft_messages: lead.draftMessages,
    contact_history: lead.touchpointTimeline,
    channels: lead.channels,
    next_action: lead.nextStep || null,
    next_action_date: lead.nextStepDate || null,
    follow_up_date: null,
    disqualify_reason: lead.disqualifyReason || null,
    source: lead.outreachSource || "manual",
    raw_data: {
      engagementActions: lead.engagementActions,
      emailCampaigns: lead.emailCampaigns,
      callLogs: lead.callLogs,
      contactStatus: lead.contactStatus,
      prepKits: lead.prepKits,
      videoPreps: lead.videoPreps,
      battleCards: lead.battleCards,
      preferredLanguage: lead.preferredLanguage,
      lastAction: lead.lastAction,
      lastActionDate: lead.lastActionDate,
      meetingScheduled: lead.meetingScheduled,
      lastOutreachMethod: lead.lastOutreachMethod,
      emailsSentCount: lead.emailsSentCount,
      lastEmailSentDate: lead.lastEmailSentDate,
      emailStatus: lead.emailStatus,
      status: lead.status,
      notes: lead.notes,
    },
  };
}

// ─── Data Access Functions ─────────────────────────────────────────

export async function getLeads(supabase: SupabaseClient, userId: string): Promise<Lead[]> {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching leads:", error);
    return [];
  }

  return (data || []).map((row: LeadRow) => rowToLead(row));
}

export async function upsertLead(supabase: SupabaseClient, userId: string, lead: Lead): Promise<Lead | null> {
  const row = leadToRow(userId, lead);

  const { data, error } = await supabase
    .from("leads")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    console.error("Error upserting lead:", error);
    return null;
  }

  return rowToLead(data as LeadRow);
}

export async function upsertLeads(supabase: SupabaseClient, userId: string, leads: Lead[]): Promise<Lead[]> {
  const rows = leads.map((lead) => leadToRow(userId, lead));

  const { data, error } = await supabase
    .from("leads")
    .upsert(rows, { onConflict: "id" })
    .select();

  if (error) {
    console.error("Error bulk upserting leads:", error);
    return [];
  }

  return (data || []).map((row: LeadRow) => rowToLead(row));
}

export async function deleteLead(supabase: SupabaseClient, userId: string, leadId: string): Promise<boolean> {
  const { error } = await supabase
    .from("leads")
    .delete()
    .eq("id", leadId)
    .eq("user_id", userId);

  if (error) {
    console.error("Error deleting lead:", error);
    return false;
  }

  return true;
}

export async function getProfile(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Error fetching profile:", error);
    return null;
  }

  return data;
}

// === PHASE 2: ACCOUNTS, DEALS, PLAYBOOK ===

export async function getAccounts(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching accounts:", error);
    return [];
  }

  return data || [];
}

export async function getDeals(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching deals:", error);
    return [];
  }

  return data || [];
}

export async function upsertDeal(supabase: SupabaseClient, userId: string, deal: any) {
  const dealData = {
    ...deal,
    user_id: userId,
  };

  const { data, error } = await supabase
    .from("deals")
    .upsert(dealData, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    console.error("Error upserting deal:", error);
    return null;
  }

  return data;
}

export async function updateDealStage(supabase: SupabaseClient, userId: string, dealId: string, newStage: string) {
  const { data, error } = await supabase
    .from("deals")
    .update({ deal_stage: newStage, updated_at: new Date().toISOString() })
    .eq("id", dealId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    console.error("Error updating deal stage:", error);
    return null;
  }

  return data;
}

export async function getSignalsAndActions(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("signals_and_actions")
    .select("*")
    .eq("user_id", userId)
    .eq("action_status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching signals:", error);
    return [];
  }

  return data || [];
}

export async function createSignalAndAction(supabase: SupabaseClient, userId: string, signal: any) {
  const { data, error } = await supabase
    .from("signals_and_actions")
    .insert([{ ...signal, user_id: userId }])
    .select()
    .single();

  if (error) {
    console.error("Error creating signal:", error);
    return null;
  }

  return data;
}

export async function updateSignalStatus(supabase: SupabaseClient, userId: string, signalId: string, status: string) {
  const { data, error } = await supabase
    .from("signals_and_actions")
    .update({ action_status: status, completed_at: status === "completed" ? new Date().toISOString() : null })
    .eq("id", signalId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    console.error("Error updating signal:", error);
    return null;
  }

  return data;
}

export async function getPlaybookMetrics(supabase: SupabaseClient, userId: string, days: number = 90) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("playbook_metrics")
    .select("*")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching playbook metrics:", error);
    return [];
  }

  return data || [];
}

export async function insertPlaybookMetric(supabase: SupabaseClient, userId: string, metric: any) {
  const { data, error } = await supabase
    .from("playbook_metrics")
    .insert([{ ...metric, user_id: userId }])
    .select()
    .single();

  if (error) {
    console.error("Error inserting playbook metric:", error);
    return null;
  }

  return data;
}

export async function getPlaybookMetricsSummary(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("playbook_metrics_summary")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    console.error("Error fetching metrics summary:", error);
    return [];
  }

  return data || [];
}

export async function getDraftTemplates(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("draft_templates")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    console.error("Error fetching templates:", error);
    return [];
  }

  return data || [];
}
