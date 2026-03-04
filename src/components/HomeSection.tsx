"use client";

import { useState, useMemo } from "react";
import { Clock, CheckCircle, MessageSquare, Send, AlertCircle } from "lucide-react";
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

// ── Stat pill (inline in the brief bar) ──

function StatPill({ icon, value, label, color }: {
  icon: React.ReactNode;
  value: number;
  label: string;
  color: string;
}) {
  if (value === 0) return null;
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 5,
      padding: "4px 10px",
      borderRadius: 6,
      background: `${color}0a`,
      border: `1px solid ${color}18`,
    }}>
      <span style={{ color, display: "flex" }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--balboa-text-muted)" }}>{label}</span>
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

  // Suppress unused variable warnings
  void deals;
  void events;

  // ── Key stats for the brief bar ──

  const stats = useMemo(() => {
    const dueToday = leads.filter((l) => {
      const d = daysUntil(l.nextStepDate);
      return d <= 0 && !l.disqualifyReason;
    }).length;

    const positiveReplies = leads.filter(
      (l) => l.contactStatus === "positive" && !l.disqualifyReason
    ).length;

    const draftsReady = leads.reduce(
      (acc, l) => acc + l.draftMessages.filter((d) => d.status === "draft").length,
      0
    );

    const noReply = leads.filter(
      (l) =>
        l.contactStatus === "not_contacted" &&
        l.emailsSentCount &&
        l.emailsSentCount > 0 &&
        !l.disqualifyReason
    ).length;

    return { dueToday, positiveReplies, draftsReady, noReply };
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
          {/* ── Daily Brief Bar ── */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            background: "linear-gradient(135deg, rgba(30,42,94,0.04) 0%, rgba(37,99,235,0.04) 100%)",
            borderRadius: 10,
            marginBottom: 16,
            gap: 12,
            flexWrap: "wrap",
          }}>
            {/* Left: greeting */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>{"\uD83D\uDC4B"}</span>
              <span style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--balboa-navy)",
              }}>
                {getGreeting()}
              </span>
            </div>

            {/* Right: stat pills — only show non-zero */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <StatPill icon={<Clock size={12} />} value={stats.dueToday} label="due today" color="#dc2626" />
              <StatPill icon={<CheckCircle size={12} />} value={stats.positiveReplies} label="positive" color="#059669" />
              <StatPill icon={<Send size={12} />} value={stats.draftsReady} label="drafts ready" color="#2563eb" />
              <StatPill icon={<AlertCircle size={12} />} value={stats.noReply} label="no reply" color="#d97706" />
            </div>
          </div>

          {/* ── Action List — the real deal ── */}
          <OutreachCommandCenter
            leads={leads}
            onNavigateToLead={onNavigateToLead}
            onUpdateLead={onUpdateLead}
            onGenerateMessage={onGenerateMessage}
            onCopyMessage={onCopyMessage}
            generatingForLeadId={generatingForLeadId}
            defaultTab="today"
            hideTabNav
            hideSummaryStrip
          />

          {/* ── LinkedIn Queue below ── */}
          <div style={{ marginTop: 24 }}>
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
