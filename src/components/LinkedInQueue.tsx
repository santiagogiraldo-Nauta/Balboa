"use client";

import { useState } from "react";
import {
  Linkedin, ChevronRight, ChevronDown, Eye, SkipForward,
  UserPlus, MessageSquare, ThumbsUp, Send, CalendarCheck, CheckCircle,
  Copy, Sparkles, RefreshCw,
} from "lucide-react";
import type { Lead, LinkedInOutreachStage, TouchpointEvent } from "@/lib/types";

interface LinkedInQueueProps {
  leads: Lead[];
  onNavigateToLead?: (leadId: string) => void;
  onUpdateLead?: (leadId: string, updates: Partial<Lead>) => void;
  onGenerateMessage?: (lead: Lead, type: string) => void;
  onCopyMessage?: (text: string) => void;
  generatingForLeadId?: string | null;
}

// Stage configuration
const STAGE_ORDER: LinkedInOutreachStage[] = [
  "not_connected", "connection_sent", "connected", "engaged", "dm_sent", "dm_replied", "meeting_booked",
];

const STAGE_CONFIG: Record<LinkedInOutreachStage, { label: string; shortLabel: string; bg: string; color: string; icon: typeof Linkedin; suggestion: string }> = {
  not_connected:   { label: "Not Connected",  shortLabel: "No Connect", bg: "#f1f5f9", color: "#64748b", icon: UserPlus,       suggestion: "Send connection request" },
  connection_sent: { label: "Request Sent",    shortLabel: "Req Sent",   bg: "#e8f4fd", color: "#0077b5", icon: UserPlus,       suggestion: "Check if accepted" },
  connected:       { label: "Connected",       shortLabel: "Connected",  bg: "#dbeafe", color: "#2563eb", icon: Linkedin,       suggestion: "Engage with their content or send intro DM" },
  engaged:         { label: "Engaged",         shortLabel: "Engaged",    bg: "#fef3c7", color: "#d97706", icon: ThumbsUp,       suggestion: "Send personalized DM" },
  dm_sent:         { label: "DM Sent",         shortLabel: "DM Sent",    bg: "#fff7ed", color: "#ea580c", icon: Send,           suggestion: "Follow up if no reply in 3 days" },
  dm_replied:      { label: "Replied",         shortLabel: "Replied",    bg: "#dcfce7", color: "#16a34a", icon: MessageSquare,  suggestion: "Continue conversation — ask for meeting" },
  meeting_booked:  { label: "Meeting Booked",  shortLabel: "Meeting",    bg: "#bbf7d0", color: "#15803d", icon: CalendarCheck,  suggestion: "Prepare for meeting" },
};

// Next stage map
const NEXT_STAGE: Record<LinkedInOutreachStage, LinkedInOutreachStage | null> = {
  not_connected: "connection_sent",
  connection_sent: "connected",
  connected: "engaged",
  engaged: "dm_sent",
  dm_sent: "dm_replied",
  dm_replied: "meeting_booked",
  meeting_booked: null,
};

// Touchpoint type for each stage advancement
const STAGE_TOUCHPOINT: Record<LinkedInOutreachStage, string> = {
  not_connected: "connection_request_sent",
  connection_sent: "connection_accepted",
  connected: "post_liked",
  engaged: "message_sent",
  dm_sent: "message_replied",
  dm_replied: "meeting_requested",
  meeting_booked: "meeting_booked",
};

const TIER_COLORS = {
  hot:  { bg: "#fef2f2", color: "#dc2626", activeBg: "#dc2626" },
  warm: { bg: "#fffbeb", color: "#d97706", activeBg: "#d97706" },
  cold: { bg: "#eff6ff", color: "#2563eb", activeBg: "#2563eb" },
};

function getLinkedInStage(lead: Lead): LinkedInOutreachStage {
  if (lead.linkedinStage) return lead.linkedinStage;
  if (!lead.channels?.linkedin) return "not_connected";
  const types = lead.touchpointTimeline
    .filter(tp => tp.channel === "linkedin")
    .map(tp => tp.type);
  if (lead.meetingScheduled) return "meeting_booked";
  if (types.includes("message_replied")) return "dm_replied";
  if (types.includes("message_sent")) return "dm_sent";
  if (types.some(t => t === "post_liked" || t === "post_commented" || t === "profile_viewed")) {
    return lead.channels.linkedinConnected ? "engaged" : "connection_sent";
  }
  if (lead.channels.linkedinConnected) return "connected";
  if (types.includes("connection_request_sent")) return "connection_sent";
  return "not_connected";
}

function daysSinceLastLinkedInTouch(lead: Lead): number | null {
  const liTouchpoints = lead.touchpointTimeline.filter(tp => tp.channel === "linkedin");
  if (liTouchpoints.length === 0) return null;
  const latest = liTouchpoints.reduce((a, b) => new Date(a.date) > new Date(b.date) ? a : b);
  return Math.floor((Date.now() - new Date(latest.date).getTime()) / 86400000);
}

export default function LinkedInQueue({ leads, onNavigateToLead, onUpdateLead, onGenerateMessage, onCopyMessage, generatingForLeadId }: LinkedInQueueProps) {
  const [stageFilter, setStageFilter] = useState<LinkedInOutreachStage | "all">("all");
  const [tierFilter, setTierFilter] = useState<"all" | "hot" | "warm" | "cold">("all");
  const [showAll, setShowAll] = useState(false);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [expandedDraft, setExpandedDraft] = useState<string | null>(null);

  // Filter to LinkedIn-only leads (no email)
  const liOnlyLeads = leads.filter(l => l.channels?.linkedin && !l.channels?.email);

  if (liOnlyLeads.length === 0) return null;

  // Enrich with stage
  const enriched = liOnlyLeads.map(l => ({
    lead: l,
    stage: getLinkedInStage(l),
    daysSince: daysSinceLastLinkedInTouch(l),
  }));

  // Stage counts for funnel bar
  const stageCounts: Record<LinkedInOutreachStage, number> = {
    not_connected: 0, connection_sent: 0, connected: 0, engaged: 0,
    dm_sent: 0, dm_replied: 0, meeting_booked: 0,
  };
  enriched.forEach(e => { stageCounts[e.stage]++; });

  // ICP tier counts
  const tierCounts: Record<"hot" | "warm" | "cold", number> = { hot: 0, warm: 0, cold: 0 };
  enriched.forEach(e => {
    const tier = e.lead.icpScore?.tier;
    if (tier && tier in tierCounts) tierCounts[tier as "hot" | "warm" | "cold"]++;
  });

  // Apply both filters
  const filtered = enriched
    .filter(e => stageFilter === "all" || e.stage === stageFilter)
    .filter(e => tierFilter === "all" || e.lead.icpScore?.tier === tierFilter);

  // Remove skipped and meeting_booked (they're done)
  const actionable = filtered
    .filter(e => !skipped.has(e.lead.id) && e.stage !== "meeting_booked")
    .sort((a, b) => {
      const aStalled = a.daysSince !== null && a.daysSince >= 3 ? 1 : 0;
      const bStalled = b.daysSince !== null && b.daysSince >= 3 ? 1 : 0;
      if (bStalled !== aStalled) return bStalled - aStalled;
      const aTier = a.lead.icpScore?.tier === "hot" ? 2 : a.lead.icpScore?.tier === "warm" ? 1 : 0;
      const bTier = b.lead.icpScore?.tier === "hot" ? 2 : b.lead.icpScore?.tier === "warm" ? 1 : 0;
      if (bTier !== aTier) return bTier - aTier;
      return STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage);
    });

  const displayed = showAll ? actionable : actionable.slice(0, 10);
  const hasMore = actionable.length > 10 && !showAll;

  const handleAdvance = (lead: Lead) => {
    const currentStage = getLinkedInStage(lead);
    const nextStage = NEXT_STAGE[currentStage];
    if (!nextStage || !onUpdateLead) return;

    const newTouchpoint: TouchpointEvent = {
      id: `tp-li-${Date.now()}`,
      channel: "linkedin",
      type: STAGE_TOUCHPOINT[currentStage],
      description: `LinkedIn: ${STAGE_CONFIG[currentStage].label} → ${STAGE_CONFIG[nextStage].label}`,
      date: new Date().toISOString(),
    };

    onUpdateLead(lead.id, {
      linkedinStage: nextStage,
      touchpointTimeline: [...lead.touchpointTimeline, newTouchpoint],
      lastOutreachMethod: "linkedin",
    });
  };

  const handleSkip = (leadId: string) => {
    setSkipped(prev => new Set(prev).add(leadId));
  };

  const Avatar = ({ name, size = 32 }: { name: string; size?: number }) => {
    const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    const colors = [
      ["#e8f4fd", "#0077b5"], ["#fef2f2", "#dc2626"], ["#ecfdf5", "#059669"],
      ["#f5f3ff", "#7c3aed"], ["#fffbeb", "#d97706"], ["#eff6ff", "#2563eb"],
    ];
    const idx = name.charCodeAt(0) % colors.length;
    return (
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: colors[idx][0], color: colors[idx][1],
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.36, fontWeight: 700, flexShrink: 0,
      }}>
        {initials}
      </div>
    );
  };

  // Total actionable respects tier filter
  const totalActionable = enriched
    .filter(e => e.stage !== "meeting_booked" && !skipped.has(e.lead.id))
    .filter(e => tierFilter === "all" || e.lead.icpScore?.tier === tierFilter)
    .length;

  return (
    <div>
      {/* Header */}
      <div className="li-queue-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: "#e8f4fd", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Linkedin className="w-4 h-4" style={{ color: "#0077b5" }} />
          </div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--balboa-navy)", letterSpacing: "-0.01em" }}>
            LinkedIn Queue
          </h3>
          <span style={{
            background: "#0077b5", color: "white", fontSize: 11, fontWeight: 700,
            padding: "2px 8px", borderRadius: 10, minWidth: 20, textAlign: "center",
          }}>
            {totalActionable}
          </span>
          <span style={{ fontSize: 12, color: "var(--balboa-text-muted)", fontWeight: 400 }}>
            connections to work
          </span>
        </div>
      </div>

      {/* Mini funnel bar */}
      <div className="li-funnel-bar">
        {STAGE_ORDER.filter(s => stageCounts[s] > 0).map(s => (
          <div
            key={s}
            className="li-funnel-segment"
            title={`${STAGE_CONFIG[s].label}: ${stageCounts[s]}`}
            style={{
              width: `${(stageCounts[s] / enriched.length) * 100}%`,
              background: STAGE_CONFIG[s].color,
            }}
          />
        ))}
      </div>

      {/* ICP tier filter pills */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8, alignItems: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginRight: 4 }}>
          ICP
        </span>
        {(["all", "hot", "warm", "cold"] as const).map(t => {
          const isActive = tierFilter === t;
          const tc = t !== "all" ? TIER_COLORS[t] : null;
          return (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className="li-action-btn"
              style={isActive
                ? { background: tc ? tc.activeBg : "var(--balboa-navy)", color: "white", borderColor: "transparent" }
                : { background: tc ? tc.bg : "var(--balboa-bg-alt)", color: tc ? tc.color : "var(--balboa-text-secondary)" }
              }
            >
              {t === "all"
                ? `All (${enriched.filter(e => e.stage !== "meeting_booked").length})`
                : `${t.charAt(0).toUpperCase() + t.slice(1)} (${tierCounts[t]})`
              }
            </button>
          );
        })}
      </div>

      {/* Stage filter pills */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginRight: 4 }}>
          Stage
        </span>
        <button
          onClick={() => setStageFilter("all")}
          className="li-action-btn"
          style={stageFilter === "all"
            ? { background: "var(--balboa-navy)", color: "white" }
            : { background: "var(--balboa-bg-alt)", color: "var(--balboa-text-secondary)" }
          }
        >
          All ({enriched.filter(e => e.stage !== "meeting_booked").length})
        </button>
        {STAGE_ORDER.filter(s => s !== "not_connected" && s !== "meeting_booked" && stageCounts[s] > 0).map(s => (
          <button
            key={s}
            onClick={() => setStageFilter(s)}
            className="li-action-btn"
            style={stageFilter === s
              ? { background: STAGE_CONFIG[s].color, color: "white" }
              : { background: STAGE_CONFIG[s].bg, color: STAGE_CONFIG[s].color }
            }
          >
            {STAGE_CONFIG[s].shortLabel} ({stageCounts[s]})
          </button>
        ))}
      </div>

      {/* Queue cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {displayed.length === 0 ? (
          <div className="card" style={{ padding: "20px 16px", textAlign: "center" }}>
            <CheckCircle className="w-6 h-6 mx-auto mb-2" style={{ color: "var(--balboa-green)" }} />
            <p style={{ fontSize: 13, color: "var(--balboa-text-muted)", fontWeight: 500 }}>
              {skipped.size > 0 ? "All done for now! LinkedIn queue cleared." : "No LinkedIn-only leads need action right now."}
            </p>
          </div>
        ) : (
          displayed.map(({ lead, stage, daysSince }) => {
            const config = STAGE_CONFIG[stage];
            const nextStage = NEXT_STAGE[stage];
            const StageIcon = config.icon;
            const isStalled = daysSince !== null && daysSince >= 3;
            const draft = lead.draftMessages?.find(d => d.status === "draft" && d.channel === "linkedin");
            const isDraftExpanded = expandedDraft === lead.id;

            return (
              <div key={lead.id} className="card li-queue-card fade-in" style={{
                borderLeftColor: config.color,
                background: isStalled ? "#fffbeb" : undefined,
                flexDirection: "column", gap: 0,
              }}>
                {/* Top row: avatar + info + action buttons */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Avatar name={`${lead.firstName} ${lead.lastName}`} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-navy)" }}>
                        {lead.firstName} {lead.lastName}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--balboa-text-muted)" }}>
                        {lead.company}
                      </span>
                      <span className={`badge badge-${lead.icpScore?.tier}`} style={{ fontSize: 9 }}>
                        {lead.icpScore?.tier?.toUpperCase()} {lead.icpScore?.overall}
                      </span>
                      <span className="li-stage-pill" style={{ background: config.bg, color: config.color }}>
                        <StageIcon className="w-2.5 h-2.5" /> {config.label}
                      </span>
                      {isStalled && (
                        <span style={{ fontSize: 10, color: "#d97706", fontWeight: 600 }}>
                          ⚠ {daysSince}d ago
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 11, color: "var(--balboa-text-secondary)", marginTop: 3, lineHeight: 1.3 }}>
                      → {config.suggestion}
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    {nextStage && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAdvance(lead); }}
                        className="li-action-btn"
                        style={{ background: config.bg, color: config.color, fontWeight: 600 }}
                      >
                        {STAGE_CONFIG[nextStage].shortLabel} <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onNavigateToLead?.(lead.id); }}
                      className="li-action-btn"
                      style={{ background: "var(--balboa-bg-alt)", color: "var(--balboa-text-secondary)" }}
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSkip(lead.id); }}
                      className="li-action-btn"
                      style={{ background: "var(--balboa-bg-alt)", color: "var(--balboa-text-light)" }}
                    >
                      <SkipForward className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Inline draft message OR generate button */}
                <div style={{ marginTop: 8, marginLeft: 48 }}>
                  {draft ? (
                    <div
                      className="li-draft-preview"
                      style={{ cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); setExpandedDraft(isDraftExpanded ? null : lead.id); }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <MessageSquare className="w-3 h-3" style={{ color: "#0077b5", flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: "var(--balboa-text-secondary)", fontWeight: 500, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: isDraftExpanded ? "pre-wrap" : "nowrap" }}>
                          {isDraftExpanded ? draft.body : (draft.body.length > 90 ? draft.body.slice(0, 90) + "..." : draft.body)}
                        </span>
                        <ChevronDown className="w-3 h-3" style={{
                          color: "var(--balboa-text-light)", flexShrink: 0,
                          transform: isDraftExpanded ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform 0.2s ease",
                        }} />
                      </div>
                      {isDraftExpanded && (
                        <div style={{ display: "flex", gap: 4, marginTop: 8 }} onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => onCopyMessage?.(draft.body)}
                            className="li-action-btn"
                            style={{ fontSize: 10, padding: "2px 8px" }}
                          >
                            <Copy className="w-3 h-3" /> Copy
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); onGenerateMessage?.(lead, "connection_followup"); }}
                      className="li-action-btn"
                      style={{ fontSize: 10, padding: "3px 10px", background: "#e8f4fd", color: "#0077b5", borderColor: "#d0e2ff" }}
                      disabled={generatingForLeadId === lead.id}
                    >
                      {generatingForLeadId === lead.id ? (
                        <><RefreshCw className="w-3 h-3 animate-spin" /> Generating...</>
                      ) : (
                        <><Sparkles className="w-3 h-3" /> Generate message</>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Show all / collapse */}
      {hasMore && (
        <button
          onClick={() => setShowAll(true)}
          className="btn-ghost"
          style={{ width: "100%", justifyContent: "center", marginTop: 8, fontSize: 12, color: "#0077b5" }}
        >
          <ChevronDown className="w-3.5 h-3.5" /> Show all {actionable.length} connections
        </button>
      )}
      {showAll && actionable.length > 10 && (
        <button
          onClick={() => setShowAll(false)}
          className="btn-ghost"
          style={{ width: "100%", justifyContent: "center", marginTop: 8, fontSize: 12, color: "var(--balboa-text-muted)" }}
        >
          Collapse
        </button>
      )}

      {/* Meeting booked count */}
      {stageCounts.meeting_booked > 0 && (
        <div style={{
          marginTop: 12, padding: "8px 12px", borderRadius: 8,
          background: "#f0fdf4", border: "1px solid #bbf7d0",
          fontSize: 12, color: "#15803d", display: "flex", alignItems: "center", gap: 6,
        }}>
          <CalendarCheck className="w-3.5 h-3.5" />
          <span style={{ fontWeight: 600 }}>{stageCounts.meeting_booked}</span> meeting{stageCounts.meeting_booked > 1 ? "s" : ""} booked from LinkedIn outreach
        </div>
      )}
    </div>
  );
}
