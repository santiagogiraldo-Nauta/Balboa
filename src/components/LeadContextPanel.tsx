"use client";

import { useState } from "react";
import {
  XCircle, CheckCircle, Clock, ChevronDown, Phone, StickyNote,
  Radar, Zap, Mail, Linkedin, AtSign, Calendar, FileText, Video,
  BookOpen, Sparkles, Target, RefreshCw,
} from "lucide-react";
import type { Lead, SupportedLanguage, CommunicationThread, DraftMessage } from "@/lib/types";
import { trackEventClient } from "@/lib/tracking";
import VascoContextButton from "@/components/VascoContextButton";
import LeadSummarizer from "@/components/LeadSummarizer";
import ActivityTimeline from "@/components/ActivityTimeline";
import ColdCallScript from "@/components/ColdCallScript";
import BattleCardPanel from "@/components/BattleCardPanel";
import CrossChannelWarning from "@/components/CrossChannelWarning";
import DraftApprovalPanel from "@/components/DraftApprovalPanel";
import CommunicationHub from "@/components/CommunicationHub";
import OutreachActivitySummary from "@/components/OutreachActivitySummary";
import PrepKitPanel from "@/components/PrepKitPanel";
import LinkedInRedirectButton from "@/components/LinkedInRedirectButton";
import LanguageSelector from "@/components/LanguageSelector";

// ─── Inline Sub-Components ────────────────────────────────────────────

const Avatar = ({ name, size = 36 }: { name: string; size?: number }) => {
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
      fontSize: size * 0.36, fontWeight: 700, letterSpacing: "-0.02em",
      flexShrink: 0,
    }}>
      {initials}
    </div>
  );
};

const ScoreRing = ({ score, size = 44 }: { score: number; size?: number }) => {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "#e03131" : score >= 40 ? "#f59f00" : "#3b5bdb";
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f3f5" strokeWidth="3" />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="score-ring" />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={size * 0.28} fontWeight="700" className="transform rotate-90" style={{ transformOrigin: "center" }}>
        {score}
      </text>
    </svg>
  );
};

const ChannelIndicator = ({ lead }: { lead: Lead }) => {
  const hasLinkedIn = lead.channels?.linkedin;
  const hasEmail = lead.channels?.email;
  if (hasLinkedIn && hasEmail) {
    return <span className="channel-pill channel-both"><Linkedin className="w-3 h-3" /><AtSign className="w-3 h-3" /> Both</span>;
  }
  if (hasLinkedIn) {
    return <span className="channel-pill channel-linkedin"><Linkedin className="w-3 h-3" /> LinkedIn</span>;
  }
  if (hasEmail) {
    return <span className="channel-pill channel-email"><AtSign className="w-3 h-3" /> Email</span>;
  }
  return null;
};

// ─── Helper ───────────────────────────────────────────────────────────

const getRecommendedAction = (lead: Lead): { action: string; reason: string; icon: string; urgency: "urgent" | "high" | "medium" | "low" } => {
  const daysSinceContact = lead.touchpointTimeline?.length > 0
    ? Math.floor((Date.now() - new Date(lead.touchpointTimeline[lead.touchpointTimeline.length - 1].date).getTime()) / (1000 * 60 * 60 * 24))
    : 999;
  const hasEmail = lead.channels?.email || lead.email;
  const hasLinkedIn = lead.channels?.linkedin || lead.linkedinUrl;
  const tier = lead.icpScore?.tier || "cold";
  const status = lead.status || "new";

  if (status === "new" && lead.contactStatus === "not_contacted") {
    if (hasLinkedIn) return { action: "Send LinkedIn Message", reason: "New lead \u2014 make your first connection", icon: "linkedin", urgency: tier === "hot" ? "urgent" : "high" };
    if (hasEmail) return { action: "Send Introduction Email", reason: "New lead \u2014 introduce yourself", icon: "email", urgency: tier === "hot" ? "urgent" : "high" };
    return { action: "Research Lead", reason: "New lead \u2014 gather contact info", icon: "research", urgency: "medium" };
  }
  if (lead.contactStatus === "positive") {
    return { action: "Schedule Meeting", reason: "Positive response \u2014 strike while hot", icon: "meeting", urgency: "urgent" };
  }
  if (status === "opportunity") {
    return { action: "Send Proposal/Deck", reason: "Opportunity stage \u2014 advance the deal", icon: "proposal", urgency: "high" };
  }
  if (status === "engaged" && daysSinceContact > 5) {
    return { action: "Send Follow-up Email", reason: `No contact in ${daysSinceContact} days \u2014 re-engage`, icon: "email", urgency: daysSinceContact > 14 ? "urgent" : "high" };
  }
  if (status === "researched") {
    if (tier === "hot") return { action: "Send Personalized Email", reason: "Hot lead \u2014 ready for outreach", icon: "email", urgency: "high" };
    return { action: "Send LinkedIn Message", reason: "Researched \u2014 initiate contact", icon: "linkedin", urgency: "medium" };
  }
  if (lead.contactStatus === "not_contacted" || lead.contactStatus === "neutral") {
    if (daysSinceContact > 7) return { action: "Send Follow-up", reason: `Last contact ${daysSinceContact}d ago \u2014 follow up`, icon: "email", urgency: daysSinceContact > 14 ? "high" : "medium" };
  }
  if (status === "nurture") {
    return { action: "Share Content/Article", reason: "Nurture \u2014 stay top of mind", icon: "proposal", urgency: "low" };
  }
  return { action: "Review & Plan Next Step", reason: "Assess current status", icon: "research", urgency: "low" };
};

// ─── Props Interface ──────────────────────────────────────────────────

interface LeadContextPanelProps {
  lead: Lead;
  communications: CommunicationThread[];
  language: SupportedLanguage;
  mode: "full" | "compact" | "outreach-sidebar";
  onClose?: () => void;
  onAskVasco: (prompt: string) => void;
  onUpdateLeadStatus: (leadId: string, status: Lead["status"]) => void;
  onAddNote: (leadId: string, note: string) => void;
  onAnalyzeLead: (lead: Lead) => void;
  onGenerateMessage: (lead: Lead, type: string, channel?: "email" | "linkedin") => void;
  onUpdateDraftStatus: (leadId: string, draftId: string, status: DraftMessage["status"]) => void;
  onBattleCardGenerate: (leadId: string, competitor: string) => void;
  battleCardGenerating?: string | null;
  onCopyMessage: (text: string) => void;
  onOpenEmailPopup: (prefill?: { subject?: string; body?: string; draftId?: string }) => void;
  onOpenLinkedInPopup: (prefill?: { body?: string; draftId?: string }) => void;
  onOpenProposalPopup: () => void;
  onOpenVideoPrep: () => void;
  onOpenPrepKit: () => void;
  onOpenMeetingScheduler: () => void;
  onOpenDeepResearch: () => void;
  generatingAction: string | null;
  leadAnalysis?: any;
  analyzingLead?: boolean;
  contentLanguage: SupportedLanguage;
  onLanguageChange: (lang: SupportedLanguage) => void;
}

// ─── Component ────────────────────────────────────────────────────────

export default function LeadContextPanel({
  lead,
  communications,
  language,
  mode,
  onClose,
  onAskVasco,
  onUpdateLeadStatus,
  onAddNote,
  onAnalyzeLead,
  onGenerateMessage,
  onUpdateDraftStatus,
  onBattleCardGenerate,
  battleCardGenerating,
  onCopyMessage,
  onOpenEmailPopup,
  onOpenLinkedInPopup,
  onOpenProposalPopup,
  onOpenVideoPrep,
  onOpenPrepKit,
  onOpenMeetingScheduler,
  onOpenDeepResearch,
  generatingAction,
  leadAnalysis,
  analyzingLead,
  contentLanguage,
  onLanguageChange,
}: LeadContextPanelProps) {
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [quickNote, setQuickNote] = useState("");

  const showSection = (section: number): boolean => {
    if (mode === "full") return true;
    if (mode === "outreach-sidebar") {
      // Shows: 1 (header), 2 (score+pipeline), 4 (key signals), 6 (call outcomes),
      //        7 (activity timeline), 8 (quick note), 14 (draft approval), 15 (communication hub)
      return [1, 2, 4, 6, 7, 8, 14, 15].includes(section);
    }
    if (mode === "compact") {
      // Shows: 1 (header), 2 (score+pipeline), 4 (key signals), 6 (call outcomes),
      //        7 (activity timeline), 8 (quick note)
      return [1, 2, 4, 6, 7, 8].includes(section);
    }
    return false;
  };

  const handleQuickNoteSubmit = () => {
    if (!quickNote.trim()) return;
    onAddNote(lead.id, quickNote);
    setQuickNote("");
  };

  return (
    <>
      {/* ──── Section 1: Header ──── */}
      {showSection(1) && (
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <Avatar name={`${lead.firstName} ${lead.lastName}`} size={48} />
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--balboa-navy)", letterSpacing: "-0.02em", lineHeight: 1.2 }}>{lead.firstName} {lead.lastName}</h2>
              <p style={{ fontSize: 13, color: "var(--balboa-text-secondary)", marginTop: 2 }}>{lead.position}</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-blue)", marginTop: 1 }}>{lead.company}</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ChannelIndicator lead={lead} />
            {onClose && (
              <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}>
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ──── Section 2: Score + Pipeline merged row ──── */}
      {showSection(2) && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, padding: "14px 16px", background: "var(--balboa-bg-alt)", borderRadius: 12, border: "1px solid var(--balboa-border-light)" }}>
          <ScoreRing score={lead.icpScore?.overall || 0} size={48} />
          <VascoContextButton
            prompt={`Explain the ICP score breakdown for ${lead.firstName} ${lead.lastName} at ${lead.company}. Their overall score is ${lead.icpScore?.overall || 0} (tier: ${lead.icpScore?.tier || "unknown"}). What does this score mean for prioritization? What factors are driving it up or down?`}
            tooltip="Ask Vasco about this ICP score"
            onClick={onAskVasco}
          />
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", flex: 1 }}>
            {(["new", "researched", "engaged", "opportunity", "nurture"] as const).map((s) => (
              <button key={s} onClick={() => onUpdateLeadStatus(lead.id, s)}
                style={{
                  padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer",
                  transition: "all 0.15s ease", letterSpacing: "-0.01em",
                  ...(lead.status === s
                    ? { background: "var(--balboa-navy)", color: "white", boxShadow: "0 1px 3px rgba(30,42,94,0.2)" }
                    : { background: "white", color: "var(--balboa-text-muted)", border: "1px solid var(--balboa-border)" }),
                }}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ──── Section 3: Lead Summarizer ──── */}
      {showSection(3) && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <LeadSummarizer lead={lead} language={contentLanguage} />
            <VascoContextButton
              prompt={`Give me a complete summary analysis of ${lead.firstName} ${lead.lastName} at ${lead.company}. Include their engagement history, sentiment, and recommended next steps.`}
              tooltip="Ask Vasco about this lead's history"
              onClick={onAskVasco}
            />
          </div>
        </div>
      )}

      {/* ──── Section 4: Key Signals + expandable company intel ──── */}
      {showSection(4) && lead.icpScore?.signals && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <h4 style={{ fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Key Signals
            </h4>
            <VascoContextButton
              prompt={`Analyze the key signals and company intelligence for ${lead.firstName} ${lead.lastName} at ${lead.company}. Signals: ${lead.icpScore?.signals?.join(", ") || "none"}. Company: ${lead.companyIntel?.industry || "unknown"} industry, ${lead.companyIntel?.employeeCount || "unknown"} employees, revenue ${lead.companyIntel?.estimatedRevenue || "unknown"}. What do these signals tell us about timing and approach?`}
              tooltip="Ask Vasco about these signals"
              onClick={onAskVasco}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {lead.icpScore.signals.slice(0, 2).map((s, i) => (
              <div key={i} style={{ fontSize: 12, display: "flex", alignItems: "flex-start", gap: 8, color: "var(--balboa-text-secondary)", lineHeight: 1.4 }}>
                <CheckCircle className="w-3.5 h-3.5" style={{ color: "var(--balboa-green)", flexShrink: 0, marginTop: 1 }} /> {s}
              </div>
            ))}
          </div>
          {(lead.icpScore.signals.length > 2 || lead.companyIntel) && (
            <button onClick={() => setDetailExpanded(!detailExpanded)}
              className="btn-ghost" style={{ color: "var(--balboa-blue)", fontSize: 11, marginTop: 8 }}>
              <ChevronDown className="w-3 h-3" style={{ transform: detailExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
              {detailExpanded ? "Hide details" : "Show company intel & all signals"}
            </button>
          )}

          {/* Expanded section */}
          {detailExpanded && (
            <div className="fade-in" style={{ marginTop: 12 }}>
              {/* Remaining signals */}
              {lead.icpScore.signals.length > 2 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                  {lead.icpScore.signals.slice(2).map((s, i) => (
                    <div key={i} style={{ fontSize: 12, display: "flex", alignItems: "flex-start", gap: 8, color: "var(--balboa-text-secondary)", lineHeight: 1.4 }}>
                      <CheckCircle className="w-3.5 h-3.5" style={{ color: "var(--balboa-green)", flexShrink: 0, marginTop: 1 }} /> {s}
                    </div>
                  ))}
                </div>
              )}

              {/* Company Intel */}
              {lead.companyIntel && (
                <div style={{ borderRadius: 10, padding: 14, background: "var(--balboa-bg-alt)", border: "1px solid var(--balboa-border-light)", display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div><span style={{ color: "var(--balboa-text-muted)", fontWeight: 500 }}>Industry</span><br /><span style={{ fontWeight: 600 }}>{lead.companyIntel.industry}</span></div>
                    <div><span style={{ color: "var(--balboa-text-muted)", fontWeight: 500 }}>Revenue</span><br /><span style={{ fontWeight: 600 }}>{lead.companyIntel.estimatedRevenue}</span></div>
                    <div><span style={{ color: "var(--balboa-text-muted)", fontWeight: 500 }}>Employees</span><br /><span style={{ fontWeight: 600 }}>{lead.companyIntel.employeeCount}</span></div>
                  </div>
                  {lead.companyIntel.balboaFitReason && (
                    <div style={{ paddingTop: 8, borderTop: "1px solid var(--balboa-border-light)" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--balboa-navy)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Balboa Fit</span>
                      <p style={{ marginTop: 4, lineHeight: 1.4 }}>{lead.companyIntel.balboaFitReason}</p>
                    </div>
                  )}
                  {lead.companyIntel.painPoints?.length > 0 && (
                    <div style={{ paddingTop: 8, borderTop: "1px solid var(--balboa-border-light)" }}>
                      <span style={{ color: "var(--balboa-text-muted)", fontWeight: 500 }}>Pain Points</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                        {lead.companyIntel.painPoints.map((p, i) => (
                          <span key={i} className="badge badge-hot" style={{ fontSize: 10 }}>{p}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ──── Section 5: Deep Research button + Vasco ──── */}
      {showSection(5) && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={onOpenDeepResearch}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 8,
                background: "linear-gradient(135deg, rgba(30,42,94,0.04), rgba(59,91,219,0.08))",
                border: "1px solid rgba(59,91,219,0.15)",
                cursor: "pointer", fontSize: 12, fontWeight: 600,
                color: "var(--balboa-navy)", transition: "all 0.15s ease",
              }}
            >
              <Radar className="w-3.5 h-3.5" style={{ color: "var(--balboa-blue)" }} />
              Deep Research
            </button>
            <VascoContextButton
              prompt={`Do a deep research analysis on ${lead.firstName} ${lead.lastName} at ${lead.company}. Cover their role, company overview, industry trends, competitive landscape, and the best approach for outreach.`}
              tooltip="Ask Vasco for deep research"
              onClick={onAskVasco}
            />
          </div>
        </div>
      )}

      {/* ──── Section 6: Call Outcomes ──── */}
      {showSection(6) && lead.callLogs && lead.callLogs.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <h4 style={{ fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              <Phone className="w-3.5 h-3.5" style={{ color: "#059669" }} /> Call Outcomes
            </h4>
            <VascoContextButton
              prompt={`Analyze the call outcomes for ${lead.firstName} ${lead.lastName}. They have ${lead.callLogs?.length || 0} call(s) logged. What patterns do you see? What should the next call strategy be? Any follow-up actions from the call results?`}
              tooltip="Ask Vasco about call outcomes"
              onClick={onAskVasco}
            />
          </div>
          {lead.callLogs.slice(-1).map(call => (
            <div key={call.id} style={{ borderRadius: 10, padding: 12, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
              <div style={{ fontSize: 11, marginBottom: 8, color: "var(--balboa-text-muted)", fontWeight: 500 }}>
                {call.platform.replace("_", " ")} &middot; {call.duration || "N/A"} &middot; {new Date(call.date).toLocaleDateString()}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {call.outcomes.map((o, i) => (
                  <span key={i} className={`outcome-chip ${o.completed ? "" : "active"}`} style={{ fontSize: 11, cursor: "default" }}>
                    {o.completed ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                    {o.description}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ──── Section 7: Activity Timeline (last 5) ──── */}
      {showSection(7) && lead.touchpointTimeline && lead.touchpointTimeline.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <h4 style={{ fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              <Clock className="w-3.5 h-3.5" style={{ color: "var(--balboa-navy)" }} /> Activity Timeline
            </h4>
            <VascoContextButton
              prompt={`Analyze the activity timeline for ${lead.firstName} ${lead.lastName}. What patterns do you see in their engagement? Are there gaps in communication? What should be the next touchpoint?`}
              tooltip="Ask Vasco about activity patterns"
              onClick={onAskVasco}
            />
          </div>
          <div style={{ background: "var(--balboa-bg-alt)", borderRadius: 10, padding: 14, border: "1px solid var(--balboa-border-light)" }}>
            <ActivityTimeline events={lead.touchpointTimeline.slice(-5)} />
            {lead.touchpointTimeline.length > 5 && (
              <button className="btn-ghost" style={{ color: "var(--balboa-blue)", fontSize: 11, marginTop: 8 }}
                onClick={() => {/* Could expand to full timeline */}}>
                Show all {lead.touchpointTimeline.length} events
              </button>
            )}
          </div>
        </div>
      )}

      {/* ──── Section 8: Quick Note ──── */}
      {showSection(8) && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <h4 style={{ fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              <StickyNote className="w-3.5 h-3.5" style={{ color: "#d97706" }} /> Quick Note
            </h4>
            <VascoContextButton
              prompt={`Review the notes for ${lead.firstName} ${lead.lastName} at ${lead.company}. Notes: ${lead.notes || "none yet"}. What insights can you draw from these notes? What should I note down next?`}
              tooltip="Ask Vasco about notes"
              onClick={onAskVasco}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              placeholder="Add a note about this lead..."
              value={quickNote}
              onChange={e => setQuickNote(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && quickNote.trim()) handleQuickNoteSubmit(); }}
              style={{
                flex: 1, fontSize: 12, padding: "8px 12px", borderRadius: 8,
                border: "1px solid var(--balboa-border)", outline: "none",
                background: "var(--balboa-bg-alt)", color: "var(--balboa-text-secondary)",
              }}
            />
            <button
              onClick={handleQuickNoteSubmit}
              disabled={!quickNote.trim()}
              className="btn-primary"
              style={{ fontSize: 11, padding: "8px 14px", opacity: quickNote.trim() ? 1 : 0.4 }}
            >
              Save
            </button>
          </div>
          {/* Existing notes from lead.notes field */}
          {lead.notes && (
            <div style={{
              marginTop: 8, padding: "8px 12px", borderRadius: 8,
              background: "#fffbeb", border: "1px solid #fde68a", fontSize: 12,
              color: "#92400e", lineHeight: 1.4, fontStyle: "italic",
            }}>
              <span style={{ fontWeight: 600, fontStyle: "normal" }}>Notes: </span>
              {lead.notes}
            </div>
          )}
        </div>
      )}

      {/* ──── Compact mode: "Show full details" button ──── */}
      {mode === "compact" && (
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <button
            className="btn-ghost"
            style={{
              color: "var(--balboa-blue)", fontSize: 12, fontWeight: 600,
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            <ChevronDown className="w-3.5 h-3.5" />
            Show full details
          </button>
        </div>
      )}

      {/* ──── Section 9: Quick Actions (recommended action + 4-button grid + sales tools row) ──── */}
      {showSection(9) && (() => {
        const rec = getRecommendedAction(lead);
        const urgencyColors: Record<string, { bg: string; border: string; text: string; dot: string }> = {
          urgent: { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b", dot: "#dc2626" },
          high: { bg: "#fff7ed", border: "#fdba74", text: "#9a3412", dot: "#f97316" },
          medium: { bg: "#f0f4ff", border: "#93b4fd", text: "#1e3a8a", dot: "#3b82f6" },
          low: { bg: "var(--balboa-bg-alt)", border: "var(--balboa-border)", text: "var(--balboa-text-secondary)", dot: "#94a3b8" },
        };
        const uc = urgencyColors[rec.urgency] || urgencyColors.medium;

        return (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <h4 style={{ fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                <Zap className="w-3.5 h-3.5" style={{ color: "var(--balboa-orange)" }} /> Quick Actions
              </h4>
              <VascoContextButton
                prompt={`What is the best next action for ${lead.firstName} ${lead.lastName} at ${lead.company}? Consider their ICP score (${lead.icpScore?.overall || 0}), status (${lead.status}), and contact status (${lead.contactStatus}). Recommend the optimal channel, timing, and message approach.`}
                tooltip="Ask Vasco for action recommendations"
                onClick={onAskVasco}
              />
            </div>

            {/* Recommended action banner */}
            <div style={{
              padding: "12px 14px", borderRadius: 10, marginBottom: 12,
              background: uc.bg, border: `1px solid ${uc.border}`,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: uc.dot, flexShrink: 0,
                boxShadow: rec.urgency === "urgent" ? `0 0 6px ${uc.dot}` : "none",
                animation: rec.urgency === "urgent" ? "pulse 2s infinite" : "none",
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: uc.text, lineHeight: 1.3 }}>
                  {rec.urgency === "urgent" ? "\ud83d\udd34 " : rec.urgency === "high" ? "\ud83d\udfe0 " : ""}{rec.action}
                </p>
                <p style={{ fontSize: 11, color: uc.text, opacity: 0.8, marginTop: 2, lineHeight: 1.3 }}>
                  {rec.reason}
                </p>
              </div>
            </div>

            {/* Action buttons grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              {/* Send Email */}
              <button onClick={() => onOpenEmailPopup()}
                disabled={!!generatingAction}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10,
                  background: rec.icon === "email" ? "linear-gradient(135deg, var(--balboa-navy), var(--balboa-blue))" : "white",
                  color: rec.icon === "email" ? "white" : "var(--balboa-navy)",
                  border: rec.icon === "email" ? "none" : "1px solid var(--balboa-border)",
                  cursor: generatingAction ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, transition: "all 0.2s ease",
                  boxShadow: rec.icon === "email" ? "0 2px 8px rgba(30,42,94,0.25)" : "none",
                  opacity: generatingAction ? 0.5 : 1,
                }}>
                <Mail className="w-4 h-4" style={{ flexShrink: 0, opacity: rec.icon === "email" ? 1 : 0.7 }} />
                <span>Send Email</span>
              </button>

              {/* Send LinkedIn Message */}
              <button onClick={() => onOpenLinkedInPopup()}
                disabled={!!generatingAction}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10,
                  background: rec.icon === "linkedin" ? "linear-gradient(135deg, #0077b5, #00a0dc)" : "white",
                  color: rec.icon === "linkedin" ? "white" : "#0077b5",
                  border: rec.icon === "linkedin" ? "none" : "1px solid #b3d4fc",
                  cursor: generatingAction ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, transition: "all 0.2s ease",
                  boxShadow: rec.icon === "linkedin" ? "0 2px 8px rgba(0,119,181,0.25)" : "none",
                  opacity: generatingAction ? 0.5 : 1,
                }}>
                <Linkedin className="w-4 h-4" style={{ flexShrink: 0, opacity: rec.icon === "linkedin" ? 1 : 0.7 }} />
                <span>LinkedIn Msg</span>
              </button>

              {/* Schedule Meeting */}
              <button onClick={onOpenMeetingScheduler}
                disabled={!!generatingAction}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10,
                  background: rec.icon === "meeting" ? "linear-gradient(135deg, #059669, #10b981)" : "white",
                  color: rec.icon === "meeting" ? "white" : "#059669",
                  border: rec.icon === "meeting" ? "none" : "1px solid #a7f3d0",
                  cursor: generatingAction ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, transition: "all 0.2s ease",
                  boxShadow: rec.icon === "meeting" ? "0 2px 8px rgba(5,150,105,0.25)" : "none",
                  opacity: generatingAction ? 0.5 : 1,
                }}>
                <Calendar className="w-4 h-4" style={{ flexShrink: 0, opacity: rec.icon === "meeting" ? 1 : 0.7 }} />
                <span>Schedule Meeting</span>
              </button>

              {/* Send Proposal/Deck */}
              <button onClick={onOpenProposalPopup}
                disabled={!!generatingAction}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10,
                  background: rec.icon === "proposal" ? "linear-gradient(135deg, #7c3aed, #a855f7)" : "white",
                  color: rec.icon === "proposal" ? "white" : "#7c3aed",
                  border: rec.icon === "proposal" ? "none" : "1px solid #c4b5fd",
                  cursor: generatingAction ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, transition: "all 0.2s ease",
                  boxShadow: rec.icon === "proposal" ? "0 2px 8px rgba(124,58,237,0.25)" : "none",
                  opacity: generatingAction ? 0.5 : 1,
                }}>
                <FileText className="w-4 h-4" style={{ flexShrink: 0, opacity: rec.icon === "proposal" ? 1 : 0.7 }} />
                <span>Send Proposal</span>
              </button>
            </div>

            {/* Sales Tools row -- Video + Prep Kit */}
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button onClick={onOpenVideoPrep}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, flex: 1,
                  background: "var(--balboa-bg-alt)", color: "var(--balboa-navy)",
                  border: "1px solid var(--balboa-border)", cursor: "pointer",
                  fontSize: 11, fontWeight: 600, transition: "all 0.2s ease",
                }}>
                <Video className="w-3.5 h-3.5" style={{ opacity: 0.7 }} /> Create Video
              </button>
              <button onClick={onOpenPrepKit}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, flex: 1,
                  background: "var(--balboa-bg-alt)", color: "var(--balboa-navy)",
                  border: "1px solid var(--balboa-border)", cursor: "pointer",
                  fontSize: 11, fontWeight: 600, transition: "all 0.2s ease",
                }}>
                <BookOpen className="w-3.5 h-3.5" style={{ opacity: 0.7 }} /> Prep Kit
              </button>
              <LinkedInRedirectButton lead={lead} onCopy={onCopyMessage} style={{ flex: 1 }} />
            </div>

            {/* Video preps count + Prep Kit panel */}
            {lead.videoPreps && lead.videoPreps.length > 0 && (
              <p style={{ fontSize: 11, marginTop: 4, display: "flex", alignItems: "center", gap: 4, color: "var(--balboa-text-muted)" }}>
                <CheckCircle className="w-3 h-3" style={{ color: "var(--balboa-green)" }} />
                {lead.videoPreps.length} video prep{lead.videoPreps.length > 1 ? "s" : ""} saved
              </p>
            )}
            <PrepKitPanel
              kits={lead.prepKits || []}
              onGenerateNew={onOpenPrepKit}
            />
          </div>
        );
      })()}

      {/* ──── Section 10: Lead Intelligence (AI analysis) ──── */}
      {showSection(10) && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <h4 style={{ fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--balboa-blue)" }} /> Lead Intelligence
              </h4>
              <VascoContextButton
                prompt={`Provide strategic intelligence on ${lead.firstName} ${lead.lastName} at ${lead.company}. What is the best channel, timing, and messaging approach? What are the expected outcomes based on their profile?`}
                tooltip="Ask Vasco for lead intelligence"
                onClick={onAskVasco}
              />
            </div>
            <button
              onClick={() => onAnalyzeLead(lead)}
              disabled={analyzingLead}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "6px 14px", borderRadius: 8,
                background: analyzingLead ? "var(--balboa-bg-alt)" : "linear-gradient(135deg, var(--balboa-navy), var(--balboa-blue))",
                color: analyzingLead ? "var(--balboa-text-muted)" : "white",
                border: "none", cursor: analyzingLead ? "not-allowed" : "pointer",
                fontSize: 11, fontWeight: 700, transition: "all 0.2s ease",
                boxShadow: analyzingLead ? "none" : "0 2px 8px rgba(30,42,94,0.20)",
              }}
            >
              {analyzingLead ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Analyzing...</>
              ) : (
                <><Target className="w-3.5 h-3.5" /> {leadAnalysis ? "Re-analyze" : "Analyze Lead"}</>
              )}
            </button>
          </div>

          {!leadAnalysis && !analyzingLead && (
            <div style={{
              padding: "16px 18px", borderRadius: 12,
              background: "linear-gradient(135deg, rgba(30,42,94,0.03), rgba(59,91,219,0.05))",
              border: "1px dashed var(--balboa-border)",
              textAlign: "center",
            }}>
              <Sparkles className="w-5 h-5" style={{ color: "var(--balboa-blue)", opacity: 0.5, margin: "0 auto 8px" }} />
              <p style={{ fontSize: 12, color: "var(--balboa-text-muted)", lineHeight: 1.5 }}>
                Click <strong>Analyze Lead</strong> to get AI-powered recommendations based on playbook intelligence — best channel, optimal timing, and expected outcomes.
              </p>
            </div>
          )}

          {analyzingLead && (
            <div style={{
              padding: "20px", borderRadius: 12,
              background: "var(--balboa-bg-alt)", border: "1px solid var(--balboa-border-light)",
              textAlign: "center",
            }}>
              <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-3"
                style={{ borderColor: "var(--balboa-border)", borderTopColor: "var(--balboa-navy)" }} />
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-navy)" }}>Analyzing {lead.firstName} with Playbook Intelligence...</p>
              <p style={{ fontSize: 11, color: "var(--balboa-text-muted)", marginTop: 4 }}>Checking best channel, timing, and expected outcomes</p>
            </div>
          )}

          {leadAnalysis && !analyzingLead && (
            <div style={{
              borderRadius: 12, overflow: "hidden",
              border: "1px solid var(--balboa-border-light)",
              background: "white",
            }}>
              {/* Strategy recommendation */}
              <div style={{
                padding: "14px 16px",
                background: leadAnalysis.urgency === "immediate" ? "linear-gradient(135deg, #fef2f2, #fff1f2)"
                  : leadAnalysis.urgency === "high" ? "linear-gradient(135deg, #fff7ed, #fffbeb)"
                  : "linear-gradient(135deg, #f0f4ff, #eff6ff)",
                borderBottom: "1px solid var(--balboa-border-light)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em",
                    padding: "2px 8px", borderRadius: 4,
                    background: leadAnalysis.urgency === "immediate" ? "#dc2626" : leadAnalysis.urgency === "high" ? "#f97316" : "#3b82f6",
                    color: "white",
                  }}>
                    {leadAnalysis.urgency}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--balboa-navy)" }}>
                    {leadAnalysis.recommendedAction}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: "var(--balboa-text-secondary)", lineHeight: 1.5 }}>
                  {leadAnalysis.reasoning}
                </p>
              </div>

              {/* Metrics grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
                {/* Best Channel */}
                <div style={{ padding: "12px 16px", borderRight: "1px solid var(--balboa-border-light)", borderBottom: "1px solid var(--balboa-border-light)" }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Best Channel</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {leadAnalysis.recommendedChannel === "email"
                      ? <Mail className="w-4 h-4" style={{ color: "var(--balboa-navy)" }} />
                      : <Linkedin className="w-4 h-4" style={{ color: "#0077b5" }} />}
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--balboa-navy)", textTransform: "capitalize" }}>
                      {leadAnalysis.recommendedChannel}
                    </span>
                  </div>
                </div>

                {/* Best Timing */}
                <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--balboa-border-light)" }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Best Timing</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Clock className="w-4 h-4" style={{ color: "#059669" }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--balboa-navy)" }}>
                      {leadAnalysis.recommendedTiming}
                    </span>
                  </div>
                </div>

                {/* Expected Outcomes */}
                <div style={{ padding: "12px 16px", gridColumn: "1 / -1" }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Expected Outcomes</p>
                  <div style={{ display: "flex", gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: "var(--balboa-navy)" }}>
                          {Math.round((leadAnalysis.expectedOutcomes?.replyRate || 0) * 100)}%
                        </span>
                      </div>
                      <p style={{ fontSize: 10, color: "var(--balboa-text-muted)", fontWeight: 600 }}>Reply Rate</p>
                      <div className="rate-bar-track" style={{ marginTop: 4, height: 4 }}>
                        <div className="rate-bar-fill" style={{ width: `${(leadAnalysis.expectedOutcomes?.replyRate || 0) * 100}%`, background: "#059669" }} />
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: "var(--balboa-navy)" }}>
                          {Math.round((leadAnalysis.expectedOutcomes?.meetingRate || 0) * 100)}%
                        </span>
                      </div>
                      <p style={{ fontSize: 10, color: "var(--balboa-text-muted)", fontWeight: 600 }}>Meeting Rate</p>
                      <div className="rate-bar-track" style={{ marginTop: 4, height: 4 }}>
                        <div className="rate-bar-fill" style={{ width: `${(leadAnalysis.expectedOutcomes?.meetingRate || 0) * 100}%`, background: "#3b82f6" }} />
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: "var(--balboa-navy)" }}>
                          {Math.round((leadAnalysis.expectedOutcomes?.closeRate || 0) * 100)}%
                        </span>
                      </div>
                      <p style={{ fontSize: 10, color: "var(--balboa-text-muted)", fontWeight: 600 }}>Close Rate</p>
                      <div className="rate-bar-track" style={{ marginTop: 4, height: 4 }}>
                        <div className="rate-bar-fill" style={{ width: `${(leadAnalysis.expectedOutcomes?.closeRate || 0) * 100}%`, background: "#7c3aed" }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick action from analysis */}
              <div style={{ padding: "10px 16px", borderTop: "1px solid var(--balboa-border-light)", background: "var(--balboa-bg-alt)", display: "flex", gap: 8 }}>
                <button
                  onClick={() => onGenerateMessage(lead,
                    leadAnalysis.recommendedChannel === "email" ? "email_initial" : "connection_followup",
                    leadAnalysis.recommendedChannel)}
                  disabled={!!generatingAction}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    padding: "8px 12px", borderRadius: 8,
                    background: "linear-gradient(135deg, var(--balboa-navy), var(--balboa-blue))",
                    color: "white", border: "none",
                    cursor: generatingAction ? "not-allowed" : "pointer",
                    fontSize: 12, fontWeight: 700, transition: "all 0.2s ease",
                    boxShadow: "0 2px 8px rgba(30,42,94,0.20)",
                    opacity: generatingAction ? 0.6 : 1,
                  }}
                >
                  {generatingAction ? (
                    <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating...</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5" /> Generate {leadAnalysis.recommendedChannel === "email" ? "Email" : "LinkedIn"} Draft</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ──── Section 11: Cold Call Script ──── */}
      {showSection(11) && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <h4 style={{ fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              <Phone className="w-3.5 h-3.5" style={{ color: "#7c3aed" }} /> Cold Call Script
            </h4>
            <VascoContextButton
              prompt={`Help me prepare for a cold call with ${lead.firstName} ${lead.lastName}, ${lead.position} at ${lead.company}. Their ICP score is ${lead.icpScore?.overall || 0} (${lead.icpScore?.tier || "unknown"}). Industry: ${lead.companyIntel?.industry || "unknown"}. What's the best opener? What objections should I expect? What value props should I lead with?`}
              tooltip="Ask Vasco for call prep"
              onClick={onAskVasco}
            />
          </div>
          <ColdCallScript
            lead={lead}
            language={contentLanguage}
            onCallStarted={(callLead) => {
              trackEventClient({
                eventCategory: "call",
                eventAction: "click_to_call",
                leadId: callLead.id,
                channel: "call",
                leadTier: callLead.icpScore?.tier,
              });
            }}
          />
        </div>
      )}

      {/* ──── Section 12: Battle Cards ──── */}
      {showSection(12) && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <h4 style={{ fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {"\ud83d\udee1\ufe0f"} Battle Cards
            </h4>
            <VascoContextButton
              prompt={`Generate competitive intelligence for selling to ${lead.firstName} ${lead.lastName} at ${lead.company} (${lead.companyIntel?.industry || "unknown"} industry). Who are the likely competitors they're evaluating? What are our key differentiators? Give me talking points to win against each competitor.`}
              tooltip="Ask Vasco for competitive intel"
              onClick={onAskVasco}
            />
          </div>
          <BattleCardPanel
            lead={lead}
            cards={lead.battleCards || []}
            onGenerate={(competitor) => onBattleCardGenerate(lead.id, competitor)}
            loading={battleCardGenerating === lead.id}
          />
        </>
      )}

      {/* ──── Section 13: Cross-Channel Warning ──── */}
      {showSection(13) && (
        <CrossChannelWarning lead={lead} currentChannel="linkedin" />
      )}

      {/* ──── Section 14: Draft Approval Panel ──── */}
      {showSection(14) && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <VascoContextButton
                prompt={`Review all my draft messages for ${lead.firstName} ${lead.lastName} at ${lead.company}. I have ${lead.draftMessages?.length || 0} draft(s). Analyze the messaging quality, suggest improvements, and tell me which draft should be sent first and why. Consider the lead's ICP tier (${lead.icpScore?.tier || "unknown"}) and status (${lead.status}).`}
                tooltip="Ask Vasco to review drafts"
                onClick={onAskVasco}
              />
            </div>
            <LanguageSelector value={contentLanguage} onChange={onLanguageChange} />
          </div>
          <DraftApprovalPanel
            drafts={lead.draftMessages}
            lead={lead}
            onApprove={(id) => onUpdateDraftStatus(lead.id, id, "approved")}
            onReject={(id) => onUpdateDraftStatus(lead.id, id, "rejected")}
            onSendViaEmail={(d) => {
              onOpenEmailPopup({ subject: d.subject, body: d.body, draftId: d.id });
            }}
            onSendViaLinkedIn={(d) => {
              onOpenLinkedInPopup({ body: d.body, draftId: d.id });
            }}
            onCopy={onCopyMessage}
            onGenerateLinkedIn={() => onGenerateMessage(lead, "connection_followup", "linkedin")}
            onGenerateEmail={() => onGenerateMessage(lead, "email_initial", "email")}
            onGenerateProposal={onOpenProposalPopup}
            generatingAction={generatingAction}
          />
        </>
      )}

      {/* ──── Section 15: Communication Hub ──── */}
      {showSection(15) && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <h4 style={{ fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {"\ud83d\udcac"} Communication History
            </h4>
            <VascoContextButton
              prompt={`Analyze the full communication history with ${lead.firstName} ${lead.lastName} at ${lead.company}. Look at all channels (email, LinkedIn, SMS, WhatsApp, calls). What's the engagement pattern? Are there gaps in communication? What's the sentiment trend? What should be the next touchpoint and when?`}
              tooltip="Ask Vasco about communication patterns"
              onClick={onAskVasco}
            />
          </div>
          <CommunicationHub
            lead={lead}
            communications={communications}
          />

          {/* Outreach Activity Summary (fallback when no communication data) */}
          {(!communications || communications.length === 0) && (
            <OutreachActivitySummary lead={lead} />
          )}
        </>
      )}
    </>
  );
}

export { Avatar, ScoreRing, ChannelIndicator, getRecommendedAction };
