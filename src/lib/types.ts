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
  // Cross-channel
  channels: ChannelPresence;
  emailCampaigns: EmailCampaignEntry[];
  touchpointTimeline: TouchpointEvent[];
  callLogs?: CallLog[];
  // Outreach tracking (mirrors Excel workflow)
  contactStatus: "positive" | "neutral" | "negative" | "not_contacted";
  nextStep?: string;
  nextStepDate?: string;
  outreachSource?: string;
  lastOutreachMethod?: "call" | "email" | "linkedin";
  disqualifyReason?: string;
  meetingScheduled?: boolean;
  // LinkedIn tracker
  linkedinStage?: LinkedInOutreachStage;
  emailsSentCount?: number;
  lastEmailSentDate?: string;
  emailStatus?: "not_sent" | "sent" | "opened" | "replied" | "bounced";
  // New features
  prepKits?: PrepKit[];
  videoPreps?: VideoPrep[];
  battleCards?: BattleCard[];
  preferredLanguage?: SupportedLanguage;
}

export interface ChannelPresence {
  linkedin: boolean;
  email: boolean;
  linkedinConnected: boolean;
  emailVerified: boolean;
}

export interface TouchpointEvent {
  id: string;
  channel: OutreachChannel;
  type: string;
  description: string;
  date: string;
  metadata?: Record<string, string>;
}

export interface CallLog {
  id: string;
  leadId: string;
  callLink?: string;
  platform: "google_meet" | "teams" | "amplemarket" | "phone" | "other";
  date: string;
  duration?: string;
  notes: string;
  outcomes: CallOutcome[];
  generatedDrafts: string[];
  generatedReminders: string[];
}

export interface CallOutcome {
  type: "send_email" | "send_deck" | "send_loom" | "send_case_study" | "schedule_followup" | "custom";
  description: string;
  dueDate?: string;
  completed: boolean;
}

// === EMAIL INTELLIGENCE ===

export interface EmailCampaign {
  id: string;
  name: string;
  subject: string;
  templateBody: string;
  sentCount: number;
  openCount: number;
  clickCount: number;
  replyCount: number;
  bounceCount: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
  sentDate: string;
  status: "draft" | "active" | "completed" | "paused";
  sequence?: EmailSequenceStep[];
}

export interface EmailSequenceStep {
  step: number;
  delayDays: number;
  subject: string;
  body: string;
  sentCount: number;
  openRate: number;
  replyRate: number;
}

export interface EmailCampaignEntry {
  campaignId: string;
  campaignName: string;
  status: "sent" | "opened" | "clicked" | "replied" | "bounced" | "unsubscribed";
  sentAt: string;
  openedAt?: string;
  clickedAt?: string;
  repliedAt?: string;
  clickedLinks?: string[];
  sequenceStep?: number;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  totalSent: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bestPerformingSubject?: string;
  tags: string[];
}

export interface EmailFollowUp {
  id: string;
  leadId: string;
  leadName: string;
  company: string;
  lastEmailStatus: "sent" | "opened" | "clicked" | "no_reply";
  daysSinceLastTouch: number;
  suggestedAction: string;
  suggestedMessage?: string;
  priority: "urgent" | "high" | "medium" | "low";
  campaignName: string;
}

// === PROSPECTING / RESEARCH ===

export interface Prospect {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  position: string;
  linkedinUrl?: string;
  email?: string;
  source: "event" | "signal" | "competitor" | "content_engagement" | "referral" | "database";
  sourceDetail: string;
  icpScore: ICPScore;
  discoveredAt: string;
  status: "discovered" | "researching" | "qualified" | "outreach_ready" | "contacted" | "disqualified";
  signals: ProspectSignal[];
  suggestedApproach?: string;
  suggestedMessage?: string;
}

export interface ProspectSignal {
  type: "event_attendance" | "content_engagement" | "job_change" | "company_growth" | "funding" | "tech_adoption" | "pain_indicator" | "competitor_mention";
  description: string;
  strength: "strong" | "moderate" | "weak";
  date: string;
  source: string;
}

export interface EventOpportunity {
  id: string;
  name: string;
  date: string;
  location: string;
  type: "conference" | "webinar" | "tradeshow" | "meetup";
  relevanceScore: number;
  estimatedAttendees: number;
  icpDensity: "high" | "medium" | "low";
  keyAttendees: Prospect[];
  balboaAngle: string;
  status: "upcoming" | "in_progress" | "completed";
}

export interface MarketSignal {
  id: string;
  type: "hiring" | "funding" | "expansion" | "pain_indicator" | "tech_change" | "leadership_change";
  company: string;
  description: string;
  relevance: "high" | "medium" | "low";
  date: string;
  source: string;
  suggestedAction: string;
  linkedProspects?: string[];
}

// === MESSAGING ANALYTICS ===

export interface MessagingAnalytics {
  totalEmailsSent: number;
  avgOpenRate: number;
  avgClickRate: number;
  avgReplyRate: number;
  bestPerformingTemplate: string;
  bestPerformingSubjectLine: string;
  bestSendTime: string;
  bestSendDay: string;
  templatePerformance: TemplatePerformance[];
  weeklyTrend: WeeklyMetric[];
}

export interface TemplatePerformance {
  templateName: string;
  sent: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  avgResponseTime: string;
}

export interface WeeklyMetric {
  week: string;
  sent: number;
  opens: number;
  clicks: number;
  replies: number;
}

// === OUTREACH CHANNEL (expanded for SMS/WhatsApp) ===
export type OutreachChannel = "linkedin" | "email" | "call" | "sms" | "whatsapp";

export interface DraftMessage {
  id: string;
  type: "connection_followup" | "cold_outreach" | "warm_intro" | "engagement_reply" | "value_share" | "email_followup" | "email_initial" | "call_followup" | "meeting_request" | "sms_outreach" | "whatsapp_outreach";
  channel: OutreachChannel;
  subject: string;
  body: string;
  status: "draft" | "approved" | "sent" | "rejected";
  createdAt: string;
  approvedAt?: string;
  personalization: string[];
}

export interface EngagementAction {
  id: string;
  type: "like_post" | "comment_post" | "share_content" | "send_message" | "follow_up" | "email_follow_up" | "reply_email";
  channel: OutreachChannel;
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
  balboaFitReason: string;
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

export type SidebarSection = "today" | "leads" | "followups" | "prospecting" | "playbook" | "outreach" | "deals" | "queue" | "linkedin-privacy" | "signals" | "sequences" | "journey" | "threading" | "winloss" | "notifications" | "events";

// === LINKEDIN OUTREACH TRACKER ===
export type LinkedInOutreachStage =
  | "not_connected"
  | "connection_sent"
  | "connected"
  | "engaged"
  | "dm_sent"
  | "dm_replied"
  | "meeting_booked";

// === MULTI-LANGUAGE SUPPORT ===
export type SupportedLanguage = "english" | "spanish" | "portuguese";

// === PROPOSAL TYPES ===
export type ProposalDocType = "scope_of_work" | "proposal" | "deck" | "case_study" | "one_pager";

// === VIDEO PREP CENTER ===
export type VideoOption = "script" | "slides" | "video";

export interface SlideContent {
  title: string;
  subtitle?: string;
  bullets: string[];
  highlightStat?: string;
  color?: string;
}

export interface VideoPrep {
  id: string;
  leadId: string;
  options: VideoOption[];
  language: SupportedLanguage;
  script?: string;
  slides?: SlideContent[];
  createdAt: string;
}

// === SALES PREP KIT ===
export type PrepKitType = "demo" | "discovery" | "technical" | "proposal" | "custom";

export interface PrepKitSection {
  title: string;
  items: string[];
}

export interface PrepKit {
  id: string;
  leadId: string;
  type: PrepKitType;
  title: string;
  language: SupportedLanguage;
  sections: PrepKitSection[];
  createdAt: string;
}

// === PLAYBOOK INTELLIGENCE ===

export interface OutreachMetric {
  id: string;
  channel: "linkedin" | "email" | "call";
  messageType: string;
  totalSent: number;
  delivered: number;
  opened: number;
  replied: number;
  positiveReplied: number;
  booked: number;
  openRate: number;
  replyRate: number;
  positiveReplyRate: number;
  bookingRate: number;
  avgResponseTimeHours: number;
  period: "7d" | "30d" | "90d" | "all";
  segmentLabel?: string;
}

export interface PatternInsight {
  id: string;
  pattern: string;
  impact: "high" | "medium" | "low";
  direction: "positive" | "negative" | "neutral";
  metric: string;
  baseline: number;
  observed: number;
  lift: number;
  sampleSize: number;
  confidence: number;
  recommendation: string;
  relatedPersonas: string[];
  relatedChannels: ("linkedin" | "email" | "call")[];
  discoveredAt: string;
}

export interface PlaybookInsight {
  id: string;
  category: "messaging" | "timing" | "persona" | "channel" | "demo" | "call_script" | "opener";
  title: string;
  description: string;
  metric: string;
  confidence: "high" | "medium" | "low";
  sampleSize: number;
  dataSource: string;
  actionable: string;
  tags: string[];
  trend: "improving" | "stable" | "declining";
  discoveredAt: string;
}

export interface PersonaAnalytics {
  persona: string;
  totalContacted: number;
  responseRate: number;
  avgResponseTimeDays: number;
  bestChannel: "linkedin" | "email" | "call";
  bestMessageType: string;
  bestTimeOfDay: string;
  topOpeningLines: string[];
  conversionToDemo: number;
  isChampionMaterial: boolean;
  championScore: number;
}

export interface TemplateEffectiveness {
  templateId: string;
  templateName: string;
  channel: "linkedin" | "email";
  totalSent: number;
  openRate: number;
  replyRate: number;
  positiveReplyRate: number;
  avgReplyTimeDays: number;
  bestPersona: string;
  bestIndustry: string;
  bestTimeSlot: string;
  sampleResponses: string[];
}

export interface TimingPattern {
  slot: string;
  channel: "linkedin" | "email";
  openRate: number;
  replyRate: number;
  sampleSize: number;
  recommendation: string;
}

export interface PlaybookDashboardData {
  topInsights: PlaybookInsight[];
  personaBreakdown: PersonaAnalytics[];
  templateRankings: TemplateEffectiveness[];
  timingHeatmap: TimingPattern[];
  outreachMetrics: OutreachMetric[];
  patternInsights: PatternInsight[];
  overallStats: {
    totalOutreachActions: number;
    avgResponseRate: number;
    bestPerformingChannel: string;
    bestPerformingPersona: string;
    bestPerformingOpener: string;
    topChampionPersona: string;
    insightsGenerated: number;
  };
}

// === COMPETITIVE BATTLE CARDS ===
export type KnownCompetitor = "project44" | "fourkites" | "flexport" | "descartes"
  | "sapibp" | "oraclescm" | "blueyonder" | "e2open" | "coupa" | "other";

export interface BattleCard {
  id: string;
  leadId: string;
  competitor: KnownCompetitor;
  competitorDisplayName: string;
  strengths: string[];
  weaknesses: string[];
  balboaDifferentiators: string[];
  killerQuestions: string[];
  landmines: string[];
  autoDetectedFrom?: string;
  createdAt: string;
}

// === AUTOMATION ===

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  isActive: boolean;
  createdAt: string;
  lastTriggered?: string;
  timesTriggered: number;
  affectedLeads: string[];
}

export interface AutomationTrigger {
  channel: "linkedin" | "email" | "cross-channel";
  event: string;
  condition: string;
}

export interface AutomationAction {
  step: number;
  type: "send_email" | "send_linkedin_message" | "wait" | "create_task" | "move_stage" | "add_tag" | "send_connection_request";
  delay: string;
  description: string;
  channel?: "linkedin" | "email";
}

export interface AutomationSequence {
  id: string;
  name: string;
  description: string;
  steps: AutomationSequenceStep[];
  enrolledLeads: number;
  completedLeads: number;
  status: "active" | "paused" | "draft";
  conversionRate: number;
  avgTimeToConvert: string;
}

export interface AutomationSequenceStep {
  step: number;
  channel: "linkedin" | "email";
  action: string;
  delay: string;
  description: string;
  completionRate: number;
}

// === LIVE ACTIVITY FEED ===

export interface ActivityFeedItem {
  id: string;
  leadId: string;
  leadName: string;
  company: string;
  channel: "linkedin" | "email" | "call";
  type: string;
  description: string;
  timestamp: string;
  isAutomated: boolean;
  automationName?: string;
}

// === PHASE 2: INTELLIGENT SALES AUTOMATION ===

export interface Account {
  id: string;
  userId: string;
  accountExecutiveId?: string;
  companyName: string;
  industry?: string;
  estimatedRevenue?: string;
  employeeCount?: string;
  website?: string;
  hubspotCompanyId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Deal {
  id: string;
  userId: string;
  accountId: string;
  leadId?: string;
  accountExecutiveId?: string;
  dealName: string;
  amount?: number;
  dealStage: "qualification" | "proposal" | "negotiation" | "closed_won" | "closed_lost";
  probability?: number;
  dealHealth?: "hot" | "warm" | "cold" | "stalled";
  strategyRecommendation?: string;
  nextAction?: string;
  nextActionDate?: string;
  hubspotDealId?: string;
  hubspotLastSync?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountExecutive {
  id: string;
  teamId: string;
  userId: string;
  name: string;
  email?: string;
  role?: string;
  metricsCloseRate?: number;
  metricsReplyRate?: number;
  metricsMeetingRate?: number;
  metricsAvgDealSize?: number;
  metricsPipelineValue?: number;
  metricsPlaybookAdherence?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlaybookMetric {
  id: string;
  userId: string;
  actionType: string;
  channel?: "email" | "linkedin" | "call";
  timingDay?: string;
  timingHour?: number;
  sequenceNumber?: number;
  leadId?: string;
  dealId?: string;
  replyReceived?: boolean;
  meetingBooked?: boolean;
  dealClosed?: boolean;
  dealAmount?: number;
  daysToReply?: number;
  daysToMeeting?: number;
  daysToClose?: number;
  createdAt: string;
}

export interface PlaybookMetricsSummary {
  id: string;
  user_id: string;
  action_type: string;
  channel?: "email" | "linkedin" | "call";
  timing_day?: string;
  timing_hour?: number;
  sequence_number?: number;
  lead_tier?: string;
  reply_rate?: number;
  meeting_rate?: number;
  close_rate?: number;
  avg_days_to_reply?: number;
  avg_days_to_meeting?: number;
  avg_days_to_close?: number;
  sample_size?: number;
  last_updated?: string;
}

export interface SignalAndAction {
  id: string;
  userId: string;
  leadId: string;
  signalType: "email_open" | "linkedin_view" | "linkedin_engagement" | "hubspot_stage_change" | "marketing_signal";
  signalSource?: string;
  signalDescription?: string;
  actionType: string;
  actionDescription?: string;
  actionUrgency?: "immediate" | "high" | "medium" | "low";
  recommendedTiming?: string;
  recommendedChannel?: "email" | "linkedin";
  recommendedMessageTemplate?: string;
  actionStatus?: "pending" | "in_progress" | "completed" | "snoozed";
  completedAt?: string;
  createdAt: string;
}

export interface DraftTemplate {
  id: string;
  userId: string;
  templateName?: string;
  channel: "email" | "linkedin";
  subjectLine?: string;
  bodyText: string;
  personalizationPlaceholders?: string[];
  avgReplyRate?: number;
  avgMeetingRate?: number;
  usageCount?: number;
  createdAt: string;
}

export interface AnalyzerResult {
  leadId?: string;
  dealId?: string;
  urgency?: "immediate" | "high" | "medium" | "low";
  recommendedAction: string;
  recommendedChannel?: "email" | "linkedin";
  recommendedTiming?: string;
  reasoning: string;
  expectedOutcomes?: {
    replyRate?: number;
    meetingRate?: number;
    closeRate?: number;
  };
  suggestedMessage?: DraftMessage;
}

export interface GlobalAnalyzerResult {
  urgentActions: Array<{
    dealId: string;
    dealName: string;
    amount?: number;
    action: string;
  }>;
  deals: Array<{
    dealId: string;
    dealName: string;
    closeProbability: number;
    action: string;
  }>;
  topActions: string[];
}

// === BUYER JOURNEY ===
export type BuyerJourneyStage = "unaware" | "problem_aware" | "solution_aware" | "evaluating" | "decision" | "customer";

// === SIGNAL ENGINE ===
export type SignalType = "email_open" | "linkedin_view" | "linkedin_engagement" | "hubspot_stage_change" | "marketing_signal" | "job_change" | "company_growth" | "funding_round" | "competitor_mention" | "website_visit";

export type SignalUrgency = "immediate" | "high" | "medium" | "low";

export interface LiveSignal {
  id: string;
  leadId: string;
  leadName: string;
  company: string;
  signalType: SignalType;
  description: string;
  urgency: SignalUrgency;
  channel?: "email" | "linkedin" | "call";
  recommendedAction: string;
  recommendedChannel?: "email" | "linkedin";
  timestamp: string;
  snoozedUntil?: string;
  actedOn?: boolean;
  actedOnAt?: string;
}

// === ASSISTANT ===
export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// === NOTIFICATIONS ===
export type NotificationChannel = "email" | "whatsapp" | "in_app";
export type NotificationPriority = "urgent" | "high" | "normal" | "low";

export interface BalboaNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  priority: NotificationPriority;
  channel: NotificationChannel;
  relatedLeadId?: string;
  relatedDealId?: string;
  signalId?: string;
  read: boolean;
  sentAt: string;
  readAt?: string;
}

// === SEQUENCES ===
export type SequenceStatus = "active" | "paused" | "draft" | "completed";
export type SequenceStepStatus = "pending" | "sent" | "skipped" | "replied" | "bounced";

export interface Sequence {
  id: string;
  name: string;
  description: string;
  status: SequenceStatus;
  steps: SequenceStep[];
  enrolledLeadIds: string[];
  createdAt: string;
  updatedAt: string;
  stats: {
    enrolled: number;
    completed: number;
    replied: number;
    meetings: number;
  };
}

export interface SequenceStep {
  id: string;
  stepNumber: number;
  channel: "email" | "linkedin";
  type: string;
  subject?: string;
  body: string;
  delayDays: number;
  status?: SequenceStepStatus;
  sentAt?: string;
  stats: {
    sent: number;
    opened: number;
    replied: number;
    bounced: number;
  };
}

export interface SequenceEnrollment {
  id: string;
  sequenceId: string;
  leadId: string;
  currentStep: number;
  status: "active" | "paused" | "completed" | "replied" | "removed";
  startedAt: string;
  lastStepAt?: string;
  completedAt?: string;
  pauseReason?: string;
}

// === MULTI-THREADING ===
export interface AccountContact {
  id: string;
  accountId: string;
  leadId?: string;
  firstName: string;
  lastName: string;
  position: string;
  email?: string;
  linkedinUrl?: string;
  role: "champion" | "economic_buyer" | "technical_validator" | "influencer" | "blocker" | "end_user";
  engagementLevel: "high" | "medium" | "low" | "none";
  lastContactDate?: string;
  notes?: string;
}

export interface AccountThread {
  id: string;
  accountId: string;
  accountName: string;
  contacts: AccountContact[];
  totalContacts: number;
  engagedContacts: number;
  championIdentified: boolean;
  economicBuyerIdentified: boolean;
  riskLevel: "low" | "medium" | "high";
  recommendation: string;
}

// ============================================================
// PHASE 6: MEGA-BUILD TYPES
// ============================================================

// === DEEP RESEARCH ===
export interface DeepResearchResult {
  id: string;
  leadId: string;
  generatedAt: string;
  person: {
    summary: string;
    careerHistory: string[];
    recentActivity: string[];
    communicationStyle: string;
    motivations: string[];
    decisionDrivers: string[];
  };
  company: {
    overview: string;
    financials: string;
    recentNews: string[];
    strategicInitiatives: string[];
    painPoints: string[];
    techStack: string[];
    competitors: string[];
    orgStructure: string;
  };
  industry: {
    trends: string[];
    challenges: string[];
    regulations: string[];
    marketSize: string;
    growthRate: string;
  };
  competition: {
    mainCompetitors: Array<{ name: string; strengths: string[]; weaknesses: string[] }>;
    competitiveAdvantage: string;
    switchingCosts: string;
  };
  approach: {
    recommendedAngle: string;
    keyTalkingPoints: string[];
    objectionHandling: Array<{ objection: string; response: string }>;
    idealTiming: string;
    suggestedChannel: OutreachChannel;
  };
}

// === LEAD SUMMARY ===
export interface LeadSummary {
  id: string;
  leadId: string;
  generatedAt: string;
  executiveSummary: string;
  sentimentTimeline: Array<{
    date: string;
    sentiment: "positive" | "neutral" | "negative";
    reason: string;
  }>;
  keyMilestones: string[];
  totalTouchpoints: number;
  totalEmails: number;
  totalLinkedIn: number;
  totalCalls: number;
  totalSms: number;
  totalWhatsApp: number;
  responseRate: number;
  avgResponseTime: string;
  callRecordingHighlights: string[];
  nextRecommendedAction: string;
  dealProbability: number;
  riskFactors: string[];
}

// === COMMUNICATION HISTORY ===
export interface CommunicationMessage {
  id: string;
  leadId: string;
  channel: OutreachChannel;
  direction: "inbound" | "outbound";
  subject?: string;
  body: string;
  date: string;
  status: "sent" | "delivered" | "read" | "replied" | "bounced" | "failed";
  threadId?: string;
  sender: string;
  attachments?: string[];
}

export interface CommunicationThread {
  id: string;
  leadId: string;
  channel: OutreachChannel;
  subject?: string;
  messages: CommunicationMessage[];
  lastMessageDate: string;
  unreadCount: number;
}

// === EVENT COMMAND CENTER ===
export interface SalesEvent {
  id: string;
  name: string;
  date: string;
  endDate?: string;
  location: string;
  type: "conference" | "tradeshow" | "webinar" | "meetup" | "dinner" | "workshop";
  status: "upcoming" | "in_progress" | "completed";
  description: string;
  website?: string;
  attendees: EventAttendee[];
  territories: string[];
  outreachPlan?: EventOutreachPlan;
  teamProgress: EventTeamProgress;
}

export interface EventAttendee {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  position: string;
  email?: string;
  linkedinUrl?: string;
  territory: string;
  icpScore?: number;
  tier?: "hot" | "warm" | "cold";
  outreachStatus: "not_started" | "scheduled" | "contacted" | "meeting_booked" | "no_show";
  assignedTo?: string;
  notes?: string;
}

export interface EventOutreachPlan {
  id: string;
  eventId: string;
  preEventSequence: Array<{ step: number; channel: OutreachChannel; template: string; timing: string }>;
  atEventTasks: string[];
  postEventSequence: Array<{ step: number; channel: OutreachChannel; template: string; timing: string }>;
  goals: { meetingsTarget: number; leadsTarget: number; connectionsTarget: number };
}

export interface EventTeamProgress {
  totalAttendees: number;
  contacted: number;
  meetingsBooked: number;
  noShows: number;
  byTerritory: Array<{ territory: string; total: number; contacted: number; meetings: number }>;
}

// === COLD CALL SCRIPTS ===
export interface ColdCallScript {
  id: string;
  leadId: string;
  generatedAt: string;
  opener: string;
  valueProposition: string;
  talkingPoints: string[];
  questions: string[];
  objectionHandlers: Array<{ objection: string; response: string }>;
  closeAttempt: string;
  voicemailScript: string;
  gatekeeperScript: string;
  callDuration?: number;
  callNotes?: string;
  outcome?: "connected" | "voicemail" | "gatekeeper" | "no_answer" | "callback_scheduled";
}

// === VASCO CONTEXT BUTTON ===
export interface VascoContextPrompt {
  prompt: string;
  context?: string;
  section?: string;
  leadId?: string;
  dealId?: string;
}
