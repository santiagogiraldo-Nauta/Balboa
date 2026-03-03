"use client";

import { useState, useMemo } from "react";
import { Mail, MessageSquare, Check, ChevronRight } from "lucide-react";
import type { Lead, Deal, SupportedLanguage, SalesEvent } from "@/lib/types";
import SectionTabBar from "./SectionTabBar";
import OutreachCommandCenter from "./OutreachCommandCenter";
import LinkedInQueue from "./LinkedInQueue";
import NotificationCenter from "./NotificationCenter";

// ── Props ──

interface HomeSectionProps {
  leads: Lead[];
  deals: Deal[];
  events: SalesEvent[];
  selectedLead: Lead | null;
  onNavigateToLead: (leadId: string) => void;
  onUpdateLead: (leadId: string, updates: Partial<Lead>) => void;
  onGenerateMessage: (lead: Lead, type: string) => void;
  onCopyMessage: (text: string) => void;
  generatingForLeadId: string | null;
  language: SupportedLanguage;
}

// ── Helpers ──

type HomeTab = "actions" | "followups" | "notifications";

function daysUntil(d?: string): number {
  if (!d) return 999;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - now.getTime()) / 86400000);
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// ── KPI chip data ──

interface KPIChipData {
  icon: string;
  count: number;
  label: string;
  color: string;
}

// ── KPI Chip (compact, inline) ──

function KPIChip({ icon, count, label, color }: KPIChipData) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        background: `${color}08`,
        borderRadius: 8,
        border: `1px solid ${color}20`,
        cursor: "pointer",
        transition: "all 0.15s ease",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `${color}14`;
        e.currentTarget.style.borderColor = `${color}40`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = `${color}08`;
        e.currentTarget.style.borderColor = `${color}20`;
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: 15, fontWeight: 800, color, lineHeight: 1 }}>{count}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--balboa-text-muted)" }}>{label}</span>
    </div>
  );
}

// ── Priority row item ──

interface PriorityItem {
  lead: Lead;
  urgency: "overdue" | "today" | "hot";
  daysLeft: number;
}

function PriorityRow({
  item,
  onNavigate,
  onGenerate,
  onCopy,
}: {
  item: PriorityItem;
  onNavigate: (id: string) => void;
  onGenerate: (lead: Lead, type: string) => void;
  onCopy: (text: string) => void;
}) {
  void onCopy;
  const lead = item.lead;
  const initials = `${lead.firstName?.[0] || ""}${lead.lastName?.[0] || ""}`.toUpperCase();

  const urgencyBadge = {
    overdue: { bg: "rgba(220,38,38,0.1)", color: "#dc2626", label: "Overdue" },
    today: { bg: "rgba(217,119,6,0.1)", color: "#d97706", label: "Today" },
    hot: { bg: "rgba(220,38,38,0.08)", color: "#dc2626", label: "Hot" },
  }[item.urgency];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 8,
        cursor: "pointer",
        transition: "background 0.1s ease",
      }}
      onClick={() => onNavigate(lead.id)}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(30,42,94,0.03)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {/* Avatar */}
      <div style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: "var(--balboa-navy)",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 700,
        flexShrink: 0,
      }}>
        {initials}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-navy)" }}>
            {lead.firstName} {lead.lastName}
          </span>
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            padding: "1px 6px",
            borderRadius: 4,
            background: urgencyBadge.bg,
            color: urgencyBadge.color,
            textTransform: "uppercase",
          }}>
            {urgencyBadge.label}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "var(--balboa-text-muted)", marginTop: 1 }}>
          {lead.position} @ {lead.company}
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onGenerate(lead, "follow_up")}
          title="Draft email"
          style={{
            padding: 5,
            background: "transparent",
            border: "1px solid var(--balboa-border-light)",
            borderRadius: 6,
            cursor: "pointer",
            display: "flex",
            color: "var(--balboa-text-muted)",
          }}
        >
          <Mail size={13} />
        </button>
        <button
          onClick={() => onGenerate(lead, "linkedin_message")}
          title="Draft LinkedIn message"
          style={{
            padding: 5,
            background: "transparent",
            border: "1px solid var(--balboa-border-light)",
            borderRadius: 6,
            cursor: "pointer",
            display: "flex",
            color: "var(--balboa-text-muted)",
          }}
        >
          <MessageSquare size={13} />
        </button>
        <button
          onClick={() => onNavigate(lead.id)}
          title="Mark done"
          style={{
            padding: 5,
            background: "transparent",
            border: "1px solid var(--balboa-border-light)",
            borderRadius: 6,
            cursor: "pointer",
            display: "flex",
            color: "var(--balboa-text-muted)",
          }}
        >
          <Check size={13} />
        </button>
      </div>
    </div>
  );
}

// ── LinkedIn summary row ──

function LinkedInSummaryRow({ lead, onNavigate }: { lead: Lead; onNavigate: (id: string) => void }) {
  const initials = `${lead.firstName?.[0] || ""}${lead.lastName?.[0] || ""}`.toUpperCase();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 8,
        cursor: "pointer",
        transition: "background 0.1s ease",
      }}
      onClick={() => onNavigate(lead.id)}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(30,42,94,0.03)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: "#0077b5",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        fontWeight: 700,
        flexShrink: 0,
      }}>
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-navy)" }}>
          {lead.firstName} {lead.lastName}
        </span>
        <span style={{ fontSize: 11, color: "var(--balboa-text-muted)", marginLeft: 6 }}>
          {lead.company}
        </span>
      </div>
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 6px",
        borderRadius: 4,
        background: "rgba(0,119,181,0.08)",
        color: "#0077b5",
      }}>
        LinkedIn
      </span>
    </div>
  );
}

// ── Component ──

export default function HomeSection({
  leads,
  deals,
  events,
  onNavigateToLead,
  onUpdateLead,
  onGenerateMessage,
  onCopyMessage,
  generatingForLeadId,
}: HomeSectionProps) {
  const [activeTab, setActiveTab] = useState<HomeTab>("actions");

  // ── Compute KPI chips ──

  const kpiChips = useMemo((): KPIChipData[] => {
    const hotLeads = leads.filter(
      (l) => !l.disqualifyReason && (l.icpScore?.tier === "hot" || l.icpScore?.tier === "warm")
    );
    const proposalDeals = deals.filter(
      (d) => d.dealStage === "proposal" || d.dealStage === "negotiation"
    );
    const meddicGapDeals = deals.filter((d) => {
      const missing = !d.amount || !d.probability || !d.nextAction || !d.strategyRecommendation || d.dealStage === "qualification";
      return missing && d.dealStage !== "closed_won" && d.dealStage !== "closed_lost";
    });
    const meetingLeads = leads.filter((l) => l.meetingScheduled === true);
    const upcomingEvents = events.filter((ev) => {
      const d = daysUntil(ev.date);
      return d >= 0 && d <= 14 && ev.status !== "completed";
    });
    const linkedInOnly = leads.filter((l) => l.channels?.linkedin && !l.channels?.email);

    return [
      { icon: "\uD83D\uDD25", count: hotLeads.length, label: "Hot", color: "#dc2626" },
      { icon: "\uD83D\uDCCB", count: proposalDeals.length, label: "Proposals", color: "#2563eb" },
      { icon: "\uD83D\uDCCA", count: meddicGapDeals.length, label: "MEDDIC", color: "#d97706" },
      { icon: "\uD83D\uDCDE", count: meetingLeads.length, label: "Prep", color: "#059669" },
      { icon: "\uD83D\uDCC5", count: upcomingEvents.length, label: "Events", color: "#7c3aed" },
      { icon: "\uD83D\uDD17", count: linkedInOnly.length, label: "LinkedIn", color: "#0077b5" },
    ];
  }, [leads, deals, events]);

  // ── Greeting summary ──

  const greetingSummary = useMemo(() => {
    const actionableCount = leads.filter(
      (l) => !l.disqualifyReason && (l.icpScore?.tier === "hot" || l.icpScore?.tier === "warm")
    ).length;
    const readyDrafts = leads.reduce(
      (acc, l) => acc + l.draftMessages.filter((d) => d.status === "draft").length,
      0
    );
    return { actionableCount, readyDrafts };
  }, [leads]);

  // ── Priority queue (top 5 most urgent) ──

  const priorityItems = useMemo((): PriorityItem[] => {
    const items: PriorityItem[] = [];

    leads.forEach((l) => {
      if (l.disqualifyReason) return;
      const d = daysUntil(l.nextStepDate);
      if (d < 0) {
        items.push({ lead: l, urgency: "overdue", daysLeft: d });
      } else if (d === 0) {
        items.push({ lead: l, urgency: "today", daysLeft: 0 });
      } else if (l.icpScore?.tier === "hot") {
        items.push({ lead: l, urgency: "hot", daysLeft: d });
      }
    });

    // Sort: overdue first (most overdue), then today, then hot
    items.sort((a, b) => {
      const urgencyOrder = { overdue: 0, today: 1, hot: 2 };
      if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      }
      return a.daysLeft - b.daysLeft;
    });

    return items.slice(0, 5);
  }, [leads]);

  // ── LinkedIn-only leads (top 3) ──

  const linkedInLeads = useMemo(() => {
    return leads
      .filter((l) => l.channels?.linkedin && !l.channels?.email && !l.disqualifyReason)
      .slice(0, 3);
  }, [leads]);

  // ── Tab badge counts ──

  const overdueTodayCount = useMemo(() => {
    return leads.filter((l) => {
      const d = daysUntil(l.nextStepDate);
      return d <= 0 && !l.disqualifyReason;
    }).length;
  }, [leads]);

  const followupCount = useMemo(() => {
    return leads.filter((l) => !l.disqualifyReason && l.nextStepDate).length;
  }, [leads]);

  const unreadNotifCount = useMemo(() => {
    return leads.filter(
      (l) =>
        l.contactStatus === "positive" ||
        (l.emailStatus === "opened" && l.emailsSentCount && l.emailsSentCount > 0)
    ).length;
  }, [leads]);

  const tabs = [
    { key: "actions" as const, label: "Actions", badge: overdueTodayCount > 0 ? overdueTodayCount : undefined },
    { key: "followups" as const, label: "Follow-ups", badge: followupCount > 0 ? followupCount : undefined },
    { key: "notifications" as const, label: "Notifications", badge: unreadNotifCount > 0 ? unreadNotifCount : undefined },
  ];

  return (
    <div>
      {/* Sticky tab bar */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "var(--balboa-bg, white)",
        paddingTop: 4,
      }}>
        <SectionTabBar<HomeTab>
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>

      {/* ══════════ ACTIONS TAB ══════════ */}
      {activeTab === "actions" && (
        <div>
          {/* Greeting — compact */}
          <div style={{ marginBottom: 14 }}>
            <h2 style={{
              fontSize: 18,
              fontWeight: 800,
              color: "var(--balboa-navy)",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
              margin: 0,
            }}>
              {getGreeting()} {"\uD83D\uDC4B"}
            </h2>
            <p style={{
              fontSize: 12,
              color: "var(--balboa-text-muted)",
              marginTop: 3,
              lineHeight: 1.4,
              margin: 0,
            }}>
              <strong style={{ color: "var(--balboa-navy)" }}>{greetingSummary.actionableCount}</strong> people to reach out to
              {greetingSummary.readyDrafts > 0 && (
                <>, <strong style={{ color: "var(--balboa-blue)" }}>{greetingSummary.readyDrafts}</strong> message{greetingSummary.readyDrafts > 1 ? "s" : ""} ready</>
              )}.
              {" "}Let&apos;s go.
            </p>
          </div>

          {/* KPI strip — compact horizontal chips */}
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 20,
          }}>
            {kpiChips.map((chip) => (
              <KPIChip key={chip.label} {...chip} />
            ))}
          </div>

          {/* Priority Queue — top 5 */}
          <div style={{ marginBottom: 24 }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}>
              <h3 style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--balboa-navy)",
                textTransform: "uppercase",
                letterSpacing: "0.03em",
                margin: 0,
              }}>
                Priority Queue
              </h3>
              <button
                onClick={() => setActiveTab("followups")}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--balboa-blue)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  padding: 0,
                }}
              >
                View all follow-ups <ChevronRight size={12} />
              </button>
            </div>

            <div className="card" style={{ padding: 4, overflow: "hidden" }}>
              {priorityItems.length > 0 ? (
                priorityItems.map((item) => (
                  <PriorityRow
                    key={item.lead.id}
                    item={item}
                    onNavigate={onNavigateToLead}
                    onGenerate={onGenerateMessage}
                    onCopy={onCopyMessage}
                  />
                ))
              ) : (
                <div style={{
                  padding: 24,
                  textAlign: "center",
                  color: "var(--balboa-text-muted)",
                  fontSize: 13,
                }}>
                  No urgent items — you&apos;re all caught up! 🎉
                </div>
              )}
            </div>
          </div>

          {/* LinkedIn Summary — top 3 */}
          {linkedInLeads.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}>
                <h3 style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--balboa-navy)",
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                  margin: 0,
                }}>
                  LinkedIn Connections
                </h3>
                <span style={{ fontSize: 11, color: "var(--balboa-text-muted)" }}>
                  {linkedInLeads.length} of {leads.filter((l) => l.channels?.linkedin && !l.channels?.email).length}
                </span>
              </div>

              <div className="card" style={{ padding: 4, overflow: "hidden" }}>
                {linkedInLeads.map((lead) => (
                  <LinkedInSummaryRow key={lead.id} lead={lead} onNavigate={onNavigateToLead} />
                ))}
              </div>
            </div>
          )}

          {/* Compact Outreach Command Center — still available for power users */}
          <OutreachCommandCenter
            leads={leads}
            onNavigateToLead={onNavigateToLead}
            onUpdateLead={onUpdateLead}
            onGenerateMessage={onGenerateMessage}
            onCopyMessage={onCopyMessage}
            generatingForLeadId={generatingForLeadId}
            defaultTab="today"
            hideTabNav
          />
        </div>
      )}

      {/* ══════════ FOLLOW-UPS TAB ══════════ */}
      {activeTab === "followups" && (
        <OutreachCommandCenter
          leads={leads}
          onNavigateToLead={onNavigateToLead}
          onUpdateLead={onUpdateLead}
          onGenerateMessage={onGenerateMessage}
          onCopyMessage={onCopyMessage}
          generatingForLeadId={generatingForLeadId}
          defaultTab="followups"
          hideTabNav
        />
      )}

      {/* ══════════ NOTIFICATIONS TAB ══════════ */}
      {activeTab === "notifications" && (
        <NotificationCenter leads={leads} />
      )}
    </div>
  );
}
