"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  Users,
  Mail,
  Linkedin,
  MessageSquare,
  Phone,
  RefreshCw,
  TrendingUp,
  Clock,
  XCircle,
  Info,
} from "lucide-react";
import type { Lead, SupportedLanguage } from "@/lib/types";
import { CHANNEL_RATE_LIMITS } from "@/lib/compliance";

// ─── Types ────────────────────────────────────────────────────────────

interface ComplianceDashboardProps {
  leads: Lead[];
  language: SupportedLanguage;
}

type ComplianceTab = "overview" | "events" | "consent" | "bestpractices";

interface ComplianceEvent {
  id: string;
  event_type: string;
  channel: string;
  created_at: string;
  metadata: Record<string, string>;
}

interface DashboardData {
  rateLimits: {
    linkedinMessages: number;
    linkedinConnections: number;
    emailMessages: number;
    smsMessages: number;
  };
  recentEvents: ComplianceEvent[];
  consentSummary: {
    totalLeads: number;
    optedIn: number;
    optedOut: number;
    gdprConsent: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────

function timeAgo(isoDate: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getRatioColor(current: number, max: number): string {
  const ratio = current / max;
  if (ratio < 0.6) return "var(--balboa-green)";
  if (ratio < 0.85) return "var(--balboa-yellow)";
  return "var(--balboa-red)";
}

function getComplianceScore(data: DashboardData): number {
  const limits = CHANNEL_RATE_LIMITS;
  const ratios = [
    data.rateLimits.linkedinMessages / limits.linkedin.messagesPerDay,
    data.rateLimits.linkedinConnections / limits.linkedin.connectionsPerDay,
    data.rateLimits.emailMessages / limits.email.messagesPerDay,
    data.rateLimits.smsMessages / limits.sms.messagesPerDay,
  ];
  const avgUtilization = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
  // Score decreases as you approach limits; 100 = zero usage, 0 = all at max
  return Math.max(0, Math.round((1 - avgUtilization) * 100));
}

function generateMockEvents(leads: Lead[]): ComplianceEvent[] {
  const now = Date.now();
  const events: ComplianceEvent[] = [
    {
      id: "evt-1",
      event_type: "rate_limit_warning",
      channel: "linkedin",
      created_at: new Date(now - 15 * 60 * 1000).toISOString(),
      metadata: { detail: "Approaching daily connection limit (18/20)", severity: "warn" },
    },
    {
      id: "evt-2",
      event_type: "message_sent",
      channel: "email",
      created_at: new Date(now - 32 * 60 * 1000).toISOString(),
      metadata: { detail: "Outreach email sent", lead: leads[0]?.firstName || "Lead" },
    },
    {
      id: "evt-3",
      event_type: "consent_updated",
      channel: "email",
      created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      metadata: { detail: "GDPR consent recorded", lead: leads[1]?.firstName || "Lead" },
    },
    {
      id: "evt-4",
      event_type: "opt_out_received",
      channel: "email",
      created_at: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
      metadata: { detail: "Unsubscribe request processed", lead: leads[2]?.firstName || "Lead" },
    },
    {
      id: "evt-5",
      event_type: "rate_limit_block",
      channel: "sms",
      created_at: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
      metadata: { detail: "SMS daily limit reached (50/50). Message queued.", severity: "block" },
    },
    {
      id: "evt-6",
      event_type: "message_sent",
      channel: "linkedin",
      created_at: new Date(now - 8 * 60 * 60 * 1000).toISOString(),
      metadata: { detail: "Connection request sent", lead: leads[3]?.firstName || "Lead" },
    },
    {
      id: "evt-7",
      event_type: "compliance_check_passed",
      channel: "email",
      created_at: new Date(now - 12 * 60 * 60 * 1000).toISOString(),
      metadata: { detail: "CAN-SPAM check passed for batch of 15 emails" },
    },
    {
      id: "evt-8",
      event_type: "rate_limit_warning",
      channel: "email",
      created_at: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
      metadata: { detail: "Approaching hourly email limit (45/50)", severity: "warn" },
    },
  ];
  return events;
}

// ─── Sub-components ───────────────────────────────────────────────────

function RateLimitMeter({
  label,
  icon: Icon,
  current,
  max,
  unit,
}: {
  label: string;
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
  current: number;
  max: number;
  unit: string;
}) {
  const color = getRatioColor(current, max);
  const pct = Math.min((current / max) * 100, 100);

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon style={{ width: 14, height: 14, color: "var(--balboa-text-muted)" }} />
          <span style={{ fontSize: 12, color: "var(--balboa-text-secondary)", fontWeight: 500 }}>
            {label}
          </span>
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color }}>
          {current} / {max} {unit}
        </span>
      </div>
      <div className="rate-bar-track">
        <div
          className="rate-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
  color: string;
}) {
  return (
    <div
      className="card"
      style={{
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: `${color}14`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon style={{ width: 16, height: 16, color }} />
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)" }}>{value}</div>
        <div style={{ fontSize: 11, color: "var(--balboa-text-muted)" }}>{label}</div>
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="card"
      style={{ marginBottom: 8, overflow: "hidden" }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--balboa-navy)",
          textAlign: "left",
        }}
      >
        <Icon style={{ width: 15, height: 15, color: "var(--balboa-blue)" }} />
        <span style={{ flex: 1 }}>{title}</span>
        <span
          style={{
            fontSize: 11,
            color: "var(--balboa-text-muted)",
            transition: "transform 0.2s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          &#9660;
        </span>
      </button>
      {open && (
        <div style={{ padding: "0 14px 12px 14px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────

export default function ComplianceDashboard({
  leads,
  language,
}: ComplianceDashboardProps) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ComplianceTab>("overview");
  const [dashboardData, setDashboardData] = useState<DashboardData>({
    rateLimits: {
      linkedinMessages: 0,
      linkedinConnections: 0,
      emailMessages: 0,
      smsMessages: 0,
    },
    recentEvents: [],
    consentSummary: {
      totalLeads: 0,
      optedIn: 0,
      optedOut: 0,
      gdprConsent: 0,
    },
  });

  // ── Load mock data on mount ──────────────
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      const totalLeads = leads.length;
      const optedIn = Math.round(totalLeads * 0.72);
      const optedOut = Math.round(totalLeads * 0.08);
      const gdprConsent = Math.round(totalLeads * 0.65);

      setDashboardData({
        rateLimits: {
          linkedinMessages: 12,
          linkedinConnections: 8,
          emailMessages: 45,
          smsMessages: 3,
        },
        recentEvents: generateMockEvents(leads),
        consentSummary: {
          totalLeads,
          optedIn,
          optedOut,
          gdprConsent,
        },
      });
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [leads]);

  // ── Derived values ──────────────
  const complianceScore = useMemo(
    () => getComplianceScore(dashboardData),
    [dashboardData]
  );

  const totalMessagesSentToday = useMemo(
    () =>
      dashboardData.rateLimits.linkedinMessages +
      dashboardData.rateLimits.emailMessages +
      dashboardData.rateLimits.smsMessages,
    [dashboardData]
  );

  // ── Consent data per lead ──────────────
  const consentRows = useMemo(() => {
    const channels: Array<{ channel: string; icon: React.ComponentType<{ style?: React.CSSProperties }> }> = [
      { channel: "LinkedIn", icon: Linkedin },
      { channel: "Email", icon: Mail },
      { channel: "SMS", icon: MessageSquare },
    ];

    return leads.slice(0, 20).flatMap((lead, idx) => {
      // Simulate consent data based on lead index for deterministic mock data
      const statuses = ["opt_in", "opt_in", "opt_in", "not_set", "opt_out"] as const;
      return channels.map((ch, chIdx) => {
        const statusIdx = (idx + chIdx) % statuses.length;
        const daysAgo = ((idx * 3 + chIdx * 7) % 60) + 1;
        return {
          key: `${lead.id}-${ch.channel}`,
          leadName: `${lead.firstName} ${lead.lastName}`,
          channel: ch.channel,
          channelIcon: ch.icon,
          status: statuses[statusIdx],
          date: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
        };
      });
    });
  }, [leads]);

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 600);
  };

  // ── Tabs config ──────────────
  const tabs: Array<{ key: ComplianceTab; label: string; icon: React.ComponentType<{ style?: React.CSSProperties }> }> = [
    { key: "overview", label: "Overview", icon: Shield },
    { key: "events", label: "Events", icon: Clock },
    { key: "consent", label: "Consent", icon: Users },
    { key: "bestpractices", label: "Best Practices", icon: Info },
  ];

  // ── Event styling helpers ──────────────
  const getEventTypeBadge = (eventType: string, metadata: Record<string, string>) => {
    const severity = metadata?.severity;
    if (severity === "block" || eventType === "rate_limit_block" || eventType === "opt_out_received") {
      return {
        bg: "rgba(224, 49, 49, 0.1)",
        color: "var(--balboa-red)",
        borderColor: "var(--balboa-red)",
      };
    }
    if (severity === "warn" || eventType === "rate_limit_warning") {
      return {
        bg: "rgba(245, 159, 0, 0.1)",
        color: "#b45309",
        borderColor: "var(--balboa-yellow)",
      };
    }
    return {
      bg: "rgba(59, 91, 219, 0.06)",
      color: "var(--balboa-text-muted)",
      borderColor: "var(--balboa-border-light)",
    };
  };

  const getEventTypeLabel = (eventType: string): string => {
    const labels: Record<string, string> = {
      rate_limit_warning: "Rate Limit Warning",
      rate_limit_block: "Rate Limit Block",
      message_sent: "Message Sent",
      consent_updated: "Consent Updated",
      opt_out_received: "Opt-Out Received",
      compliance_check_passed: "Check Passed",
    };
    return labels[eventType] || eventType;
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "linkedin": return Linkedin;
      case "email": return Mail;
      case "sms": return MessageSquare;
      case "call": return Phone;
      default: return Mail;
    }
  };

  // ── Consent status badge ──────────────
  const getConsentBadge = (status: string) => {
    switch (status) {
      case "opt_in":
        return { label: "Opted In", bg: "rgba(43, 138, 62, 0.1)", color: "var(--balboa-green)" };
      case "opt_out":
        return { label: "Opted Out", bg: "rgba(224, 49, 49, 0.1)", color: "var(--balboa-red)" };
      default:
        return { label: "Not Set", bg: "rgba(134, 142, 150, 0.1)", color: "var(--balboa-text-muted)" };
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <Shield style={{ width: 20, height: 20, color: "var(--balboa-navy)" }} />
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--balboa-navy)", margin: 0 }}>
              Compliance &amp; Safety
            </h2>
          </div>
          <p style={{ fontSize: 13, color: "var(--balboa-text-muted)", margin: 0 }}>
            Platform regulation compliance
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 500,
            color: "var(--balboa-text-muted)",
            background: "white",
            border: "1px solid var(--balboa-border)",
            borderRadius: "var(--balboa-radius)",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          <RefreshCw
            style={{
              width: 13,
              height: 13,
              animation: loading ? "spin 1s linear infinite" : "none",
            }}
          />
          Refresh
        </button>
      </div>

      {/* Tab bar */}
      <div className="tab-nav" style={{ marginBottom: 16, paddingLeft: 0, paddingRight: 0 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`tab-btn ${activeTab === t.key ? "active" : ""}`}
          >
            <t.icon style={{ width: 14, height: 14 }} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--balboa-text-muted)", fontSize: 13 }}>
          Loading compliance data...
        </div>
      )}

      {/* ═══════════════ OVERVIEW TAB ═══════════════ */}
      {!loading && activeTab === "overview" && (
        <div>
          {/* Rate Limit Meters */}
          <div
            className="card"
            style={{ padding: "14px 16px", marginBottom: 16 }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--balboa-navy)",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <TrendingUp style={{ width: 14, height: 14 }} />
              Rate Limits — Today
            </div>

            <RateLimitMeter
              label="LinkedIn Connections"
              icon={Linkedin}
              current={dashboardData.rateLimits.linkedinConnections}
              max={CHANNEL_RATE_LIMITS.linkedin.connectionsPerDay}
              unit="today"
            />
            <RateLimitMeter
              label="LinkedIn Messages"
              icon={Linkedin}
              current={dashboardData.rateLimits.linkedinMessages}
              max={CHANNEL_RATE_LIMITS.linkedin.messagesPerDay}
              unit="today"
            />
            <RateLimitMeter
              label="Email Messages"
              icon={Mail}
              current={dashboardData.rateLimits.emailMessages}
              max={CHANNEL_RATE_LIMITS.email.messagesPerDay}
              unit="today"
            />
            <RateLimitMeter
              label="SMS Messages"
              icon={MessageSquare}
              current={dashboardData.rateLimits.smsMessages}
              max={CHANNEL_RATE_LIMITS.sms.messagesPerDay}
              unit="today"
            />
          </div>

          {/* Summary Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
            <SummaryCard
              label="Messages Sent Today"
              value={totalMessagesSentToday}
              icon={Mail}
              color="var(--balboa-blue)"
            />
            <SummaryCard
              label="Compliance Score"
              value={`${complianceScore}%`}
              icon={complianceScore >= 70 ? CheckCircle : AlertTriangle}
              color={complianceScore >= 70 ? "var(--balboa-green)" : "var(--balboa-yellow)"}
            />
            <SummaryCard
              label="Active Consents"
              value={dashboardData.consentSummary.optedIn}
              icon={Users}
              color="var(--balboa-green)"
            />
          </div>

          {/* Quick status row */}
          <div
            className="card"
            style={{
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              gap: 16,
              fontSize: 12,
              color: "var(--balboa-text-secondary)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <CheckCircle style={{ width: 13, height: 13, color: "var(--balboa-green)" }} />
              <span>{dashboardData.consentSummary.gdprConsent} GDPR consents</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <XCircle style={{ width: 13, height: 13, color: "var(--balboa-red)" }} />
              <span>{dashboardData.consentSummary.optedOut} opt-outs</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Users style={{ width: 13, height: 13, color: "var(--balboa-blue)" }} />
              <span>{dashboardData.consentSummary.totalLeads} total leads</span>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ EVENTS TAB ═══════════════ */}
      {!loading && activeTab === "events" && (
        <div>
          <div
            className="card"
            style={{ overflow: "hidden" }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--balboa-border-light)",
                    background: "var(--balboa-bg-alt)",
                  }}
                >
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--balboa-text-muted)", fontSize: 11 }}>
                    Time
                  </th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--balboa-text-muted)", fontSize: 11 }}>
                    Channel
                  </th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--balboa-text-muted)", fontSize: 11 }}>
                    Event Type
                  </th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--balboa-text-muted)", fontSize: 11 }}>
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {dashboardData.recentEvents.map((event) => {
                  const badge = getEventTypeBadge(event.event_type, event.metadata);
                  const ChannelIcon = getChannelIcon(event.channel);

                  return (
                    <tr
                      key={event.id}
                      style={{
                        borderBottom: "1px solid var(--balboa-border-light)",
                        borderLeft: `3px solid ${badge.borderColor}`,
                      }}
                    >
                      <td
                        style={{
                          padding: "8px 12px",
                          color: "var(--balboa-text-muted)",
                          whiteSpace: "nowrap",
                          fontSize: 11,
                        }}
                      >
                        {timeAgo(event.created_at)}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <ChannelIcon
                            style={{ width: 13, height: 13, color: "var(--balboa-text-muted)" }}
                          />
                          <span style={{ fontSize: 12, color: "var(--balboa-text-secondary)", textTransform: "capitalize" }}>
                            {event.channel}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 500,
                            background: badge.bg,
                            color: badge.color,
                          }}
                        >
                          {getEventTypeLabel(event.event_type)}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "8px 12px",
                          fontSize: 12,
                          color: "var(--balboa-text-secondary)",
                          maxWidth: 260,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={event.metadata.detail}
                      >
                        {event.metadata.detail}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {dashboardData.recentEvents.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "32px 0",
                  color: "var(--balboa-text-muted)",
                  fontSize: 13,
                }}
              >
                No compliance events recorded yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ CONSENT TAB ═══════════════ */}
      {!loading && activeTab === "consent" && (
        <div>
          {/* Summary bar */}
          <div
            className="card"
            style={{
              padding: "10px 14px",
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              gap: 16,
              fontSize: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--balboa-green)" }}>
              <CheckCircle style={{ width: 13, height: 13 }} />
              <span style={{ fontWeight: 600 }}>{dashboardData.consentSummary.optedIn}</span>
              <span style={{ color: "var(--balboa-text-muted)" }}>opted in</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--balboa-red)" }}>
              <XCircle style={{ width: 13, height: 13 }} />
              <span style={{ fontWeight: 600 }}>{dashboardData.consentSummary.optedOut}</span>
              <span style={{ color: "var(--balboa-text-muted)" }}>opted out</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--balboa-blue)" }}>
              <Shield style={{ width: 13, height: 13 }} />
              <span style={{ fontWeight: 600 }}>{dashboardData.consentSummary.gdprConsent}</span>
              <span style={{ color: "var(--balboa-text-muted)" }}>GDPR consent</span>
            </div>
          </div>

          {/* Consent table */}
          <div className="card" style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--balboa-border-light)",
                    background: "var(--balboa-bg-alt)",
                  }}
                >
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--balboa-text-muted)", fontSize: 11 }}>
                    Lead Name
                  </th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--balboa-text-muted)", fontSize: 11 }}>
                    Channel
                  </th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--balboa-text-muted)", fontSize: 11 }}>
                    Consent Status
                  </th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--balboa-text-muted)", fontSize: 11 }}>
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {consentRows.map((row) => {
                  const badge = getConsentBadge(row.status);
                  const ChannelIcon = row.channelIcon;

                  return (
                    <tr
                      key={row.key}
                      style={{ borderBottom: "1px solid var(--balboa-border-light)" }}
                    >
                      <td
                        style={{
                          padding: "7px 12px",
                          fontWeight: 500,
                          color: "var(--balboa-navy)",
                          fontSize: 12,
                        }}
                      >
                        {row.leadName}
                      </td>
                      <td style={{ padding: "7px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <ChannelIcon
                            style={{ width: 13, height: 13, color: "var(--balboa-text-muted)" }}
                          />
                          <span style={{ fontSize: 12, color: "var(--balboa-text-secondary)" }}>
                            {row.channel}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "7px 12px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 500,
                            background: badge.bg,
                            color: badge.color,
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "7px 12px",
                          fontSize: 11,
                          color: "var(--balboa-text-muted)",
                        }}
                      >
                        {new Date(row.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {consentRows.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "32px 0",
                  color: "var(--balboa-text-muted)",
                  fontSize: 13,
                }}
              >
                No leads available to show consent data.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ BEST PRACTICES TAB ═══════════════ */}
      {!loading && activeTab === "bestpractices" && (
        <div>
          <CollapsibleSection title="LinkedIn Terms of Service" icon={Linkedin} defaultOpen>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                listStyleType: "disc",
                fontSize: 12,
                lineHeight: 1.7,
                color: "var(--balboa-text-secondary)",
              }}
            >
              <li>
                <strong>Connection limits:</strong> Maximum {CHANNEL_RATE_LIMITS.linkedin.connectionsPerDay} connection
                requests per day, {CHANNEL_RATE_LIMITS.linkedin.connectionsPerWeek} per week. Exceeding
                these may trigger account restrictions.
              </li>
              <li>
                <strong>Message limits:</strong> Maximum {CHANNEL_RATE_LIMITS.linkedin.messagesPerDay} messages
                per day. Spread messages throughout the day for natural patterns.
              </li>
              <li>
                <strong>Personalize every message:</strong> Avoid sending identical templates. Reference the
                recipient&apos;s role, company, or recent activity.
              </li>
              <li>
                <strong>Respect opt-outs immediately:</strong> When a connection asks you to stop messaging,
                remove them from all sequences right away.
              </li>
              <li>
                <strong>No automation abuse:</strong> LinkedIn prohibits automated tools that mimic human behavior.
                Always use platform-compliant workflows.
              </li>
              <li>
                <strong>Profile views:</strong> Maximum {CHANNEL_RATE_LIMITS.linkedin.profileViewsPerDay} profile
                views per day. Excessive viewing can flag your account.
              </li>
            </ul>
          </CollapsibleSection>

          <CollapsibleSection title="CAN-SPAM Requirements" icon={Mail}>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                listStyleType: "disc",
                fontSize: 12,
                lineHeight: 1.7,
                color: "var(--balboa-text-secondary)",
              }}
            >
              <li>
                <strong>Unsubscribe mechanism:</strong> Every commercial email must include a clear, conspicuous
                way for recipients to opt out. Process requests within 10 business days.
              </li>
              <li>
                <strong>Physical address:</strong> Include a valid physical postal address (street address,
                P.O. Box, or registered commercial mailbox) in every email.
              </li>
              <li>
                <strong>Honest subject lines:</strong> Subject lines must accurately reflect the content of
                the email. Deceptive subjects violate CAN-SPAM.
              </li>
              <li>
                <strong>Sender identification:</strong> The &quot;From,&quot; &quot;To,&quot; and routing information must be
                accurate and identify the person or business initiating the message.
              </li>
              <li>
                <strong>Label advertisements:</strong> If the email is an ad, it must be clearly identified as such.
              </li>
              <li>
                <strong>Monitor third parties:</strong> You are responsible for CAN-SPAM compliance even if a
                third party handles your email marketing.
              </li>
            </ul>
          </CollapsibleSection>

          <CollapsibleSection title="GDPR Essentials" icon={Shield}>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                listStyleType: "disc",
                fontSize: 12,
                lineHeight: 1.7,
                color: "var(--balboa-text-secondary)",
              }}
            >
              <li>
                <strong>Consent required:</strong> For EU/EEA contacts, obtain explicit, informed consent before
                processing personal data or sending commercial communications.
              </li>
              <li>
                <strong>Right to erasure (Article 17):</strong> Contacts can request complete deletion of their
                personal data. You must comply without undue delay.
              </li>
              <li>
                <strong>Data retention limits:</strong> Only retain personal data for as long as necessary for
                the purpose it was collected. Define and enforce retention periods.
              </li>
              <li>
                <strong>Lawful basis:</strong> Document a lawful basis (consent, legitimate interest, contract)
                for each data processing activity.
              </li>
              <li>
                <strong>Data portability:</strong> Contacts have the right to receive their personal data in a
                structured, machine-readable format.
              </li>
              <li>
                <strong>Breach notification:</strong> Report data breaches to the supervisory authority within
                72 hours of becoming aware. Notify affected individuals if high risk.
              </li>
            </ul>
          </CollapsibleSection>

          <CollapsibleSection title="SMS / TCPA Compliance" icon={MessageSquare}>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                listStyleType: "disc",
                fontSize: 12,
                lineHeight: 1.7,
                color: "var(--balboa-text-secondary)",
              }}
            >
              <li>
                <strong>Prior express written consent:</strong> TCPA requires written consent before sending
                commercial text messages. Verbal consent is not sufficient.
              </li>
              <li>
                <strong>Opt-out compliance:</strong> Honor STOP/UNSUBSCRIBE requests immediately. Reply with
                confirmation of removal.
              </li>
              <li>
                <strong>Rate limits:</strong> Maximum {CHANNEL_RATE_LIMITS.sms.messagesPerDay} SMS per day,{" "}
                {CHANNEL_RATE_LIMITS.sms.messagesPerHour} per hour. Exceeding these risks carrier filtering.
              </li>
              <li>
                <strong>Time restrictions:</strong> Do not send SMS before 8 AM or after 9 PM in the recipient&apos;s
                local time zone.
              </li>
              <li>
                <strong>Identify yourself:</strong> Every SMS must clearly identify the sender (business name)
                so recipients know who is contacting them.
              </li>
            </ul>
          </CollapsibleSection>
        </div>
      )}
    </div>
  );
}
