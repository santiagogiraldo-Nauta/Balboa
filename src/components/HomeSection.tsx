"use client";

import { useState, useMemo } from "react";
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

// ── Action Card ──

interface ActionCardData {
  icon: string;
  title: string;
  count: number;
  description: string;
  accentColor: string;
}

function ActionCard({ icon, title, count, description, accentColor }: ActionCardData) {
  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderLeft: `3px solid ${accentColor}`,
        cursor: "pointer",
        transition: "box-shadow 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 2px 12px rgba(30,42,94,0.10)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "";
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--balboa-text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.03em",
            marginBottom: 2,
          }}>
            {title}
          </div>
          <div style={{
            fontSize: 24,
            fontWeight: 800,
            color: accentColor,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
          }}>
            {count}
          </div>
          <div style={{
            fontSize: 11,
            color: "var(--balboa-text-muted)",
            marginTop: 2,
            lineHeight: 1.4,
          }}>
            {description}
          </div>
        </div>
      </div>
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

  // ── Compute action card data ──

  const actionCards = useMemo((): ActionCardData[] => {
    // Hot follow-ups: hot/warm leads needing action
    const hotLeads = leads.filter(
      (l) => !l.disqualifyReason && (l.icpScore?.tier === "hot" || l.icpScore?.tier === "warm")
    );
    const overdueFollowups = leads.filter((l) => daysUntil(l.nextStepDate) < 0 && !l.disqualifyReason);

    // Proposals due: deals at proposal or negotiation stage
    const proposalDeals = deals.filter(
      (d) => d.dealStage === "proposal" || d.dealStage === "negotiation"
    );

    // MEDDIC gaps: deals missing key fields
    const meddicGapDeals = deals.filter((d) => {
      const missing =
        !d.amount ||
        !d.probability ||
        !d.nextAction ||
        !d.strategyRecommendation ||
        d.dealStage === "qualification";
      return missing && d.dealStage !== "closed_won" && d.dealStage !== "closed_lost";
    });

    // Prep needed: leads with meetings scheduled
    const meetingLeads = leads.filter((l) => l.meetingScheduled === true);

    // Upcoming events within 14 days
    const upcomingEvents = events.filter((ev) => {
      const d = daysUntil(ev.date);
      return d >= 0 && d <= 14 && ev.status !== "completed";
    });

    // LinkedIn queue: LinkedIn-only leads (no email)
    const linkedInOnly = leads.filter((l) => l.channels?.linkedin && !l.channels?.email);

    return [
      {
        icon: "\uD83D\uDD25",
        title: "Hot Follow-ups",
        count: hotLeads.length,
        description: `${hotLeads.filter((l) => l.icpScore?.tier === "hot").length} hot leads, ${overdueFollowups.length} overdue follow-ups`,
        accentColor: "#dc2626",
      },
      {
        icon: "\uD83D\uDCCB",
        title: "Proposals Due",
        count: proposalDeals.length,
        description: `${proposalDeals.length} proposal${proposalDeals.length !== 1 ? "s" : ""} to draft`,
        accentColor: "#2563eb",
      },
      {
        icon: "\uD83D\uDCCA",
        title: "MEDDIC Gaps",
        count: meddicGapDeals.length,
        description: `${meddicGapDeals.length} deal${meddicGapDeals.length !== 1 ? "s" : ""} with incomplete MEDDIC`,
        accentColor: "#d97706",
      },
      {
        icon: "\uD83D\uDCDE",
        title: "Prep Needed",
        count: meetingLeads.length,
        description: `${meetingLeads.length} meeting${meetingLeads.length !== 1 ? "s" : ""} need prep kits`,
        accentColor: "#059669",
      },
      {
        icon: "\uD83D\uDCC5",
        title: "Upcoming Events",
        count: upcomingEvents.length,
        description: `${upcomingEvents.length} event${upcomingEvents.length !== 1 ? "s" : ""} in next 2 weeks`,
        accentColor: "#7c3aed",
      },
      {
        icon: "\uD83D\uDD17",
        title: "LinkedIn Queue",
        count: linkedInOnly.length,
        description: `${linkedInOnly.length} connection${linkedInOnly.length !== 1 ? "s" : ""} to process`,
        accentColor: "#0077b5",
      },
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
    const proposalCount = deals.filter(
      (d) => d.dealStage === "proposal" || d.dealStage === "negotiation"
    ).length;
    const meddicGaps = deals.filter(
      (d) =>
        (!d.amount || !d.probability || !d.nextAction || !d.strategyRecommendation) &&
        d.dealStage !== "closed_won" &&
        d.dealStage !== "closed_lost"
    ).length;

    return { actionableCount, readyDrafts, proposalCount, meddicGaps };
  }, [leads, deals]);

  // ── Tab badge counts ──

  const overdueTodayCount = useMemo(() => {
    return leads.filter((l) => {
      const d = daysUntil(l.nextStepDate);
      return (d <= 0) && !l.disqualifyReason;
    }).length;
  }, [leads]);

  const followupCount = useMemo(() => {
    return leads.filter((l) => !l.disqualifyReason && l.nextStepDate).length;
  }, [leads]);

  const unreadNotifCount = useMemo(() => {
    // Approximate: leads with recent signals get notification-like items
    return leads.filter(
      (l) =>
        l.contactStatus === "positive" ||
        (l.emailStatus === "opened" && l.emailsSentCount && l.emailsSentCount > 0)
    ).length;
  }, [leads]);

  // ── Tabs config ──

  const tabs = [
    { key: "actions" as const, label: "Actions", badge: overdueTodayCount > 0 ? overdueTodayCount : undefined },
    { key: "followups" as const, label: "Follow-ups", badge: followupCount > 0 ? followupCount : undefined },
    { key: "notifications" as const, label: "Notifications", badge: unreadNotifCount > 0 ? unreadNotifCount : undefined },
  ];

  return (
    <div className="p-6">
      <SectionTabBar<HomeTab>
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* ══════════ ACTIONS TAB ══════════ */}
      {activeTab === "actions" && (
        <div>
          {/* Greeting block */}
          <div style={{ marginBottom: 20 }}>
            <h2 style={{
              fontSize: 20,
              fontWeight: 800,
              color: "var(--balboa-navy)",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}>
              {getGreeting()} {"\uD83D\uDC4B"}
            </h2>
            <p style={{
              fontSize: 13,
              color: "var(--balboa-text-muted)",
              marginTop: 4,
              lineHeight: 1.5,
            }}>
              You have{" "}
              <strong style={{ color: "var(--balboa-navy)" }}>{greetingSummary.actionableCount}</strong>{" "}
              people to reach out to
              {greetingSummary.readyDrafts > 0 && (
                <>
                  {" "}and{" "}
                  <strong style={{ color: "var(--balboa-blue)" }}>{greetingSummary.readyDrafts}</strong>{" "}
                  message{greetingSummary.readyDrafts > 1 ? "s" : ""} ready to send
                </>
              )}.
              {greetingSummary.proposalCount > 0 && (
                <> {greetingSummary.proposalCount} proposal{greetingSummary.proposalCount > 1 ? "s" : ""} due</>
              )}
              {greetingSummary.meddicGaps > 0 && (
                <>, {greetingSummary.meddicGaps} MEDDIC gap{greetingSummary.meddicGaps > 1 ? "s" : ""}</>
              )}.
              {" "}Let&apos;s go.
            </p>
          </div>

          {/* Action cards grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 28,
          }}>
            {actionCards.map((card) => (
              <ActionCard key={card.title} {...card} />
            ))}
          </div>

          {/* Outreach Command Center */}
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

          {/* LinkedIn Queue */}
          <div style={{ marginTop: 32 }}>
            <LinkedInQueue
              leads={leads}
              onNavigateToLead={onNavigateToLead}
              onUpdateLead={onUpdateLead}
              onGenerateMessage={onGenerateMessage}
              onCopyMessage={onCopyMessage}
              generatingForLeadId={generatingForLeadId}
            />
          </div>
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
