"use client";

import { useState, useMemo } from "react";
import type { Lead, LiveSignal, SignalType, SignalUrgency } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────

const URGENCY_COLORS: Record<SignalUrgency, string> = {
  immediate: "#e03131",
  high: "#f59f00",
  medium: "#3b5bdb",
  low: "#868e96",
};

const SIGNAL_TYPE_META: Record<
  SignalType,
  { icon: string; label: string; defaultUrgency: SignalUrgency; defaultChannel: "email" | "linkedin" }
> = {
  email_open: { icon: "\u2709\uFE0F", label: "Email Open", defaultUrgency: "immediate", defaultChannel: "email" },
  linkedin_view: { icon: "\uD83D\uDC41", label: "LinkedIn View", defaultUrgency: "high", defaultChannel: "linkedin" },
  linkedin_engagement: { icon: "\uD83D\uDC4D", label: "LinkedIn Engagement", defaultUrgency: "high", defaultChannel: "linkedin" },
  hubspot_stage_change: { icon: "\uD83D\uDD04", label: "Stage Change", defaultUrgency: "immediate", defaultChannel: "email" },
  marketing_signal: { icon: "\uD83D\uDCE3", label: "Marketing Signal", defaultUrgency: "medium", defaultChannel: "email" },
  job_change: { icon: "\uD83D\uDCBC", label: "Job Change", defaultUrgency: "high", defaultChannel: "linkedin" },
  company_growth: { icon: "\uD83D\uDCC8", label: "Company Growth", defaultUrgency: "medium", defaultChannel: "email" },
  funding_round: { icon: "\uD83D\uDCB0", label: "Funding Round", defaultUrgency: "high", defaultChannel: "email" },
  competitor_mention: { icon: "\uD83C\uDFAF", label: "Competitor Mention", defaultUrgency: "medium", defaultChannel: "email" },
  website_visit: { icon: "\uD83C\uDF10", label: "Website Visit", defaultUrgency: "immediate", defaultChannel: "email" },
};

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

function generateMockSignals(leads: Lead[]): LiveSignal[] {
  if (leads.length === 0) return [];

  const signalTemplates: Array<{
    signalType: SignalType;
    descFn: (l: Lead) => string;
    actionFn: (l: Lead) => string;
  }> = [
    {
      signalType: "email_open",
      descFn: (l) => `${l.firstName} opened your last email 3 times in the past hour`,
      actionFn: () => "Send a follow-up while they are engaged",
    },
    {
      signalType: "linkedin_view",
      descFn: (l) => `${l.firstName} viewed your LinkedIn profile`,
      actionFn: () => "Send a personalized connection note",
    },
    {
      signalType: "linkedin_engagement",
      descFn: (l) => `${l.firstName} liked your recent post about supply chain AI`,
      actionFn: () => "Comment back and start a conversation",
    },
    {
      signalType: "hubspot_stage_change",
      descFn: (l) => `${l.firstName}'s deal moved to Proposal stage`,
      actionFn: () => "Prepare a tailored proposal deck and schedule review",
    },
    {
      signalType: "marketing_signal",
      descFn: (l) => `${l.firstName} downloaded the ROI Calculator whitepaper`,
      actionFn: () => "Send a case study related to their use case",
    },
    {
      signalType: "job_change",
      descFn: (l) => `${l.firstName} was promoted to VP at ${l.company}`,
      actionFn: () => "Congratulate them and reintroduce Balboa's value prop",
    },
    {
      signalType: "company_growth",
      descFn: (l) => `${l.company} expanded operations to 3 new markets`,
      actionFn: () => "Pitch multi-region supply chain visibility",
    },
    {
      signalType: "funding_round",
      descFn: (l) => `${l.company} raised a $45M Series C round`,
      actionFn: () => "Reach out about scaling logistics with new funding",
    },
    {
      signalType: "competitor_mention",
      descFn: (l) => `${l.firstName} mentioned evaluating project44 on LinkedIn`,
      actionFn: () => "Send competitive battle card and request a comparison demo",
    },
    {
      signalType: "website_visit",
      descFn: (l) => `Someone from ${l.company} visited the pricing page 5 times today`,
      actionFn: () => "Offer a personalized pricing walkthrough",
    },
    {
      signalType: "email_open",
      descFn: (l) => `${l.firstName} forwarded your proposal email internally`,
      actionFn: () => "Ask who else should be looped in for a group demo",
    },
    {
      signalType: "linkedin_engagement",
      descFn: (l) => `${l.firstName} commented on a competitor post about visibility gaps`,
      actionFn: () => "Engage in the thread and share Balboa's perspective",
    },
  ];

  const now = Date.now();
  const signals: LiveSignal[] = [];
  const usedLeadIds = new Set<string>();

  for (let i = 0; i < Math.min(signalTemplates.length, Math.max(8, leads.length)); i++) {
    const template = signalTemplates[i % signalTemplates.length];
    const lead = leads[i % leads.length];
    const meta = SIGNAL_TYPE_META[template.signalType];

    if (usedLeadIds.has(lead.id) && leads.length > signalTemplates.length) continue;
    usedLeadIds.add(lead.id);

    const minutesAgo = [3, 12, 28, 47, 90, 180, 360, 720, 1440, 2880, 4320, 5760][i] || 60;

    signals.push({
      id: `sig-${i + 1}`,
      leadId: lead.id,
      leadName: `${lead.firstName} ${lead.lastName}`,
      company: lead.company,
      signalType: template.signalType,
      description: template.descFn(lead),
      urgency: meta.defaultUrgency,
      channel: meta.defaultChannel === "email" ? "email" : "linkedin",
      recommendedAction: template.actionFn(lead),
      recommendedChannel: meta.defaultChannel,
      timestamp: new Date(now - minutesAgo * 60 * 1000).toISOString(),
    });
  }

  return signals;
}

// ─── Component ────────────────────────────────────────────────

interface SignalEngineProps {
  leads: Lead[];
  onNavigateToLead: (leadId: string) => void;
  onGenerateMessage: (lead: Lead, type: string, channel?: "email" | "linkedin") => void;
}

export default function SignalEngine({
  leads,
  onNavigateToLead,
  onGenerateMessage,
}: SignalEngineProps) {
  const [signals, setSignals] = useState<LiveSignal[]>(() => generateMockSignals(leads));
  const [filterType, setFilterType] = useState<SignalType | "all">("all");
  const [filterUrgency, setFilterUrgency] = useState<SignalUrgency | "all">("all");
  const [filterChannel, setFilterChannel] = useState<"email" | "linkedin" | "call" | "all">("all");
  const [snoozeMenuId, setSnoozeMenuId] = useState<string | null>(null);

  // ── Stats ─────────────────────
  const stats = useMemo(() => {
    const active = signals.filter((s) => !s.snoozedUntil && !s.actedOn);
    const actedToday = signals.filter((s) => {
      if (!s.actedOnAt) return false;
      const d = new Date(s.actedOnAt);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    });
    const totalActed = signals.filter((s) => s.actedOn).length;
    return {
      totalActive: active.length,
      actedOnToday: actedToday.length,
      responseRate: signals.length > 0 ? Math.round((totalActed / signals.length) * 100) : 0,
    };
  }, [signals]);

  // ── Filtered + grouped ─────────────────────
  const filteredSignals = useMemo(() => {
    return signals.filter((s) => {
      if (s.snoozedUntil && new Date(s.snoozedUntil) > new Date()) return false;
      if (filterType !== "all" && s.signalType !== filterType) return false;
      if (filterUrgency !== "all" && s.urgency !== filterUrgency) return false;
      if (filterChannel !== "all" && s.channel !== filterChannel) return false;
      return true;
    });
  }, [signals, filterType, filterUrgency, filterChannel]);

  const grouped = useMemo(() => {
    const groups: Record<SignalUrgency, LiveSignal[]> = {
      immediate: [],
      high: [],
      medium: [],
      low: [],
    };
    filteredSignals.forEach((s) => groups[s.urgency].push(s));
    return groups;
  }, [filteredSignals]);

  // ── Actions ─────────────────────
  const handleActNow = (signal: LiveSignal) => {
    const lead = leads.find((l) => l.id === signal.leadId);
    if (lead) {
      onGenerateMessage(lead, signal.signalType, signal.recommendedChannel);
    }
    setSignals((prev) =>
      prev.map((s) =>
        s.id === signal.id ? { ...s, actedOn: true, actedOnAt: new Date().toISOString() } : s
      )
    );
    onNavigateToLead(signal.leadId);
  };

  const handleSnooze = (signalId: string, hours: number) => {
    const snoozedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    setSignals((prev) =>
      prev.map((s) => (s.id === signalId ? { ...s, snoozedUntil } : s))
    );
    setSnoozeMenuId(null);
  };

  // ── Render ─────────────────────
  const urgencyOrder: SignalUrgency[] = ["immediate", "high", "medium", "low"];
  const urgencyLabels: Record<SignalUrgency, string> = {
    immediate: "Immediate Action",
    high: "High Priority",
    medium: "Medium Priority",
    low: "Low Priority",
  };

  const allSignalTypes: SignalType[] = [
    "email_open", "linkedin_view", "linkedin_engagement", "hubspot_stage_change",
    "marketing_signal", "job_change", "company_growth", "funding_round",
    "competitor_mention", "website_visit",
  ];

  return (
    <div style={{ padding: "24px 32px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1e2a5e", marginBottom: 4 }}>
          Signal Engine
        </h2>
        <p style={{ fontSize: 13, color: "#868e96" }}>
          Real-time buying signals across all channels. Act on the right signals at the right time.
        </p>
      </div>

      {/* Stats Bar */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {[
          { label: "Active Signals", value: stats.totalActive, color: "#3b5bdb" },
          { label: "Acted On Today", value: stats.actedOnToday, color: "#2b8a3e" },
          { label: "Response Rate", value: `${stats.responseRate}%`, color: "#f59f00" },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              flex: 1,
              background: "white",
              borderRadius: 12,
              padding: "16px 20px",
              border: "1px solid #f1f3f5",
            }}
          >
            <div style={{ fontSize: 11, color: "#868e96", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 20,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: "#1e2a5e" }}>Filters:</span>

        {/* Signal Type */}
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as SignalType | "all")}
          style={{
            fontSize: 12,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #f1f3f5",
            background: "white",
            color: "#1e2a5e",
            cursor: "pointer",
          }}
        >
          <option value="all">All Signal Types</option>
          {allSignalTypes.map((t) => (
            <option key={t} value={t}>
              {SIGNAL_TYPE_META[t].icon} {SIGNAL_TYPE_META[t].label}
            </option>
          ))}
        </select>

        {/* Urgency */}
        <select
          value={filterUrgency}
          onChange={(e) => setFilterUrgency(e.target.value as SignalUrgency | "all")}
          style={{
            fontSize: 12,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #f1f3f5",
            background: "white",
            color: "#1e2a5e",
            cursor: "pointer",
          }}
        >
          <option value="all">All Urgencies</option>
          {urgencyOrder.map((u) => (
            <option key={u} value={u}>{urgencyLabels[u]}</option>
          ))}
        </select>

        {/* Channel */}
        <select
          value={filterChannel}
          onChange={(e) => setFilterChannel(e.target.value as "email" | "linkedin" | "call" | "all")}
          style={{
            fontSize: 12,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #f1f3f5",
            background: "white",
            color: "#1e2a5e",
            cursor: "pointer",
          }}
        >
          <option value="all">All Channels</option>
          <option value="email">Email</option>
          <option value="linkedin">LinkedIn</option>
          <option value="call">Call</option>
        </select>
      </div>

      {/* Signals grouped by urgency */}
      {urgencyOrder.map((urgency) => {
        const group = grouped[urgency];
        if (group.length === 0) return null;
        const color = URGENCY_COLORS[urgency];

        return (
          <div key={urgency} style={{ marginBottom: 28 }}>
            {/* Group header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: color,
                  display: "inline-block",
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1e2a5e", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {urgencyLabels[urgency]}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "white",
                  background: color,
                  borderRadius: 9999,
                  padding: "2px 8px",
                }}
              >
                {group.length}
              </span>
            </div>

            {/* Signal cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {group.map((signal) => {
                const meta = SIGNAL_TYPE_META[signal.signalType];
                const isActed = signal.actedOn;

                return (
                  <div
                    key={signal.id}
                    style={{
                      background: isActed ? "#f8f9fa" : "white",
                      borderRadius: 12,
                      padding: 16,
                      border: `1px solid ${isActed ? "#f1f3f5" : color}20`,
                      borderLeft: `4px solid ${color}`,
                      opacity: isActed ? 0.65 : 1,
                      transition: "all 0.2s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      {/* Icon */}
                      <span
                        style={{
                          fontSize: 20,
                          width: 36,
                          height: 36,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 10,
                          background: `${color}12`,
                          flexShrink: 0,
                        }}
                      >
                        {meta.icon}
                      </span>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              padding: "2px 8px",
                              borderRadius: 6,
                              background: `${color}15`,
                              color: color,
                              textTransform: "uppercase",
                              letterSpacing: "0.03em",
                            }}
                          >
                            {meta.label}
                          </span>
                          <span style={{ fontSize: 11, color: "#868e96" }}>
                            {timeAgo(signal.timestamp)}
                          </span>
                          {signal.channel && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 500,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: signal.channel === "linkedin" ? "#dbeafe" : signal.channel === "email" ? "#fef3c7" : "#f1f3f5",
                                color: signal.channel === "linkedin" ? "#2563eb" : signal.channel === "email" ? "#d97706" : "#868e96",
                              }}
                            >
                              {signal.channel}
                            </span>
                          )}
                          {isActed && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: "#2b8a3e" }}>
                              Acted
                            </span>
                          )}
                        </div>

                        <p style={{ fontSize: 13, color: "#1e2a5e", fontWeight: 500, marginBottom: 2 }}>
                          {signal.description}
                        </p>

                        <p style={{ fontSize: 12, color: "#868e96", marginBottom: 8 }}>
                          {signal.leadName} at {signal.company}
                        </p>

                        {/* Recommended action */}
                        <div
                          style={{
                            background: "#f8f9fa",
                            borderRadius: 8,
                            padding: "8px 12px",
                            marginBottom: 10,
                            border: "1px solid #f1f3f5",
                          }}
                        >
                          <span style={{ fontSize: 11, color: "#f59f00", fontWeight: 600 }}>
                            Recommended:
                          </span>{" "}
                          <span style={{ fontSize: 12, color: "#495057" }}>
                            {signal.recommendedAction}
                          </span>
                        </div>

                        {/* Action buttons */}
                        {!isActed && (
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <button
                              onClick={() => handleActNow(signal)}
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                padding: "6px 16px",
                                borderRadius: 8,
                                border: "none",
                                background: "linear-gradient(135deg, #1e2a5e, #3b5bdb)",
                                color: "white",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                transition: "all 0.15s ease",
                              }}
                            >
                              Act Now
                            </button>

                            {/* Snooze */}
                            <div style={{ position: "relative" }}>
                              <button
                                onClick={() =>
                                  setSnoozeMenuId(snoozeMenuId === signal.id ? null : signal.id)
                                }
                                style={{
                                  fontSize: 12,
                                  fontWeight: 500,
                                  padding: "6px 12px",
                                  borderRadius: 8,
                                  border: "1px solid #f1f3f5",
                                  background: "white",
                                  color: "#868e96",
                                  cursor: "pointer",
                                  transition: "all 0.15s ease",
                                }}
                              >
                                Snooze
                              </button>

                              {snoozeMenuId === signal.id && (
                                <div
                                  style={{
                                    position: "absolute",
                                    top: "100%",
                                    left: 0,
                                    marginTop: 4,
                                    background: "white",
                                    borderRadius: 10,
                                    border: "1px solid #f1f3f5",
                                    boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                                    zIndex: 50,
                                    overflow: "hidden",
                                    minWidth: 120,
                                  }}
                                >
                                  {[
                                    { label: "1 hour", hours: 1 },
                                    { label: "24 hours", hours: 24 },
                                    { label: "1 week", hours: 168 },
                                  ].map((opt) => (
                                    <button
                                      key={opt.hours}
                                      onClick={() => handleSnooze(signal.id, opt.hours)}
                                      style={{
                                        display: "block",
                                        width: "100%",
                                        padding: "8px 14px",
                                        fontSize: 12,
                                        color: "#1e2a5e",
                                        background: "transparent",
                                        border: "none",
                                        cursor: "pointer",
                                        textAlign: "left",
                                        borderBottom: "1px solid #f1f3f5",
                                      }}
                                      onMouseEnter={(e) => {
                                        (e.target as HTMLButtonElement).style.background = "#f8f9fa";
                                      }}
                                      onMouseLeave={(e) => {
                                        (e.target as HTMLButtonElement).style.background = "transparent";
                                      }}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Navigate to lead */}
                            <button
                              onClick={() => onNavigateToLead(signal.leadId)}
                              style={{
                                fontSize: 12,
                                fontWeight: 500,
                                padding: "6px 12px",
                                borderRadius: 8,
                                border: "1px solid #f1f3f5",
                                background: "white",
                                color: "#3b5bdb",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                            >
                              View Lead
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Empty state */}
      {filteredSignals.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: 48,
            background: "white",
            borderRadius: 12,
            border: "1px solid #f1f3f5",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>
            {"\uD83D\uDD14"}
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1e2a5e", marginBottom: 8 }}>
            No signals match your filters
          </h3>
          <p style={{ fontSize: 13, color: "#868e96" }}>
            Try broadening your filter criteria to see more signals.
          </p>
        </div>
      )}
    </div>
  );
}
