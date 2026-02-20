export interface LinkedInConnection {
  firstName: string;
  lastName: string;
  company: string;
  position: string;
  connectedOn: string;
  email?: string;
  url?: string;
}

export interface ICPScore {
  overall: number; // 0-100
  companyFit: number;
  roleFit: number;
  industryFit: number;
  signals: string[];
  tier: "hot" | "warm" | "cold";
}

export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  position: string;
  connectedOn: string;
  email?: string;
  linkedinUrl?: string;
  icpScore: ICPScore;
  status: "new" | "researched" | "engaged" | "opportunity" | "nurture";
  lastAction?: string;
  lastActionDate?: string;
  notes: string;
  draftMessages: DraftMessage[];
  engagementActions: EngagementAction[];
  companyIntel?: CompanyIntel;
}

export interface DraftMessage {
  id: string;
  type: "connection_followup" | "cold_outreach" | "warm_intro" | "engagement_reply" | "value_share";
  subject: string;
  body: string;
  status: "draft" | "approved" | "sent" | "rejected";
  createdAt: string;
  approvedAt?: string;
  personalization: string[];
}

export interface EngagementAction {
  id: string;
  type: "like_post" | "comment_post" | "share_content" | "send_message" | "follow_up";
  description: string;
  suggestedContent?: string;
  priority: "high" | "medium" | "low";
  dueDate: string;
  completed: boolean;
}

export interface CompanyIntel {
  industry: string;
  estimatedRevenue: string;
  employeeCount: string;
  techStack: string[];
  recentNews: string[];
  nautaFitReason: string;
  painPoints: string[];
}

export interface ContentSuggestion {
  id: string;
  topic: string;
  hook: string;
  body: string;
  hashtags: string[];
  targetPersona: string;
  engagementGoal: string;
  createdAt: string;
}

export interface DashboardStats {
  totalConnections: number;
  hotLeads: number;
  warmLeads: number;
  pendingActions: number;
  pendingDrafts: number;
  weeklyEngagement: number;
}

export type TabType = "pipeline" | "drafts" | "actions" | "content" | "research";
