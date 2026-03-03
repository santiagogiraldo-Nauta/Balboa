import type { WeeklyMetrics, OutreachList } from "./types";

// ── Weekly metrics history (4 weeks of sample data) ──

function weekDate(weeksAgo: number): { start: string; end: string } {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - now.getDay() + 1 - weeksAgo * 7);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return {
    start: monday.toISOString().slice(0, 10),
    end: friday.toISOString().slice(0, 10),
  };
}

export const MOCK_WEEKLY_HISTORY: WeeklyMetrics[] = [
  {
    ...weekDate(3),
    weekStart: weekDate(3).start,
    weekEnd: weekDate(3).end,
    contactsReached: 142,
    callsMade: 68,
    emailsSent: 94,
    linkedInConnections: 37,
    connectRate: 24,
    meaningfulConversations: 18,
    meetingsBooked: 7,
    meetingsHeld: 5,
    noShows: 2,
  },
  {
    ...weekDate(2),
    weekStart: weekDate(2).start,
    weekEnd: weekDate(2).end,
    contactsReached: 158,
    callsMade: 75,
    emailsSent: 102,
    linkedInConnections: 42,
    connectRate: 28,
    meaningfulConversations: 22,
    meetingsBooked: 9,
    meetingsHeld: 7,
    noShows: 1,
  },
  {
    ...weekDate(1),
    weekStart: weekDate(1).start,
    weekEnd: weekDate(1).end,
    contactsReached: 165,
    callsMade: 82,
    emailsSent: 110,
    linkedInConnections: 45,
    connectRate: 31,
    meaningfulConversations: 25,
    meetingsBooked: 11,
    meetingsHeld: 8,
    noShows: 2,
  },
  {
    ...weekDate(0),
    weekStart: weekDate(0).start,
    weekEnd: weekDate(0).end,
    contactsReached: 98,
    callsMade: 47,
    emailsSent: 63,
    linkedInConnections: 28,
    connectRate: 29,
    meaningfulConversations: 14,
    meetingsBooked: 6,
    meetingsHeld: 4,
    noShows: 1,
  },
];

// ── Mock outreach lists ──

export const MOCK_OUTREACH_LISTS: OutreachList[] = [
  {
    id: "list-1",
    name: "Q1 SaaS VP Sales",
    source: "agent",
    createdAt: "2025-01-15",
    status: "active",
    contactIds: ["lead-1", "lead-2", "lead-3", "lead-4"],
    stats: { total: 45, contacted: 32, positive: 8, meetings: 4 },
  },
  {
    id: "list-2",
    name: "FinTech CFOs — March",
    source: "imported",
    createdAt: "2025-03-01",
    status: "active",
    contactIds: ["lead-5", "lead-6"],
    stats: { total: 28, contacted: 12, positive: 3, meetings: 2 },
  },
  {
    id: "list-3",
    name: "Post-Manifest Leads",
    source: "event",
    createdAt: "2025-02-20",
    status: "completed",
    contactIds: ["lead-7", "lead-8", "lead-9"],
    stats: { total: 62, contacted: 62, positive: 15, meetings: 9 },
  },
  {
    id: "list-4",
    name: "Healthcare Logistics Directors",
    source: "manual",
    createdAt: "2025-02-10",
    status: "paused",
    contactIds: [],
    stats: { total: 18, contacted: 6, positive: 1, meetings: 0 },
  },
];

// ── Conversion heatmap data ──

export interface ConversionCell {
  industry: string;
  persona: string;
  booked: number;
  held: number;
  qualified: number;
  total: number;
}

export const MOCK_CONVERSION_HEATMAP: ConversionCell[] = [
  { industry: "SaaS", persona: "VP Sales", booked: 12, held: 9, qualified: 5, total: 45 },
  { industry: "SaaS", persona: "CRO", booked: 8, held: 6, qualified: 4, total: 30 },
  { industry: "FinTech", persona: "CFO", booked: 5, held: 4, qualified: 2, total: 28 },
  { industry: "FinTech", persona: "VP Operations", booked: 3, held: 2, qualified: 1, total: 18 },
  { industry: "Logistics", persona: "COO", booked: 7, held: 5, qualified: 3, total: 32 },
  { industry: "Logistics", persona: "Director Ops", booked: 4, held: 3, qualified: 2, total: 22 },
  { industry: "Healthcare", persona: "VP Supply Chain", booked: 2, held: 1, qualified: 0, total: 15 },
  { industry: "Manufacturing", persona: "Plant Manager", booked: 6, held: 4, qualified: 2, total: 25 },
];

// ── Helper to compute metrics from live leads ──

import type { Lead } from "./types";

export function computeWeeklyMetricsFromLeads(leads: Lead[]): WeeklyMetrics {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - now.getDay() + 1);
  monday.setHours(0, 0, 0, 0);

  const thisWeekLeads = leads.filter((l) => {
    if (!l.lastActionDate) return false;
    return new Date(l.lastActionDate) >= monday;
  });

  const contacted = thisWeekLeads.filter((l) => l.contactStatus !== "not_contacted").length;
  const calls = thisWeekLeads.filter((l) => l.lastOutreachMethod === "call").length;
  const emails = thisWeekLeads.filter((l) => l.lastOutreachMethod === "email").length;
  const linkedin = thisWeekLeads.filter((l) => l.lastOutreachMethod === "linkedin").length;
  const positive = thisWeekLeads.filter((l) => l.contactStatus === "positive").length;
  const meetings = thisWeekLeads.filter((l) => l.meetingScheduled).length;

  return {
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: new Date(monday.getTime() + 4 * 86400000).toISOString().slice(0, 10),
    contactsReached: contacted,
    callsMade: calls,
    emailsSent: emails,
    linkedInConnections: linkedin,
    connectRate: contacted > 0 ? Math.round((positive / contacted) * 100) : 0,
    meaningfulConversations: positive,
    meetingsBooked: meetings,
    meetingsHeld: Math.max(0, meetings - 1),
    noShows: meetings > 0 ? 1 : 0,
  };
}
