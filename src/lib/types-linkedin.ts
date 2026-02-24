// LinkedIn conversation filtering types

export type ConversationClassification = "professional" | "personal" | "unclassified";
export type ClassificationMethod = "auto" | "manual" | "rule";
export type FilterRuleType = "keyword" | "participant" | "relationship" | "pattern";
export type AuditAction = "classified" | "reclassified" | "excluded" | "included" | "rule_created" | "rule_deleted";

export interface LinkedInConversation {
  id: string;
  userId: string;
  leadId?: string;
  linkedinThreadId: string;
  participantName: string;
  participantUrl?: string;
  classification: ConversationClassification;
  classificationMethod?: ClassificationMethod;
  classificationReason?: string;
  classificationConfidence?: number;
  isExcluded: boolean;
  lastMessagePreview?: string;
  lastMessageDate?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LinkedInFilterRule {
  id: string;
  userId: string;
  ruleType: FilterRuleType;
  ruleValue: string;
  classification: ConversationClassification;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LinkedInFilterAuditEntry {
  id: string;
  userId: string;
  conversationId?: string;
  action: AuditAction;
  previousClassification?: ConversationClassification;
  newClassification?: ConversationClassification;
  method: ClassificationMethod;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ClassificationResult {
  classification: ConversationClassification;
  confidence: number;
  reasons: string[];
  method: ClassificationMethod;
}
