// Mock data for Phase 2: Intelligent Sales Automation
// Models real HubSpot pipelines: Sales Pipeline + Bus Dev Pipeline

export interface PipelineDeal {
  id: string;
  deal_name: string;
  pipeline: "sales" | "busdev";
  deal_stage: string;
  amount?: number;
  probability?: number;
  close_date?: string;
  create_date: string;
  days_in_stage?: number;
  contact_name?: string;
  company_name?: string;
  deal_owner: string;
  deal_health?: "hot" | "warm" | "cold" | "stalled";
  next_step?: string;
  lead_id?: string;
  last_activity_type?: "email" | "call" | "meeting" | "task" | "linkedin";
  last_activity_days?: number;
  contacts_count?: number;
}

// Pipeline stage configurations matching HubSpot
export const SALES_STAGES = [
  { id: "discovery", label: "Discovery", probability: 10, color: "#7c3aed", bg: "#f5f3ff" },
  { id: "scope", label: "Scope", probability: 25, color: "#3b5bdb", bg: "#eff6ff" },
  { id: "proposal_review", label: "Proposal Review", probability: 50, color: "#d97706", bg: "#fffbeb" },
  { id: "go", label: "Go", probability: 70, color: "#059669", bg: "#ecfdf5" },
  { id: "contracting", label: "Contracting", probability: 90, color: "#0891b2", bg: "#ecfeff" },
  { id: "closed_won", label: "Closed Won", probability: 100, color: "#16a34a", bg: "#f0fdf4" },
  { id: "closed_lost", label: "Closed Lost", probability: 0, color: "#dc2626", bg: "#fef2f2" },
];

export const BUSDEV_STAGES = [
  { id: "lead", label: "Lead", probability: 10, color: "#6366f1", bg: "#eef2ff" },
  { id: "meeting_scheduled", label: "Meeting Scheduled", probability: 25, color: "#3b5bdb", bg: "#eff6ff" },
  { id: "meeting_held", label: "Meeting Held", probability: 40, color: "#d97706", bg: "#fffbeb" },
  { id: "qualified", label: "Qualified", probability: 60, color: "#059669", bg: "#ecfdf5" },
  { id: "disqualified", label: "Disqualified", probability: 0, color: "#6b7280", bg: "#f3f4f6" },
  { id: "closed_lost", label: "Closed Lost / No Show", probability: 0, color: "#dc2626", bg: "#fef2f2" },
];

export const PIPELINE_CONFIG = {
  sales: { label: "Sales Pipeline", stages: SALES_STAGES },
  busdev: { label: "Bus Dev Pipeline", stages: BUSDEV_STAGES },
};

// Deals modeled after real HubSpot data
export const mockDeals: PipelineDeal[] = [
  // === SALES PIPELINE ===
  {
    id: "deal-s1", pipeline: "sales", deal_name: "Colgate Palmolive",
    deal_stage: "scope", amount: 586000, probability: 25,
    close_date: "2026-08-31", create_date: "2025-10-20",
    days_in_stage: 4, contact_name: "Anthony Yarussi", company_name: "Colgate Palmolive",
    deal_owner: "Anthony Yarussi", deal_health: "warm",
    next_step: "Complete scope documentation and pricing model",
    last_activity_type: "email", last_activity_days: 4, contacts_count: 3,
  },
  {
    id: "deal-s2", pipeline: "sales", deal_name: "Rooms To Go",
    deal_stage: "discovery", amount: 500000, probability: 10,
    close_date: "2026-09-01", create_date: "2026-01-08",
    days_in_stage: 6, contact_name: "Mark Johnson", company_name: "Rooms To Go",
    deal_owner: "Anthony Yarussi", deal_health: "warm",
    next_step: "Schedule discovery call and demo",
    last_activity_type: "email", last_activity_days: 5, contacts_count: 2,
  },
  {
    id: "deal-s3", pipeline: "sales", deal_name: "A&D Foods",
    deal_stage: "contracting", amount: 250000, probability: 90,
    close_date: "2026-03-31", create_date: "2025-12-10",
    days_in_stage: 3, contact_name: "Carlos Mendez", company_name: "A&D Foods",
    deal_owner: "Anthony Yarussi", deal_health: "hot",
    next_step: "Address final legal questions and get signature",
    last_activity_type: "meeting", last_activity_days: 1, contacts_count: 4,
  },
  {
    id: "deal-s4", pipeline: "sales", deal_name: "Centric Brands",
    deal_stage: "discovery", amount: 250000, probability: 10,
    close_date: "2026-09-01", create_date: "2026-01-12",
    days_in_stage: 12, contact_name: "Sarah Liu", company_name: "Centric Brands",
    deal_owner: "Anthony Yarussi", deal_health: "cold",
    next_step: "Schedule initial discovery meeting",
    last_activity_type: "email", last_activity_days: 12, contacts_count: 1,
  },
  {
    id: "deal-s5", pipeline: "sales", deal_name: "Melissa and Doug",
    deal_stage: "discovery", amount: 300000, probability: 10,
    close_date: "2026-08-31", create_date: "2026-02-02",
    days_in_stage: 3, contact_name: "Jennifer Park", company_name: "Melissa and Doug",
    deal_owner: "Rafael Santiago", deal_health: "warm",
    next_step: "Prepare RILA event follow-up materials",
    last_activity_type: "linkedin", last_activity_days: 2, contacts_count: 2,
  },
  {
    id: "deal-s6", pipeline: "sales", deal_name: "Pernod Ricard",
    deal_stage: "scope", amount: 30000, probability: 25,
    close_date: "2026-04-30", create_date: "2026-01-23",
    days_in_stage: 15, contact_name: "David Chen", company_name: "Pernod Ricard",
    deal_owner: "Santiago Giraldo", deal_health: "stalled",
    next_step: "Follow up on scope proposal — no response in 2 weeks",
    last_activity_type: "task", last_activity_days: 15, contacts_count: 2,
  },
  {
    id: "deal-s7", pipeline: "sales", deal_name: "Levi's",
    deal_stage: "proposal_review", amount: 180000, probability: 50,
    close_date: "2026-06-15", create_date: "2025-12-22",
    days_in_stage: 8, contact_name: "Michael Torres", company_name: "Levi Strauss",
    deal_owner: "Santiago Giraldo", deal_health: "warm",
    next_step: "Review proposal feedback and adjust pricing",
    last_activity_type: "email", last_activity_days: 3, contacts_count: 3,
  },
  {
    id: "deal-s8", pipeline: "sales", deal_name: "Prebel",
    deal_stage: "proposal_review", amount: 40000, probability: 50,
    close_date: "2026-04-30", create_date: "2025-11-15",
    days_in_stage: 6, contact_name: "Ana Garcia", company_name: "Prebel",
    deal_owner: "Santiago Giraldo", deal_health: "warm",
    next_step: "Send revised proposal with Contegral reference",
    last_activity_type: "email", last_activity_days: 6, contacts_count: 2,
  },
  {
    id: "deal-s9", pipeline: "sales", deal_name: "Green & Fresh",
    deal_stage: "proposal_review", amount: 30000, probability: 50,
    close_date: "2026-05-15", create_date: "2026-01-14",
    days_in_stage: 8, contact_name: "Laura Reyes", company_name: "Green & Fresh",
    deal_owner: "Santiago Giraldo", deal_health: "warm",
    next_step: "Schedule demo of D&D module",
    last_activity_type: "email", last_activity_days: 8, contacts_count: 1,
  },

  // === BUS DEV PIPELINE ===
  {
    id: "deal-b1", pipeline: "busdev", deal_name: "Walmart",
    deal_stage: "meeting_scheduled", amount: undefined, probability: 25,
    close_date: undefined, create_date: "2026-02-19",
    days_in_stage: 4, contact_name: "Robert Chen", company_name: "Walmart",
    deal_owner: "Santiago Giraldo", deal_health: "hot",
    next_step: "Prepare for initial meeting — focus on D&D and visibility",
    last_activity_type: "linkedin", last_activity_days: 1, contacts_count: 1,
  },
  {
    id: "deal-b2", pipeline: "busdev", deal_name: "Floor and Decor TPM",
    deal_stage: "meeting_scheduled", amount: undefined, probability: 25,
    close_date: undefined, create_date: "2026-02-23",
    days_in_stage: 0, contact_name: "David Martinez", company_name: "Floor and Decor",
    deal_owner: "Santiago Giraldo", deal_health: "hot",
    next_step: "Confirm meeting time for TPM discussion",
    last_activity_type: "email", last_activity_days: 0, contacts_count: 1,
  },
  {
    id: "deal-b3", pipeline: "busdev", deal_name: "Dollar General",
    deal_stage: "lead", amount: undefined, probability: 10,
    close_date: undefined, create_date: "2026-02-15",
    days_in_stage: 8, contact_name: "James Wilson", company_name: "Dollar General",
    deal_owner: "Manuel Lopez", deal_health: "warm",
    next_step: "Send intro email about supply chain visibility",
    last_activity_type: "linkedin", last_activity_days: 5, contacts_count: 1,
  },
  {
    id: "deal-b4", pipeline: "busdev", deal_name: "Samsung - MANIFEST",
    deal_stage: "meeting_held", amount: undefined, probability: 40,
    close_date: undefined, create_date: "2026-01-28",
    days_in_stage: 5, contact_name: "Yuki Tanaka", company_name: "Samsung",
    deal_owner: "Santiago Herrera", deal_health: "warm",
    next_step: "Send follow-up deck with custom ROI analysis",
    last_activity_type: "meeting", last_activity_days: 5, contacts_count: 2,
  },
  {
    id: "deal-b5", pipeline: "busdev", deal_name: "Lockheed Martin",
    deal_stage: "qualified", amount: undefined, probability: 60,
    close_date: undefined, create_date: "2025-12-10",
    days_in_stage: 14, contact_name: "Steven Brown", company_name: "Lockheed Martin",
    deal_owner: "Santiago Giraldo", deal_health: "warm",
    next_step: "Schedule technical deep-dive with their supply chain team",
    last_activity_type: "email", last_activity_days: 3, contacts_count: 3,
  },
  {
    id: "deal-b6", pipeline: "busdev", deal_name: "Nordstrom",
    deal_stage: "lead", amount: undefined, probability: 10,
    close_date: undefined, create_date: "2026-02-10",
    days_in_stage: 13, contact_name: "Emily Johnson", company_name: "Nordstrom",
    deal_owner: "Santiago Herrera", deal_health: "cold",
    next_step: "Research contacts and prepare outreach strategy",
    last_activity_type: "linkedin", last_activity_days: 13, contacts_count: 1,
  },
  {
    id: "deal-b7", pipeline: "busdev", deal_name: "Bosch",
    deal_stage: "meeting_scheduled", amount: undefined, probability: 25,
    close_date: undefined, create_date: "2026-02-18",
    days_in_stage: 5, contact_name: "Klaus Meyer", company_name: "Bosch",
    deal_owner: "Manuel Lopez", deal_health: "warm",
    next_step: "Prep meeting materials — European supply chain focus",
    last_activity_type: "email", last_activity_days: 2, contacts_count: 1,
  },
  {
    id: "deal-b8", pipeline: "busdev", deal_name: "ORBCOMM - TPM",
    deal_stage: "meeting_scheduled", amount: undefined, probability: 25,
    close_date: undefined, create_date: "2026-02-23",
    days_in_stage: 0, contact_name: "Tom Richards", company_name: "ORBCOMM",
    deal_owner: "Rafael Santiago", deal_health: "hot",
    next_step: "TPM meeting prep — focus on real-time tracking",
    last_activity_type: "call", last_activity_days: 0, contacts_count: 1,
  },
];

export const mockAccounts = [
  { id: "account-1", companyName: "US Foods", industry: "Food & Beverage", estimatedRevenue: "$37B", employeeCount: "28,000", website: "usfoods.com" },
  { id: "account-2", companyName: "Colgate Palmolive", industry: "Consumer Goods", estimatedRevenue: "$18B", employeeCount: "33,000", website: "colgatepalmolive.com" },
  { id: "account-3", companyName: "Walmart", industry: "Retail", estimatedRevenue: "$611B", employeeCount: "2,100,000", website: "walmart.com" },
];

export const mockAccountExecutives = [
  { id: "ae-1", name: "Santiago Giraldo", email: "santiago@getbalboa.com", role: "Founder", metrics_close_rate: 45, metrics_reply_rate: 62, metrics_meeting_rate: 48, metrics_avg_deal_size: 185000, metrics_pipeline_value: 1200000, metrics_playbook_adherence: 95 },
  { id: "ae-2", name: "Anthony Yarussi", email: "anthony@getbalboa.com", role: "AE", metrics_close_rate: 52, metrics_reply_rate: 65, metrics_meeting_rate: 56, metrics_avg_deal_size: 320000, metrics_pipeline_value: 1586000, metrics_playbook_adherence: 98 },
  { id: "ae-3", name: "Manuel Lopez", email: "manuel@getbalboa.com", role: "BDR", metrics_close_rate: 38, metrics_reply_rate: 48, metrics_meeting_rate: 42, metrics_avg_deal_size: 0, metrics_pipeline_value: 0, metrics_playbook_adherence: 82 },
  { id: "ae-4", name: "Rafael Santiago", email: "rafael@getbalboa.com", role: "BDR", metrics_close_rate: 35, metrics_reply_rate: 55, metrics_meeting_rate: 40, metrics_avg_deal_size: 0, metrics_pipeline_value: 0, metrics_playbook_adherence: 88 },
];

export const mockPlaybookMetrics = [
  { id: "metric-1", actionType: "email_sent", channel: "email", timingDay: "Tuesday", timingHour: 10, sequenceNumber: 1, leadTier: "hot", replyRate: 0.62, meetingRate: 0.45, closeRate: 0.28, sampleSize: 45 },
  { id: "metric-2", actionType: "linkedin_message", channel: "linkedin", timingDay: "Wednesday", timingHour: 14, sequenceNumber: 1, leadTier: "hot", replyRate: 0.35, meetingRate: 0.22, closeRate: 0.15, sampleSize: 38 },
];

export const mockSignalsAndActions = [
  { id: "signal-1", leadId: "lead-1", signalType: "email_open", signalDescription: "Sarah opened your email 2 hours ago", actionType: "send_email", actionDescription: "Send follow-up email while engaged", actionUrgency: "high", recommendedTiming: "within_24h", recommendedChannel: "email", actionStatus: "pending" },
  { id: "signal-2", leadId: "lead-2", signalType: "linkedin_view", signalDescription: "John viewed your profile", actionType: "send_linkedin_message", actionDescription: "Capitalize on profile view", actionUrgency: "high", recommendedTiming: "within_6h", recommendedChannel: "linkedin", actionStatus: "pending" },
];
