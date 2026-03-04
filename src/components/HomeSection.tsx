"use client";

import { useState, useEffect, useMemo } from "react";
import { ChevronRight, MessageSquare, Mail, Send, Inbox, RefreshCw, Download } from "lucide-react";
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
  onAskVasco?: (prompt: string) => void;
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
}: {
  lead: Lead;
  onNavigate: (id: string) => void;
}) {
  const initials = `${lead.firstName?.[0] || ""}${lead.lastName?.[0] || ""}`.toUpperCase();
  const draft = lead.draftMessages.find((d) => d.status === "draft");

  return (
    <div
      style={{
        padding: "12px 16px",
        borderBottom: "1px solid rgba(148,163,184,0.08)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        cursor: "pointer",
        transition: "background 0.1s ease",
      }}
      onClick={() => onNavigate(lead.id)}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(5,150,105,0.03)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
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

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--balboa-navy)" }}>
            {lead.firstName} {lead.lastName}
          </span>
          <span style={{ fontSize: 11, color: "var(--balboa-text-muted)" }}>
            {lead.company}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "#059669", fontWeight: 600 }}>
          → {lead.nextStep || "Replied positively — respond to keep momentum"}
        </div>
        {draft && (
          <div style={{
            fontSize: 11,
            color: "var(--balboa-text-muted)",
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            📝 Draft ready: {draft.body.slice(0, 80)}...
          </div>
        )}
      </div>

      {/* Respond button */}
      <button
        onClick={(e) => { e.stopPropagation(); onNavigate(lead.id); }}
        style={{
          padding: "7px 14px",
          fontSize: 12,
          fontWeight: 700,
          background: "#059669",
          color: "white",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 5,
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        <MessageSquare size={12} />
        Respond
      </button>
    </div>
  );
}

// ── Follow-up card (for "Follow Up Today" section) ──

function FollowUpCard({
  lead,
  daysOverdue,
  onNavigate,
}: {
  lead: Lead;
  daysOverdue: number;
  onNavigate: (id: string) => void;
}) {
  const initials = `${lead.firstName?.[0] || ""}${lead.lastName?.[0] || ""}`.toUpperCase();

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
    <div
      style={{
        padding: "12px 16px",
        borderBottom: "1px solid rgba(148,163,184,0.08)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        cursor: "pointer",
        transition: "background 0.1s ease",
      }}
      onClick={() => onNavigate(lead.id)}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(220,38,38,0.03)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
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
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-navy)" }}>
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
        }}>
          <span style={{ color: "var(--balboa-blue)", fontWeight: 500 }}>→ {action}</span>
        </div>
      </div>

      {/* Open button */}
      <button
        onClick={(e) => { e.stopPropagation(); onNavigate(lead.id); }}
        style={{
          padding: "7px 14px",
          fontSize: 12,
          fontWeight: 700,
          background: "rgba(37,99,235,0.08)",
          color: "var(--balboa-blue)",
          border: "1px solid rgba(37,99,235,0.12)",
          borderRadius: 6,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 5,
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        <ChevronRight size={12} />
        Open
      </button>
    </div>
  );
}

// ── Component ──

// ── Email Activity Card (shown when leads are empty or metrics available) ──

function EmailActivityCard({
  metrics,
  onSyncGmail,
  onImportContacts,
  syncing,
  importing,
}: {
  metrics: EmailMetrics | null;
  onSyncGmail: () => void;
  onImportContacts: () => void;
  syncing: boolean;
  importing: boolean;
}) {
  if (!metrics) return null;

  const statItems = [
    { label: "Sent", value: metrics.sent, icon: <Send size={13} style={{ color: "var(--balboa-blue)" }} /> },
    { label: "Received", value: metrics.received, icon: <Inbox size={13} style={{ color: "#059669" }} /> },
    { label: "Threads", value: metrics.totalThreads, icon: <Mail size={13} style={{ color: "var(--balboa-navy)" }} /> },
    { label: "Response rate", value: `${metrics.responseRate}%`, icon: <RefreshCw size={13} style={{ color: "#d97706" }} /> },
  ];

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Email stats bar */}
      <div className="card" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Mail size={16} style={{ color: "var(--balboa-blue)" }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--balboa-navy)" }}>
            Email Activity
          </span>
          {metrics.unreadCount > 0 && (
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "1px 7px",
              borderRadius: 10,
              background: "rgba(220,38,38,0.08)",
              color: "#dc2626",
            }}>
              {metrics.unreadCount} unread
            </span>
          )}
          {metrics.messagesToday > 0 && (
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--balboa-text-muted)",
              marginLeft: "auto",
            }}>
              {metrics.messagesToday} today
            </span>
          )}
        </div>

        {/* Stats grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
        }}>
          {statItems.map((item) => (
            <div key={item.label} style={{
              textAlign: "center",
              padding: "10px 4px",
              borderRadius: 10,
              background: "rgba(30,42,94,0.02)",
            }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
                {item.icon}
              </div>
              <div style={{
                fontSize: 18,
                fontWeight: 800,
                color: "var(--balboa-navy)",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}>
                {item.value}
              </div>
              <div style={{
                fontSize: 10,
                color: "var(--balboa-text-muted)",
                fontWeight: 500,
                marginTop: 3,
              }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>

        {/* Matched vs unmatched summary */}
        {metrics.matchedThreads > 0 && (
          <div style={{
            marginTop: 12,
            padding: "8px 12px",
            borderRadius: 8,
            background: "rgba(5,150,105,0.04)",
            fontSize: 12,
            color: "var(--balboa-text-secondary)",
          }}>
            <span style={{ fontWeight: 600, color: "#059669" }}>{metrics.matchedThreads}</span> threads matched to leads
            {metrics.unmatchedThreads > 0 && (
              <span> &middot; <span style={{ fontWeight: 600, color: "var(--balboa-text-muted)" }}>{metrics.unmatchedThreads}</span> unmatched</span>
            )}
          </div>
        )}
      </div>

      {/* Sync & Import actions */}
      <div style={{
        display: "flex",
        gap: 10,
        marginTop: 12,
      }}>
        <button
          onClick={onSyncGmail}
          disabled={syncing}
          style={{
            flex: 1,
            padding: "10px 16px",
            fontSize: 12,
            fontWeight: 700,
            background: syncing ? "rgba(59,91,219,0.06)" : "rgba(59,91,219,0.08)",
            color: "var(--balboa-blue)",
            border: "1px solid rgba(59,91,219,0.12)",
            borderRadius: 10,
            cursor: syncing ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <RefreshCw size={13} style={syncing ? { animation: "spin 1s linear infinite" } : {}} />
          {syncing ? "Syncing..." : "Sync Gmail"}
        </button>
        <button
          onClick={onImportContacts}
          disabled={importing}
          style={{
            flex: 1,
            padding: "10px 16px",
            fontSize: 12,
            fontWeight: 700,
            background: importing ? "rgba(5,150,105,0.06)" : "rgba(5,150,105,0.08)",
            color: "#059669",
            border: "1px solid rgba(5,150,105,0.12)",
            borderRadius: 10,
            cursor: importing ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Download size={13} />
          {importing ? "Importing..." : "Import contacts from Gmail"}
        </button>
      </div>
    </div>
  );
}

// ── Email metrics type ──

interface EmailMetrics {
  totalThreads: number;
  totalMessages: number;
  sent: number;
  received: number;
  matchedThreads: number;
  unmatchedThreads: number;
  messagesToday: number;
  unreadCount: number;
  responseRate: number;
}

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

  // Email metrics state
  const [emailMetrics, setEmailMetrics] = useState<EmailMetrics | null>(null);
  const [syncingGmail, setSyncingGmail] = useState(false);
  const [importingContacts, setImportingContacts] = useState(false);

  // Fetch email metrics on mount
  useEffect(() => {
    fetch("/api/gmail/metrics")
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) setEmailMetrics(data);
      })
      .catch(() => {});
  }, []);

  // Manual sync handler
  const handleSyncGmail = async () => {
    setSyncingGmail(true);
    try {
      const res = await fetch("/api/gmail/sync");
      const data = await res.json();
      if (data.connected) {
        // Refresh metrics after sync
        const metricsRes = await fetch("/api/gmail/metrics");
        const metricsData = await metricsRes.json();
        if (metricsData && !metricsData.error) setEmailMetrics(metricsData);
        localStorage.setItem("balboa_gmail_last_sync", String(Date.now()));
      }
    } catch (err) {
      console.error("Manual Gmail sync failed:", err);
    }
    setSyncingGmail(false);
  };

  // Manual import handler
  const handleImportContacts = async () => {
    setImportingContacts(true);
    try {
      const res = await fetch("/api/gmail/import-contacts", { method: "POST" });
      const data = await res.json();
      if (data.imported > 0) {
        // Reload the page to pick up new leads
        window.location.reload();
      }
    } catch (err) {
      console.error("Import contacts failed:", err);
    }
    setImportingContacts(false);
  };

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

      {/* When no leads: show email activity + import instead of empty state */}
      {leads.length === 0 && (
        <div style={{ padding: "10px 0" }}>
          <div style={{
            padding: "10px 0",
            marginBottom: 8,
          }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)" }}>
              {getGreeting()}
            </span>
            <span style={{ fontSize: 13, color: "var(--balboa-text-muted)", marginLeft: 8 }}>
              {emailMetrics ? "Here is your email activity." : "Connect Gmail to get started."}
            </span>
          </div>

          {emailMetrics && (
            <EmailActivityCard
              metrics={emailMetrics}
              onSyncGmail={handleSyncGmail}
              onImportContacts={handleImportContacts}
              syncing={syncingGmail}
              importing={importingContacts}
            />
          )}

          {!emailMetrics && (
            <div className="card" style={{ padding: "24px 20px", textAlign: "center" }}>
              <Mail size={28} style={{ color: "var(--balboa-text-muted)", marginBottom: 8 }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 4 }}>
                No leads yet
              </div>
              <div style={{ fontSize: 12, color: "var(--balboa-text-muted)", marginBottom: 16 }}>
                Connect Gmail in Settings to auto-sync your email activity and import contacts as leads.
              </div>
              <button
                onClick={handleImportContacts}
                disabled={importingContacts}
                style={{
                  padding: "10px 20px",
                  fontSize: 13,
                  fontWeight: 700,
                  background: "var(--balboa-blue)",
                  color: "white",
                  border: "none",
                  borderRadius: 10,
                  cursor: importingContacts ? "default" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Download size={14} />
                {importingContacts ? "Importing..." : "Import contacts from Gmail"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════ ACTIONS TAB ══════════ */}
      {leads.length > 0 && activeTab === "actions" && (
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
                compact
              />
            </div>
          </WorkflowSection>

          {/* ── Section 4: Email Activity ── */}
          {emailMetrics && emailMetrics.totalThreads > 0 && (
            <EmailActivityCard
              metrics={emailMetrics}
              onSyncGmail={handleSyncGmail}
              onImportContacts={handleImportContacts}
              syncing={syncingGmail}
              importing={importingContacts}
            />
          )}
        </div>
      )}

      {/* ══════════ ALL LEADS TAB ══════════ */}
      {leads.length > 0 && activeTab === "followups" && (
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
      {leads.length > 0 && activeTab === "notifications" && (
        <NotificationCenter leads={leads} />
      )}
    </div>
  );
}
