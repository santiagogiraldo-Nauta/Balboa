// Database operations for LinkedIn conversation filtering
import { SupabaseClient } from "@supabase/supabase-js";
import type {
  LinkedInConversation,
  LinkedInFilterRule,
  LinkedInFilterAuditEntry,
  ConversationClassification,
  ClassificationMethod,
  AuditAction,
} from "./types-linkedin";

// ==========================================
// CONVERSATIONS
// ==========================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToConversation(row: any): LinkedInConversation {
  return {
    id: row.id,
    userId: row.user_id,
    leadId: row.lead_id || undefined,
    linkedinThreadId: row.linkedin_thread_id,
    participantName: row.participant_name,
    participantUrl: row.participant_url || undefined,
    classification: row.classification,
    classificationMethod: row.classification_method || undefined,
    classificationReason: row.classification_reason || undefined,
    classificationConfidence: row.classification_confidence != null ? Number(row.classification_confidence) : undefined,
    isExcluded: row.is_excluded,
    lastMessagePreview: row.last_message_preview || undefined,
    lastMessageDate: row.last_message_date || undefined,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getConversations(
  supabase: SupabaseClient,
  userId: string,
  classification?: ConversationClassification
): Promise<LinkedInConversation[]> {
  let query = supabase
    .from("linkedin_conversations")
    .select("*")
    .eq("user_id", userId)
    .order("last_message_date", { ascending: false, nullsFirst: false });

  if (classification) {
    query = query.eq("classification", classification);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Failed to fetch conversations:", error);
    return [];
  }
  return (data || []).map(rowToConversation);
}

export async function createConversation(
  supabase: SupabaseClient,
  userId: string,
  conversation: {
    linkedinThreadId: string;
    participantName: string;
    participantUrl?: string;
    classification?: ConversationClassification;
    classificationMethod?: ClassificationMethod;
    classificationReason?: string;
    classificationConfidence?: number;
    lastMessagePreview?: string;
    lastMessageDate?: string;
    leadId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<LinkedInConversation | null> {
  const { data, error } = await supabase
    .from("linkedin_conversations")
    .insert([{
      user_id: userId,
      lead_id: conversation.leadId || null,
      linkedin_thread_id: conversation.linkedinThreadId,
      participant_name: conversation.participantName,
      participant_url: conversation.participantUrl || null,
      classification: conversation.classification || "unclassified",
      classification_method: conversation.classificationMethod || null,
      classification_reason: conversation.classificationReason || null,
      classification_confidence: conversation.classificationConfidence || null,
      last_message_preview: conversation.lastMessagePreview || null,
      last_message_date: conversation.lastMessageDate || null,
      metadata: conversation.metadata || {},
    }])
    .select()
    .single();

  if (error) {
    console.error("Failed to create conversation:", error);
    return null;
  }
  return rowToConversation(data);
}

export async function updateConversationClassification(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  classification: ConversationClassification,
  method: ClassificationMethod,
  reason?: string,
  confidence?: number
): Promise<LinkedInConversation | null> {
  const { data, error } = await supabase
    .from("linkedin_conversations")
    .update({
      classification,
      classification_method: method,
      classification_reason: reason || null,
      classification_confidence: confidence || null,
      is_excluded: classification === "personal",
    })
    .eq("id", conversationId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    console.error("Failed to update conversation classification:", error);
    return null;
  }
  return rowToConversation(data);
}

export async function toggleConversationExclusion(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  isExcluded: boolean
): Promise<boolean> {
  const { error } = await supabase
    .from("linkedin_conversations")
    .update({ is_excluded: isExcluded })
    .eq("id", conversationId)
    .eq("user_id", userId);

  if (error) {
    console.error("Failed to toggle conversation exclusion:", error);
    return false;
  }
  return true;
}

// ==========================================
// FILTER RULES
// ==========================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToRule(row: any): LinkedInFilterRule {
  return {
    id: row.id,
    userId: row.user_id,
    ruleType: row.rule_type,
    ruleValue: row.rule_value,
    classification: row.classification,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getFilterRules(
  supabase: SupabaseClient,
  userId: string
): Promise<LinkedInFilterRule[]> {
  const { data, error } = await supabase
    .from("linkedin_filter_rules")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch filter rules:", error);
    return [];
  }
  return (data || []).map(rowToRule);
}

export async function createFilterRule(
  supabase: SupabaseClient,
  userId: string,
  rule: {
    ruleType: string;
    ruleValue: string;
    classification: ConversationClassification;
  }
): Promise<LinkedInFilterRule | null> {
  const { data, error } = await supabase
    .from("linkedin_filter_rules")
    .insert([{
      user_id: userId,
      rule_type: rule.ruleType,
      rule_value: rule.ruleValue,
      classification: rule.classification,
    }])
    .select()
    .single();

  if (error) {
    console.error("Failed to create filter rule:", error);
    return null;
  }
  return rowToRule(data);
}

export async function deleteFilterRule(
  supabase: SupabaseClient,
  userId: string,
  ruleId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("linkedin_filter_rules")
    .delete()
    .eq("id", ruleId)
    .eq("user_id", userId);

  if (error) {
    console.error("Failed to delete filter rule:", error);
    return false;
  }
  return true;
}

export async function toggleFilterRule(
  supabase: SupabaseClient,
  userId: string,
  ruleId: string,
  isActive: boolean
): Promise<boolean> {
  const { error } = await supabase
    .from("linkedin_filter_rules")
    .update({ is_active: isActive })
    .eq("id", ruleId)
    .eq("user_id", userId);

  if (error) {
    console.error("Failed to toggle filter rule:", error);
    return false;
  }
  return true;
}

// ==========================================
// AUDIT LOG
// ==========================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToAuditEntry(row: any): LinkedInFilterAuditEntry {
  return {
    id: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id || undefined,
    action: row.action,
    previousClassification: row.previous_classification || undefined,
    newClassification: row.new_classification || undefined,
    method: row.method,
    reason: row.reason || undefined,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}

export async function createAuditEntry(
  supabase: SupabaseClient,
  userId: string,
  entry: {
    conversationId?: string;
    action: AuditAction;
    previousClassification?: ConversationClassification;
    newClassification?: ConversationClassification;
    method: ClassificationMethod;
    reason?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<LinkedInFilterAuditEntry | null> {
  const { data, error } = await supabase
    .from("linkedin_filter_audit_log")
    .insert([{
      user_id: userId,
      conversation_id: entry.conversationId || null,
      action: entry.action,
      previous_classification: entry.previousClassification || null,
      new_classification: entry.newClassification || null,
      method: entry.method,
      reason: entry.reason || null,
      metadata: entry.metadata || {},
    }])
    .select()
    .single();

  if (error) {
    console.error("Failed to create audit entry:", error);
    return null;
  }
  return rowToAuditEntry(data);
}

export async function getAuditLog(
  supabase: SupabaseClient,
  userId: string,
  limit = 50,
  offset = 0
): Promise<{ entries: LinkedInFilterAuditEntry[]; total: number }> {
  // Get total count
  const { count } = await supabase
    .from("linkedin_filter_audit_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  // Get entries with pagination
  const { data, error } = await supabase
    .from("linkedin_filter_audit_log")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Failed to fetch audit log:", error);
    return { entries: [], total: 0 };
  }

  return {
    entries: (data || []).map(rowToAuditEntry),
    total: count || 0,
  };
}
