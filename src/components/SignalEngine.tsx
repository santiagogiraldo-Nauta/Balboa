"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { Lead, LiveSignal, SignalType, SignalUrgency } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────

const URGENCY_COLORS: Record<SignalUrgency, string> = {
  immediate: "#e03131",
  high: "#f59f00",
  medium: "#3b5bdb",
  low: "#868e96",
};

// Extended meta map covering touchpoint event_types, computed signal types, and legacy types.
const SIGNAL_META: Record<string, { icon: string; label: string }> = {
  // ── Touchpoint event_type values (real DB data) ──
  replied: { icon: "\u2709\uFE0F", label: "Reply Received" },
  call_completed: { icon: "\uD83D\uDCDE", label: "Call Completed" },
  connection_accepted: { icon: "\uD83D\uDD17", label: "Connection Accepted" },
  meeting_booked: { icon: "\uD83D\uDCC5", label: "Meeting Booked" },
  email_sent: { icon: "\uD83D\uDCE4", label: "Email Sent" },
  email_opened: { icon: "\uD83D\uDC41", label: "Email Opened" },
  email_clicked: { icon: "\uD83D\uDD17", label: "Link Clicked" },
  email_bounced: { icon: "\u26A0\uFE0F", label: "Email Bounced" },
  linkedin_message: { icon: "\uD83D\uDCAC", label: "LinkedIn Message" },
  linkedin_invite_sent: { icon: "\uD83D\uDCE8", label: "Invite Sent" },
  note_added: { icon: "\uD83D\uDCDD", label: "Note Added" },
  stage_changed: { icon: "\uD83D\uDD04", label: "Stage Changed" },
  // ── Computed signal types from /api/signals/generate ──
  email_reply_needed: { icon: "\u2709\uFE0F", label: "Reply Needed" },
  follow_up_needed: { icon: "\uD83D\uDD04", label: "Follow Up" },
  active_negotiation: { icon: "\uD83D\uDCE3", label: "Active Thread" },
  new_lead_no_outreach: { icon: "\uD83C\uDF10", label: "New Lead" },
  scheduled_action: { icon: "\uD83D\uDCBC", label: "Scheduled Action" },
  // ── Legacy SignalType values (backward compat) ──
  email_open: { icon: "\u2709\uFE0F", label: "Email Open" },
  linkedin_view: { icon: "\uD83D\uDC41", label: "LinkedIn View" },
  linkedin_engagement: { icon: "\uD83D\uDC4D", label: "LinkedIn Engagement" },
  hubspot_stage_change: { icon: "\uD83D\uDD04", label: "Stage Change" },
  marketing_signal: { icon: "\uD83D\uDCE3", label: "Marketing Signal" },
  job_change: { icon: "\uD83D\uDCBC", label: "Job Change" },
  company_growth: { icon: "\uD83D\uDCC8", label: "Company Growth" },
  funding_round: { icon: "\uD83D\uDCB0", label: "Funding Round" },
  competitor_mention: { icon: "\uD83C\uDFAF", label: "Competitor Mention" },
  website_visit: { icon: "\uD83C\uDF10", label: "Website Visit" },
};

const DEFAULT_META = { icon: "\uD83D\uDCCC", label: "Signal" };

// Map from real event types to closest existing SignalType for TypeScript compatibility
const REAL_TYPE_TO_SIGNAL_TYPE: Record<string, SignalType> = {
  // Computed signal types
  email_reply_needed: "email_open",
  follow_up_needed: "hubspot_stage_change",
  active_negotiation: "marketing_signal",
  new_lead_no_outreach: "website_visit",
  scheduled_action: "job_change",
  // Touchpoint event_type values
  replied: "email_open",
  call_completed: "marketing_signal",
  connection_accepted: "linkedin_engagement",
  meeting_booked: "job_change",
  email_sent: "email_open",
  email_opened: "email_open",
  email_clicked: "website_visit",
  email_bounced: "email_open",
  linkedin_message: "linkedin_engagement",
  linkedin_invite_sent: "linkedin_view",
  note_added: "marketing_signal",
  stage_changed: "hubspot_stage_change",
};

function getSignalMeta(signalType: string): { icon: string; label: string } {
  return SIGNAL_META[signalType] || DEFAULT_META;
}

function timeAgo(isoDate: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 0) {
    // Future dates (e.g. scheduled actions)
    const absSeconds = Math.abs(seconds);
    const hours = Math.floor(absSeconds / 3600);
    if (hours < 24) return `in ${hours}h`;
    const days = Math.floor(hours / 24);
    return `in ${days}d`;
  }
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── API response type ────────────────────────────────────────

interface APISignal {
  id: string;
  type: string;
  title: string;
  description: string;
  leadId: string;
  leadName: string;
  company: string;
  urgency: SignalUrgency;
  channel: "email" | "linkedin" | "call";
  recommendedAction: string;
  timestamp: string;
  signalSource: string;
}

function apiSignalToLiveSignal(apiSignal: APISignal): LiveSignal {
  // Map the API type to an existing SignalType for the type system
  const signalType: SignalType =
    REAL_TYPE_TO_SIGNAL_TYPE[apiSignal.type] ||
    (apiSignal.type as SignalType) ||
    "email_open";

  return {
    id: apiSignal.id,
    leadId: apiSignal.leadId,
    leadName: apiSignal.leadName,
    company: apiSignal.company,
    signalType,
    description: apiSignal.description,
    urgency: apiSignal.urgency,
    channel: apiSignal.channel,
    recommendedAction: apiSignal.recommendedAction,
    recommendedChannel: apiSignal.channel === "call" ? "email" : apiSignal.channel,
    timestamp: apiSignal.timestamp,
    // Store the real type as a custom field so we can display the correct label
    // We attach it to the object even though it's not in the LiveSignal interface
    // The rendering code uses string-based lookup so this works fine
    ...(({ _realType: apiSignal.type }) as Record<string, string>),
  };
}

// ─── Touchpoint event type (from /api/touchpoints) ───────────

interface TouchpointEvent {
  id: string;
  user_id: string;
  lead_id: string | null;
  source: string;
  channel: string;
  event_type: string;
  direction: string | null;
  subject: string | null;
  body_preview: string | null;
  metadata: Record<string, unknown>;
  sentiment: string | null;
  created_at: string;
  lead_name: string | null;
  lead_company: string | null;
}

// Channel icon for the source badge
const CHANNEL_ICONS: Record<string, string> = {
  email: "\u2709\uFE0F",
  linkedin: "\uD83D\uDCAC",
  call: "\uD83D\uDCDE",
  sms: "\uD83D\uDCF1",
};

/** Determine urgency from a touchpoint event */
function touchpointUrgency(tp: TouchpointEvent): SignalUrgency {
  const eventType = tp.event_type;
  const sentiment = tp.sentiment;

  // Positive replies and meetings are immediate
  if (eventType === "replied" && sentiment === "positive") return "immediate";
  if (eventType === "meeting_booked") return "immediate";

  // Any reply, calls > 2 min, connections accepted are high
  if (eventType === "replied") return "high";
  if (eventType === "call_completed") {
    const duration = (tp.metadata?.duration as number) || 0;
    return duration > 120 ? "high" : "medium";
  }
  if (eventType === "connection_accepted") return "high";

  // Bounces warrant attention
  if (eventType === "email_bounced") return "high";

  // Opens, clicks, sent are medium
  if (eventType === "email_opened" || eventType === "email_clicked") return "medium";
  if (eventType === "stage_changed") return "medium";

  // Everything else is low
  return "low";
}

/** Build a human-readable description from a touchpoint event */
function touchpointDescription(tp: TouchpointEvent): string {
  const name = tp.lead_name || "Unknown contact";
  const via = tp.source ? ` via ${tp.source}` : "";

  switch (tp.event_type) {
    case "replied": {
      const tone = tp.sentiment ? ` (${tp.sentiment})` : "";
      const subj = tp.subject ? ` on "${tp.subject}"` : "";
      return `${name} replied${subj}${tone}${via}`;
    }
    case "call_completed": {
      const dur = (tp.metadata?.duration as number) || 0;
      const mins = Math.round(dur / 60);
      return `${mins} min call with ${name}${via}`;
    }
    case "connection_accepted":
      return `${name} accepted your LinkedIn connection request`;
    case "meeting_booked":
      return `Meeting booked with ${name}${via}`;
    case "email_sent":
      return `Email sent to ${name}${tp.subject ? `: "${tp.subject}"` : ""}${via}`;
    case "email_opened":
      return `${name} opened your email${tp.subject ? ` "${tp.subject}"` : ""}${via}`;
    case "email_clicked":
      return `${name} clicked a link in your email${via}`;
    case "email_bounced":
      return `Email to ${name} bounced${tp.subject ? ` ("${tp.subject}")` : ""}${via}`;
    case "linkedin_message":
      return `LinkedIn message ${tp.direction === "inbound" ? "from" : "to"} ${name}`;
    case "linkedin_invite_sent":
      return `LinkedIn invite sent to ${name}`;
    case "note_added":
      return `Note added for ${name}${via}`;
    case "stage_changed": {
      const stage = (tp.metadata?.new_stage as string) || "";
      return `${name} moved to ${stage || "new stage"}${via}`;
    }
    default:
      return `${tp.event_type.replace(/_/g, " ")} -- ${name}${via}`;
  }
}

/** Build recommended next action from a touchpoint event */
function touchpointRecommendation(tp: TouchpointEvent): string {
  const name = tp.lead_name || "this contact";
  switch (tp.event_type) {
    case "replied":
      return tp.sentiment === "positive"
        ? `Respond to ${name}'s positive reply and push for next step`
        : `Review and reply to ${name}`;
    case "call_completed": {
      const dur = (tp.metadata?.duration as number) || 0;
      return dur > 120
        ? `Send follow-up email to ${name} summarizing call discussion`
        : `Log call outcome and schedule follow-up with ${name}`;
    }
    case "connection_accepted":
      return `Send personalized first message to ${name} on LinkedIn`;
    case "meeting_booked":
      return `Prepare sales kit and review ${name}'s profile before the meeting`;
    case "email_opened":
      return `${name} is engaged -- consider a timely follow-up`;
    case "email_clicked":
      return `${name} clicked your link -- follow up while interest is hot`;
    case "email_bounced":
      return `Verify ${name}'s email address and find alternative contact`;
    case "stage_changed":
      return `Review ${name}'s new stage and adjust outreach strategy`;
    default:
      return `Follow up with ${name}`;
  }
}

/** Convert a touchpoint event into a LiveSignal for display */
function touchpointToLiveSignal(tp: TouchpointEvent): LiveSignal & { _realType: string; _source: string } {
  const channel = (
    tp.channel === "call" ? "call" : tp.channel === "linkedin" ? "linkedin" : "email"
  ) as "email" | "linkedin" | "call";

  const signalType: SignalType =
    REAL_TYPE_TO_SIGNAL_TYPE[tp.event_type] ||
    (tp.event_type as SignalType) ||
    "email_open";

  return {
    id: `tp-${tp.id}`,
    leadId: tp.lead_id || "",
    leadName: tp.lead_name || "Unknown",
    company: tp.lead_company || "",
    signalType,
    description: touchpointDescription(tp),
    urgency: touchpointUrgency(tp),
    channel,
    recommendedAction: touchpointRecommendation(tp),
    recommendedChannel: channel === "call" ? "email" : channel,
    timestamp: tp.created_at,
    _realType: tp.event_type,
    _source: tp.source,
  };
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
  const [signals, setSignals] = useState<LiveSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterUrgency, setFilterUrgency] = useState<SignalUrgency | "all">("all");
  const [filterChannel, setFilterChannel] = useState<"email" | "linkedin" | "call" | "all">("all");
  const [snoozeMenuId, setSnoozeMenuId] = useState<string | null>(null);

  // ── Fetch signals from touchpoints + computed signals ─────────────────────
  const fetchSignals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch real touchpoint events AND computed signals in parallel
      const [tpRes, sigRes] = await Promise.all([
        fetch("/api/touchpoints?limit=200"),
        fetch("/api/signals/generate"),
      ]);

      const allSignals: LiveSignal[] = [];
      const seenIds = new Set<string>();

      // ── Primary: real touchpoint_events ──
      if (tpRes.ok) {
        const tpData = await tpRes.json();
        const touchpoints: TouchpointEvent[] = tpData.touchpoints || [];
        for (const tp of touchpoints) {
          // Skip touchpoints without a linked lead (cannot navigate)
          if (!tp.lead_id) continue;
          const signal = touchpointToLiveSignal(tp);
          if (!seenIds.has(signal.id)) {
            seenIds.add(signal.id);
            allSignals.push(signal);
          }
        }
      } else {
        console.warn("[SignalEngine] Touchpoints fetch failed:", tpRes.status);
      }

      // ── Secondary: computed signals (email threads, stale leads, etc.) ──
      if (sigRes.ok) {
        const sigData = await sigRes.json();
        const apiSignals: APISignal[] = sigData.signals || [];
        for (const apiSig of apiSignals) {
          const signal = apiSignalToLiveSignal(apiSig);
          if (!seenIds.has(signal.id)) {
            seenIds.add(signal.id);
            allSignals.push(signal);
          }
        }
      } else {
        console.warn("[SignalEngine] Computed signals fetch failed:", sigRes.status);
      }

      if (allSignals.length === 0 && !tpRes.ok && !sigRes.ok) {
        const tpErr = await tpRes.json().catch(() => ({}));
        throw new Error(tpErr.error || `Failed to load signals (${tpRes.status})`);
      }

      // Sort: urgency first, then newest
      const URGENCY_RANK: Record<string, number> = { immediate: 0, high: 1, medium: 2, low: 3 };
      allSignals.sort((a, b) => {
        const uDiff = (URGENCY_RANK[a.urgency] ?? 9) - (URGENCY_RANK[b.urgency] ?? 9);
        if (uDiff !== 0) return uDiff;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });

      setSignals(allSignals);
    } catch (err) {
      console.error("[SignalEngine] Error fetching signals:", err);
      setError(err instanceof Error ? err.message : "Failed to load signals");
      setSignals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  // ── Determine which real signal types are present for filter dropdown ──
  const activeSignalTypes = useMemo(() => {
    const types = new Set<string>();
    for (const s of signals) {
      const realType = (s as LiveSignal & { _realType?: string })._realType || s.signalType;
      types.add(realType);
    }
    return Array.from(types);
  }, [signals]);

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
      if (filterType !== "all") {
        const realType = (s as LiveSignal & { _realType?: string })._realType || s.signalType;
        if (realType !== filterType) return false;
      }
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

  return (
    <div style={{ padding: "24px 32px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1e2a5e", marginBottom: 4 }}>
            Signal Engine
          </h2>
          <p style={{ fontSize: 13, color: "#868e96" }}>
            Real-time signals computed from your pipeline data. Act on the right signals at the right time.
          </p>
        </div>
        <button
          onClick={fetchSignals}
          disabled={loading}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #f1f3f5",
            background: loading ? "#f8f9fa" : "white",
            color: loading ? "#868e96" : "#3b5bdb",
            cursor: loading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "all 0.15s ease",
            flexShrink: 0,
          }}
        >
          {loading ? (
            <>
              <span
                style={{
                  display: "inline-block",
                  width: 14,
                  height: 14,
                  border: "2px solid #dee2e6",
                  borderTopColor: "#3b5bdb",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              Loading...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
              </svg>
              Refresh
            </>
          )}
        </button>
      </div>

      {/* Spinner keyframe (injected once) */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Error state */}
      {error && (
        <div
          style={{
            background: "#fff5f5",
            border: "1px solid #ffc9c9",
            borderRadius: 12,
            padding: "12px 16px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color: "#e03131", fontWeight: 600, fontSize: 13 }}>Error:</span>
          <span style={{ color: "#c92a2a", fontSize: 13 }}>{error}</span>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && signals.length === 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                background: "white",
                borderRadius: 12,
                padding: 20,
                border: "1px solid #f1f3f5",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "#f1f3f5" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ width: "60%", height: 12, background: "#f1f3f5", borderRadius: 4, marginBottom: 8 }} />
                  <div style={{ width: "40%", height: 10, background: "#f8f9fa", borderRadius: 4 }} />
                </div>
              </div>
            </div>
          ))}
          <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
        </div>
      )}

      {/* Main content (show when not in initial loading) */}
      {(!loading || signals.length > 0) && (
        <>
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
              onChange={(e) => setFilterType(e.target.value)}
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
              {activeSignalTypes.map((t) => {
                const meta = getSignalMeta(t);
                return (
                  <option key={t} value={t}>
                    {meta.icon} {meta.label}
                  </option>
                );
              })}
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
                    // Use the real type for display if available, fall back to signalType
                    const realType = (signal as LiveSignal & { _realType?: string })._realType || signal.signalType;
                    const meta = getSignalMeta(realType);
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
                              {signal.leadName}{signal.company ? ` at ${signal.company}` : ""}
                              {(() => {
                                const src = (signal as LiveSignal & { _source?: string })._source;
                                if (!src) return null;
                                return (
                                  <span
                                    style={{
                                      marginLeft: 8,
                                      fontSize: 10,
                                      fontWeight: 500,
                                      padding: "1px 6px",
                                      borderRadius: 4,
                                      background: "#f1f3f5",
                                      color: "#868e96",
                                    }}
                                  >
                                    via {src}
                                  </span>
                                );
                              })()}
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
          {filteredSignals.length === 0 && !loading && (
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
                No active signals
              </h3>
              <p style={{ fontSize: 13, color: "#868e96", marginBottom: 16 }}>
                {signals.length === 0
                  ? "No signals detected. Signals are generated from touchpoint events (emails, calls, LinkedIn activity) and pipeline data."
                  : "Try broadening your filter criteria to see more signals."}
              </p>
              <button
                onClick={fetchSignals}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "8px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: "linear-gradient(135deg, #1e2a5e, #3b5bdb)",
                  color: "white",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                Refresh Signals
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
