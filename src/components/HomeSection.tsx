"use client";

import { useState, useMemo } from "react";
import {
  ChevronRight, Sparkles, Send, Clock,
  MessageSquare, Copy, Check,
} from "lucide-react";
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

// ── Workflow Section wrapper ──

function WorkflowSection({
  emoji,
  title,
  subtitle,
  count,
  accentColor,
  onSeeAll,
  seeAllLabel,
  children,
  emptyMessage,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  count: number;
  accentColor: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
  children: React.ReactNode;
  emptyMessage?: string;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      {/* Section header */}
      <div style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        marginBottom: 10,
        gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>{emoji}</span>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--balboa-navy)" }}>
                {title}
              </span>
              {count > 0 && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "1px 7px",
                  borderRadius: 10,
                  background: `${accentColor}15`,
                  color: accentColor,
                }}>
                  {count}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--balboa-text-muted)", marginTop: 1 }}>
              {subtitle}
            </div>
          </div>
        </div>
        {onSeeAll && count > 0 && (
          <button
            onClick={onSeeAll}
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
              padding: "4px 0",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {seeAllLabel || "See all"} <ChevronRight size={12} />
          </button>
        )}
      </div>

      {/* Section content */}
      {count > 0 ? (
        <div className="card" style={{ overflow: "hidden" }}>
          {children}
        </div>
      ) : (
        <div style={{
          padding: "16px 20px",
          borderRadius: 10,
          background: "rgba(30,42,94,0.02)",
          border: "1px dashed rgba(148,163,184,0.2)",
          color: "var(--balboa-text-muted)",
          fontSize: 12,
          textAlign: "center",
        }}>
          {emptyMessage || "Nothing here right now"}
        </div>
      )}
    </div>
  );
}

// ── Reply card (for "Respond Now" section) ──

function ReplyCard({
  lead,
  onNavigate,
  onGenerate,
  onCopy,
  generatingForLeadId,
}: {
  lead: Lead;
  onNavigate: (id: string) => void;
  onGenerate: (lead: Lead, type: string) => void;
  onCopy: (text: string) => void;
  generatingForLeadId: string | null;
}) {
  const initials = `${lead.firstName?.[0] || ""}${lead.lastName?.[0] || ""}`.toUpperCase();
  const draft = lead.draftMessages.find((d) => d.status === "draft");
  const isGenerating = generatingForLeadId === lead.id;

  return (
    <div style={{
      padding: "14px 16px",
      borderBottom: "1px solid rgba(148,163,184,0.08)",
      display: "flex",
      gap: 12,
    }}>
      {/* Avatar */}
      <div style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: "#059669",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 700,
        flexShrink: 0,
      }}>
        {initials}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Name + company */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <span
            style={{ fontSize: 13, fontWeight: 700, color: "var(--balboa-navy)", cursor: "pointer" }}
            onClick={() => onNavigate(lead.id)}
          >
            {lead.firstName} {lead.lastName}
          </span>
          <span style={{ fontSize: 11, color: "var(--balboa-text-muted)" }}>
            {lead.company}
          </span>
        </div>

        {/* What they did — the reason this is here */}
        <div style={{
          fontSize: 12,
          color: "#059669",
          fontWeight: 600,
          marginBottom: 6,
        }}>
          {lead.nextStep || "Replied positively — respond to keep momentum"}
        </div>

        {/* Draft preview if available */}
        {draft && (
          <div style={{
            padding: "8px 10px",
            background: "rgba(5,150,105,0.05)",
            borderRadius: 6,
            border: "1px solid rgba(5,150,105,0.12)",
            marginBottom: 8,
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#059669", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.03em" }}>
              Draft ready
            </div>
            <div style={{
              fontSize: 12,
              color: "var(--balboa-text)",
              lineHeight: 1.4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {draft.body.slice(0, 120)}{draft.body.length > 120 ? "..." : ""}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button
                onClick={() => onCopy(draft.body)}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  background: "#059669",
                  color: "white",
                  border: "none",
                  borderRadius: 5,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Copy size={10} />
                Copy & Send
              </button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!draft && (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => onGenerate(lead, "follow_up")}
              disabled={isGenerating}
              style={{
                padding: "5px 12px",
                fontSize: 11,
                fontWeight: 600,
                background: "rgba(5,150,105,0.08)",
                color: "#059669",
                border: "1px solid rgba(5,150,105,0.15)",
                borderRadius: 6,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Sparkles size={11} />
              {isGenerating ? "Generating..." : "Draft Response"}
            </button>
            <button
              onClick={() => onNavigate(lead.id)}
              style={{
                padding: "5px 12px",
                fontSize: 11,
                fontWeight: 600,
                background: "transparent",
                color: "var(--balboa-text-muted)",
                border: "1px solid var(--balboa-border-light)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              View Lead
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Follow-up card (for "Follow Up Today" section) ──

function FollowUpCard({
  lead,
  daysOverdue,
  onNavigate,
  onGenerate,
  generatingForLeadId,
}: {
  lead: Lead;
  daysOverdue: number;
  onNavigate: (id: string) => void;
  onGenerate: (lead: Lead, type: string) => void;
  generatingForLeadId: string | null;
}) {
  const initials = `${lead.firstName?.[0] || ""}${lead.lastName?.[0] || ""}`.toUpperCase();
  const isGenerating = generatingForLeadId === lead.id;

  const urgencyLabel = daysOverdue > 0
    ? `${daysOverdue}d overdue`
    : "Due today";
  const urgencyColor = daysOverdue > 0 ? "#dc2626" : "#d97706";

  // Figure out the best action recommendation
  const action = lead.nextStep
    || (lead.lastOutreachMethod === "email" ? "Follow up on email" : null)
    || (lead.lastOutreachMethod === "linkedin" ? "Follow up on LinkedIn" : null)
    || "Send follow-up message";

  return (
    <div style={{
      padding: "12px 16px",
      borderBottom: "1px solid rgba(148,163,184,0.08)",
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}>
      {/* Avatar */}
      <div style={{
        width: 34,
        height: 34,
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
          <span
            style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-navy)", cursor: "pointer" }}
            onClick={() => onNavigate(lead.id)}
          >
            {lead.firstName} {lead.lastName}
          </span>
          <span style={{ fontSize: 11, color: "var(--balboa-text-muted)" }}>
            {lead.company}
          </span>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "1px 6px",
            borderRadius: 4,
            background: `${urgencyColor}10`,
            color: urgencyColor,
            marginLeft: "auto",
            flexShrink: 0,
          }}>
            {urgencyLabel}
          </span>
        </div>
        <div style={{
          fontSize: 12,
          color: "var(--balboa-text-muted)",
          marginTop: 2,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}>
          <span style={{ color: "var(--balboa-blue)", fontWeight: 500 }}>→ {action}</span>
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <button
          onClick={() => onGenerate(lead, "follow_up")}
          disabled={isGenerating}
          title="Generate follow-up"
          style={{
            padding: "6px 10px",
            fontSize: 11,
            fontWeight: 600,
            background: "rgba(37,99,235,0.06)",
            color: "var(--balboa-blue)",
            border: "1px solid rgba(37,99,235,0.12)",
            borderRadius: 6,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {isGenerating ? <Clock size={11} /> : <Send size={11} />}
          {isGenerating ? "..." : "Draft"}
        </button>
        <button
          onClick={() => onNavigate(lead.id)}
          title="View lead"
          style={{
            padding: "6px",
            background: "transparent",
            border: "1px solid var(--balboa-border-light)",
            borderRadius: 6,
            cursor: "pointer",
            display: "flex",
            color: "var(--balboa-text-muted)",
          }}
        >
          <ChevronRight size={13} />
        </button>
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

  void deals;
  void events;

  // ── 1. Positive replies (respond now) ──
  const positiveLeads = useMemo(() => {
    return leads
      .filter((l) => l.contactStatus === "positive" && !l.disqualifyReason)
      .slice(0, 4);
  }, [leads]);

  const totalPositive = useMemo(() => {
    return leads.filter((l) => l.contactStatus === "positive" && !l.disqualifyReason).length;
  }, [leads]);

  // ── 2. Due today / overdue (follow up) ──
  const followUpLeads = useMemo(() => {
    return leads
      .filter((l) => {
        if (l.disqualifyReason) return false;
        if (l.contactStatus === "positive") return false; // already in section 1
        const d = daysUntil(l.nextStepDate);
        return d <= 0;
      })
      .map((l) => ({
        lead: l,
        daysOverdue: Math.max(0, -daysUntil(l.nextStepDate)),
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 5);
  }, [leads]);

  const totalFollowUp = useMemo(() => {
    return leads.filter((l) => {
      if (l.disqualifyReason) return false;
      if (l.contactStatus === "positive") return false;
      return daysUntil(l.nextStepDate) <= 0;
    }).length;
  }, [leads]);

  // ── 3. LinkedIn count for badge ──
  const linkedInCount = useMemo(() => {
    return leads.filter(
      (l) => l.channels?.linkedin && !l.disqualifyReason && l.linkedinStage && l.linkedinStage !== "meeting_booked"
    ).length;
  }, [leads]);

  // ── Tab badges ──
  const actionsBadge = totalPositive + totalFollowUp;

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
    { key: "actions" as const, label: "Actions", badge: actionsBadge > 0 ? actionsBadge : undefined },
    { key: "followups" as const, label: "All Leads", badge: followupCount > 0 ? followupCount : undefined },
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
          {/* Greeting — one line */}
          <div style={{
            padding: "10px 0",
            marginBottom: 4,
          }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)" }}>
              {getGreeting()} {"\uD83D\uDC4B"}
            </span>
            <span style={{ fontSize: 13, color: "var(--balboa-text-muted)", marginLeft: 8 }}>
              Here&apos;s what needs your attention.
            </span>
          </div>

          {/* ── Section 1: Respond Now ── */}
          <WorkflowSection
            emoji="🟢"
            title="Respond Now"
            subtitle="These people replied — respond before they go cold"
            count={totalPositive}
            accentColor="#059669"
            onSeeAll={() => setActiveTab("followups")}
            seeAllLabel={totalPositive > 4 ? `See all ${totalPositive}` : "See all leads"}
            emptyMessage="No positive replies yet — keep outreaching!"
          >
            {positiveLeads.map((lead) => (
              <ReplyCard
                key={lead.id}
                lead={lead}
                onNavigate={onNavigateToLead}
                onGenerate={onGenerateMessage}
                onCopy={onCopyMessage}
                generatingForLeadId={generatingForLeadId}
              />
            ))}
          </WorkflowSection>

          {/* ── Section 2: Follow Up Today ── */}
          <WorkflowSection
            emoji="📋"
            title="Follow Up Today"
            subtitle="Overdue or due today — don&apos;t let these slip"
            count={totalFollowUp}
            accentColor="#dc2626"
            onSeeAll={() => setActiveTab("followups")}
            seeAllLabel={totalFollowUp > 5 ? `See all ${totalFollowUp}` : "See all leads"}
            emptyMessage="All caught up — no follow-ups due today!"
          >
            {followUpLeads.map(({ lead, daysOverdue }) => (
              <FollowUpCard
                key={lead.id}
                lead={lead}
                daysOverdue={daysOverdue}
                onNavigate={onNavigateToLead}
                onGenerate={onGenerateMessage}
                generatingForLeadId={generatingForLeadId}
              />
            ))}
          </WorkflowSection>

          {/* ── Section 3: LinkedIn Pipeline ── */}
          <WorkflowSection
            emoji="🔗"
            title="LinkedIn Pipeline"
            subtitle="Connections to work through — move them forward"
            count={linkedInCount}
            accentColor="#0077b5"
            emptyMessage="No LinkedIn connections to process right now"
          >
            <div style={{ margin: -1 }}>
              <LinkedInQueue
                leads={leads}
                onNavigateToLead={onNavigateToLead}
                onUpdateLead={onUpdateLead}
                onGenerateMessage={onGenerateMessage}
                onCopyMessage={onCopyMessage}
                generatingForLeadId={generatingForLeadId}
              />
            </div>
          </WorkflowSection>
        </div>
      )}

      {/* ══════════ ALL LEADS TAB ══════════ */}
      {activeTab === "followups" && (
        <OutreachCommandCenter
          leads={leads}
          onNavigateToLead={onNavigateToLead}
          onUpdateLead={onUpdateLead}
          onGenerateMessage={onGenerateMessage}
          onCopyMessage={onCopyMessage}
          generatingForLeadId={generatingForLeadId}
          defaultTab="leads"
        />
      )}

      {/* ══════════ NOTIFICATIONS TAB ══════════ */}
      {activeTab === "notifications" && (
        <NotificationCenter leads={leads} />
      )}
    </div>
  );
}
