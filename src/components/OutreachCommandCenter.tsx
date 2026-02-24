"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Mail, Clock, CheckCircle2, AlertTriangle, Search, Phone,
  MessageSquare, ArrowRight, Edit3, Check, X, Linkedin,
  CalendarClock, RotateCcw, ChevronRight, ExternalLink,
  Copy, Sparkles, RefreshCw, ChevronDown,
} from "lucide-react";
import type { Lead } from "@/lib/types";
import { trackEventClient } from "@/lib/tracking";

interface Props {
  leads: Lead[];
  onNavigateToLead?: (leadId: string) => void;
  onUpdateLead?: (leadId: string, updates: Partial<Lead>) => void;
  onGenerateMessage?: (lead: Lead, type: string) => void;
  onCopyMessage?: (text: string) => void;
  generatingForLeadId?: string | null;
  defaultTab?: "today" | "leads" | "followups";
  hideTabNav?: boolean;
}

// ── Helpers ──

const COLORS = [
  ["#e8f4fd", "#0077b5"], ["#fef2f2", "#dc2626"], ["#ecfdf5", "#059669"],
  ["#f5f3ff", "#7c3aed"], ["#fffbeb", "#d97706"], ["#eff6ff", "#2563eb"],
];

function Av({ name, size = 32 }: { name: string; size?: number }) {
  const ini = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const i = name.charCodeAt(0) % COLORS.length;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: COLORS[i][0], color: COLORS[i][1],
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.36, fontWeight: 700, flexShrink: 0,
    }}>{ini}</div>
  );
}

const STATUS_CFG = {
  positive: { label: "Positive", bg: "#ecfdf5", color: "#059669", dot: "#10b981" },
  neutral: { label: "Neutral", bg: "#fffbeb", color: "#d97706", dot: "#f59e0b" },
  negative: { label: "Negative", bg: "#fef2f2", color: "#dc2626", dot: "#ef4444" },
  not_contacted: { label: "No Reply", bg: "#f1f5f9", color: "#64748b", dot: "#94a3b8" },
};

function StatusPill({ s }: { s: Lead["contactStatus"] }) {
  const c = STATUS_CFG[s];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px",
      borderRadius: 99, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot }} />
      {c.label}
    </span>
  );
}

function MethodIcon({ m }: { m?: string }) {
  if (m === "call") return <Phone className="w-3 h-3" style={{ color: "#059669" }} />;
  if (m === "email") return <Mail className="w-3 h-3" style={{ color: "#2563eb" }} />;
  if (m === "linkedin") return <Linkedin className="w-3 h-3" style={{ color: "#0077b5" }} />;
  return null;
}

function daysUntil(d?: string): number {
  if (!d) return 999;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const t = new Date(d); t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - now.getTime()) / 86400000);
}

function daysSince(d?: string): number {
  if (!d) return 999;
  return -daysUntil(d);
}

function urgTag(days: number) {
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, color: "#dc2626", bg: "#fef2f2" };
  if (days === 0) return { text: "Today", color: "#ea580c", bg: "#fff7ed" };
  if (days <= 3) return { text: `In ${days}d`, color: "#2563eb", bg: "#eff6ff" };
  return { text: `In ${days}d`, color: "#94a3b8", bg: "#f8fafc" };
}

// ── Component ──

export default function OutreachCommandCenter({ leads, onNavigateToLead, onUpdateLead, onGenerateMessage, onCopyMessage, generatingForLeadId, defaultTab, hideTabNav }: Props) {
  const [tab, setTab] = useState<"today" | "leads" | "followups">(defaultTab || "today");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "positive" | "neutral" | "negative" | "not_contacted">("all");
  const [done, setDone] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ id: string; field: "notes" | "nextStep" } | null>(null);
  const [editVal, setEditVal] = useState("");
  const [snoozeOpen, setSnoozeOpen] = useState<string | null>(null); // which lead's snooze menu is open
  const [expandedDraft, setExpandedDraft] = useState<string | null>(null);

  // Sync tab to parent-controlled defaultTab
  useEffect(() => {
    if (defaultTab) setTab(defaultTab);
  }, [defaultTab]);

  // ── Search helper (inline, no function reference issues) ──
  const q = search.toLowerCase();

  // ── Counts ──
  const counts = useMemo(() => ({
    overdue: leads.filter(l => daysUntil(l.nextStepDate) < 0 && !done.has(l.id)).length,
    today: leads.filter(l => daysUntil(l.nextStepDate) === 0 && !done.has(l.id)).length,
    noReply: leads.filter(l => (l.emailStatus === "sent" || l.emailStatus === "opened") && l.emailsSentCount && l.emailsSentCount > 0).length,
    positive: leads.filter(l => l.contactStatus === "positive").length,
    meetings: leads.filter(l => l.meetingScheduled).length,
  }), [leads, done]);

  // ── Today tab: actions sorted by urgency ──
  const todayLeads = useMemo(() => {
    return leads
      .filter(l => !done.has(l.id))
      .filter(l => {
        if (!search) return true;
        return `${l.firstName} ${l.lastName}`.toLowerCase().includes(q) || l.company.toLowerCase().includes(q);
      })
      .filter(l => statusFilter === "all" || l.contactStatus === statusFilter)
      .sort((a, b) => daysUntil(a.nextStepDate) - daysUntil(b.nextStepDate));
  }, [leads, done, search, q, statusFilter]);

  // ── Follow-ups grouped by timeframe ──
  const followupGroups = useMemo(() => {
    const active = leads.filter(l => !done.has(l.id) && !l.disqualifyReason);
    const groups = [
      { label: "Overdue", color: "#dc2626", leads: [] as Lead[] },
      { label: "Today", color: "#ea580c", leads: [] as Lead[] },
      { label: "This Week", color: "#2563eb", leads: [] as Lead[] },
      { label: "Next Week", color: "#7c3aed", leads: [] as Lead[] },
      { label: "Later", color: "#94a3b8", leads: [] as Lead[] },
    ];
    active.forEach(l => {
      const d = daysUntil(l.nextStepDate);
      if (d < 0) groups[0].leads.push(l);
      else if (d === 0) groups[1].leads.push(l);
      else if (d <= 7) groups[2].leads.push(l);
      else if (d <= 14) groups[3].leads.push(l);
      else groups[4].leads.push(l);
    });
    return groups;
  }, [leads, done]);

  // ── Inline edit ──
  const startEdit = (id: string, field: "notes" | "nextStep", val: string) => {
    setEditing({ id, field });
    setEditVal(val);
  };
  const saveEdit = () => {
    if (editing && onUpdateLead) onUpdateLead(editing.id, { [editing.field]: editVal });
    setEditing(null); setEditVal("");
  };
  const cancelEdit = () => { setEditing(null); setEditVal(""); };

  // ── Snooze — push due date forward and persist via callback ──
  const handleSnooze = (leadId: string, days: number) => {
    const now = new Date();
    now.setDate(now.getDate() + days);
    const newDate = now.toISOString().split("T")[0];
    if (onUpdateLead) {
      onUpdateLead(leadId, { nextStepDate: newDate });
    }
    setSnoozeOpen(null);
    trackEventClient({ eventCategory: "signal", eventAction: "signal_snoozed", leadId, metadata: { snoozeDays: days } });
  };

  // ── Render ──
  return (
    <div>
      {/* Top stats bar — always visible */}
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <div className="flex items-center gap-2">
          {counts.overdue > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#fef2f2", color: "#dc2626" }}>
              <AlertTriangle className="w-3.5 h-3.5" /> {counts.overdue} overdue
            </span>
          )}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#fff7ed", color: "#ea580c" }}>
            <Clock className="w-3.5 h-3.5" /> {counts.today} today
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 500, background: "#eff6ff", color: "#2563eb" }}>
            <Mail className="w-3.5 h-3.5" /> {counts.noReply} no reply
          </span>
          {counts.meetings > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 500, background: "#ecfdf5", color: "#059669" }}>
              <CalendarClock className="w-3.5 h-3.5" /> {counts.meetings} meeting{counts.meetings > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5" style={{ background: "var(--balboa-bg-alt)", borderRadius: 8, padding: "4px 10px" }}>
          <Search className="w-3.5 h-3.5" style={{ color: "var(--balboa-text-muted)" }} />
          <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ background: "transparent", border: "none", outline: "none", fontSize: 12, color: "var(--balboa-text-primary)", width: 150 }}
          />
        </div>
      </div>

      {/* Tabs — hidden when parent controls which view to show */}
      {!hideTabNav && (
        <div className="tab-nav" style={{ paddingLeft: 0, marginBottom: 20 }}>
          {([
            { id: "today" as const, label: "Today", count: counts.overdue + counts.today },
            { id: "leads" as const, label: "All Leads", count: leads.length },
            { id: "followups" as const, label: "Follow-ups", count: followupGroups.reduce((s, g) => s + g.leads.length, 0) },
          ]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`tab-btn ${tab === t.id ? "active" : ""}`}>
              {t.label}
              <span style={{
                marginLeft: 6, padding: "0 6px", borderRadius: 99, fontSize: 10, fontWeight: 700,
                background: tab === t.id ? "var(--balboa-navy)" : "var(--balboa-bg-alt)",
                color: tab === t.id ? "white" : "var(--balboa-text-muted)",
              }}>{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* ════════════ TODAY ════════════ */}
      {tab === "today" && (
        <div>
          {/* Quick status filters */}
          <div className="flex items-center gap-1 mb-4">
            {(["all", "positive", "neutral", "negative", "not_contacted"] as const).map(f => (
              <button key={f} onClick={() => setStatusFilter(f)} style={{
                padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500,
                border: "none", cursor: "pointer",
                background: statusFilter === f ? "var(--balboa-navy)" : "transparent",
                color: statusFilter === f ? "white" : "var(--balboa-text-muted)",
              }}>
                {f === "all" ? `All (${leads.length})` : f === "not_contacted" ? `No Reply (${leads.filter(l => l.contactStatus === "not_contacted").length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${leads.filter(l => l.contactStatus === f).length})`}
              </button>
            ))}
          </div>

          {/* Done banner */}
          {todayLeads.length === 0 && (
            <div className="card p-10 text-center">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3" style={{ color: "#059669" }} />
              <p className="font-semibold" style={{ color: "var(--balboa-navy)" }}>All caught up!</p>
              <p className="text-xs mt-1" style={{ color: "var(--balboa-text-muted)" }}>No pending actions. Check the Follow-ups tab for what&apos;s coming.</p>
            </div>
          )}

          {/* Action cards */}
          <div className="space-y-2">
            {todayLeads.map(lead => {
              const d = daysUntil(lead.nextStepDate);
              const u = urgTag(d);
              return (
                <div key={lead.id} className="card fade-in" style={{
                  padding: "14px 16px",
                  borderLeft: `4px solid ${u.color}`,
                }}>
                  {/* Row 1: Who + When */}
                  <div className="flex items-center gap-3">
                    <Av name={`${lead.firstName} ${lead.lastName}`} size={38} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm" style={{
                          color: "var(--balboa-navy)", cursor: onNavigateToLead ? "pointer" : undefined,
                          textDecoration: onNavigateToLead ? "underline" : undefined,
                          textDecorationStyle: "dotted" as const, textUnderlineOffset: "3px",
                        }} onClick={() => onNavigateToLead?.(lead.id)}>
                          {lead.firstName} {lead.lastName}
                        </span>
                        <span className="text-xs" style={{ color: "var(--balboa-text-muted)" }}>{lead.company} · {lead.position}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <StatusPill s={lead.contactStatus} />
                        <MethodIcon m={lead.lastOutreachMethod} />
                        {!lead.channels?.email && lead.channels?.linkedin && (
                          <span className="li-stage-pill" style={{ background: "#e8f4fd", color: "#0077b5", fontSize: 10, padding: "1px 6px" }}>
                            <Linkedin className="w-2.5 h-2.5" /> LI only
                          </span>
                        )}
                        {lead.outreachSource && (
                          <span className="text-[10px]" style={{ color: "var(--balboa-text-light)" }}>{lead.outreachSource}</span>
                        )}
                      </div>
                    </div>
                    <span style={{
                      padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                      background: u.bg, color: u.color, whiteSpace: "nowrap",
                    }}>{u.text}</span>
                  </div>

                  {/* Row 2: Next step */}
                  <div className="mt-3 ml-[50px]" style={{
                    padding: "8px 12px", borderRadius: 8,
                    background: "var(--balboa-bg-alt)",
                  }}>
                    <div className="flex items-center gap-2 mb-1">
                      <ArrowRight className="w-3.5 h-3.5" style={{ color: u.color }} />
                      <span className="text-xs font-semibold" style={{ color: "var(--balboa-text-secondary)" }}>
                        {lead.nextStep || "No next step — click to add"}
                      </span>
                    </div>
                    {lead.notes && (
                      <p className="text-[11px] mt-1" style={{ color: "var(--balboa-text-muted)", fontStyle: "italic" }}>
                        {lead.notes.length > 150 ? lead.notes.slice(0, 150) + "..." : lead.notes}
                      </p>
                    )}
                  </div>

                  {/* Row 2.5: Inline Draft Message */}
                  {(() => {
                    const draft = lead.draftMessages?.find(dm => dm.status === "draft");
                    const isDraftExpanded = expandedDraft === lead.id;
                    const isLinkedInOnly = !lead.channels?.email && lead.channels?.linkedin;
                    const msgType = isLinkedInOnly ? "connection_followup" : "email_initial";
                    const accentColor = isLinkedInOnly ? "#0077b5" : "#d97706";
                    const accentBg = isLinkedInOnly ? "#e8f4fd" : "#fffbeb";

                    return (
                      <div className="mt-2 ml-[50px]">
                        {draft ? (
                          <div
                            className="li-draft-preview"
                            style={{ background: accentBg, cursor: "pointer" }}
                            onClick={() => setExpandedDraft(isDraftExpanded ? null : lead.id)}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <MessageSquare className="w-3 h-3" style={{ color: accentColor, flexShrink: 0 }} />
                              <span style={{ fontSize: 10, fontWeight: 600, color: accentColor }}>Draft ready</span>
                              <span style={{
                                fontSize: 11, color: "var(--balboa-text-secondary)", fontWeight: 400, flex: 1,
                                minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
                                whiteSpace: isDraftExpanded ? "pre-wrap" : "nowrap",
                              }}>
                                {isDraftExpanded ? draft.body : (draft.body.length > 80 ? draft.body.slice(0, 80) + "..." : draft.body)}
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
                            onClick={() => onGenerateMessage?.(lead, msgType)}
                            className="li-action-btn"
                            style={{ fontSize: 10, padding: "3px 10px", background: accentBg, color: accentColor, borderColor: accentBg }}
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
                    );
                  })()}

                  {/* Row 3: Quick actions */}
                  <div className="flex items-center gap-2 mt-2 ml-[50px]">
                    <button onClick={() => { setDone(prev => new Set(prev).add(lead.id)); trackEventClient({ eventCategory: "signal", eventAction: "signal_action_completed", leadId: lead.id }); }}
                      className="btn-ghost" style={{ padding: "3px 10px", fontSize: 11 }}>
                      <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "#059669" }} /> Done
                    </button>
                    <div style={{ position: "relative" }}>
                      <button onClick={() => setSnoozeOpen(snoozeOpen === lead.id ? null : lead.id)}
                        className="btn-ghost" style={{ padding: "3px 10px", fontSize: 11 }}>
                        <RotateCcw className="w-3.5 h-3.5" /> Snooze
                      </button>
                      {snoozeOpen === lead.id && (
                        <div style={{
                          position: "absolute", top: "100%", left: 0, marginTop: 4,
                          background: "white", borderRadius: 8, padding: 4,
                          boxShadow: "0 4px 16px rgba(0,0,0,0.12)", border: "1px solid var(--balboa-border-light)",
                          zIndex: 50, display: "flex", flexDirection: "column", gap: 2, minWidth: 100,
                        }}>
                          {[{ label: "Tomorrow", d: 1 }, { label: "3 days", d: 3 }, { label: "1 week", d: 7 }, { label: "2 weeks", d: 14 }].map(opt => (
                            <button key={opt.d} onClick={() => handleSnooze(lead.id, opt.d)}
                              style={{
                                padding: "5px 10px", border: "none", background: "transparent",
                                fontSize: 11, fontWeight: 500, cursor: "pointer", borderRadius: 4,
                                textAlign: "left", color: "var(--balboa-text-secondary)",
                              }}
                              onMouseEnter={e => { (e.target as HTMLElement).style.background = "var(--balboa-bg-alt)"; }}
                              onMouseLeave={e => { (e.target as HTMLElement).style.background = "transparent"; }}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {onNavigateToLead && (
                      <button onClick={() => onNavigateToLead(lead.id)}
                        className="btn-ghost" style={{ padding: "3px 10px", fontSize: 11, marginLeft: "auto" }}>
                        View lead <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Context: last touchpoints */}
                  {lead.touchpointTimeline.length > 0 && (
                    <div className="mt-2 ml-[50px] flex items-center gap-3">
                      {lead.touchpointTimeline.slice(-3).reverse().map(tp => (
                        <span key={tp.id} className="text-[10px] flex items-center gap-1" style={{ color: "var(--balboa-text-light)" }}>
                          {tp.channel === "email" && <Mail className="w-2.5 h-2.5" />}
                          {tp.channel === "linkedin" && <Linkedin className="w-2.5 h-2.5" />}
                          {tp.channel === "call" && <Phone className="w-2.5 h-2.5" />}
                          {tp.type.replace(/_/g, " ").replace("email ", "")} · {daysSince(tp.date)}d ago
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ════════════ ALL LEADS ════════════ */}
      {tab === "leads" && (
        <div>
          <div className="flex items-center gap-1 mb-3">
            {(["all", "positive", "neutral", "negative", "not_contacted"] as const).map(f => (
              <button key={f} onClick={() => setStatusFilter(f)} style={{
                padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500,
                border: "none", cursor: "pointer",
                background: statusFilter === f ? "var(--balboa-navy)" : "transparent",
                color: statusFilter === f ? "white" : "var(--balboa-text-muted)",
              }}>
                {f === "all" ? "All" : f === "not_contacted" ? "No Reply" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <div className="card" style={{ overflow: "hidden" }}>
            <div className="overflow-x-auto">
              <table className="data-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Company</th>
                    <th className="text-center">Status</th>
                    <th>Last Touch</th>
                    <th>Email</th>
                    <th>Next Step</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {leads
                    .filter(l => {
                      if (!search) return true;
                      return `${l.firstName} ${l.lastName}`.toLowerCase().includes(q) || l.company.toLowerCase().includes(q);
                    })
                    .filter(l => statusFilter === "all" || l.contactStatus === statusFilter)
                    .map(lead => (
                    <tr key={lead.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <Av name={`${lead.firstName} ${lead.lastName}`} size={26} />
                          <div>
                            <span className="font-medium text-xs block" style={{
                              color: "var(--balboa-navy)", cursor: onNavigateToLead ? "pointer" : undefined,
                            }} onClick={() => onNavigateToLead?.(lead.id)}>
                              {lead.firstName} {lead.lastName}
                            </span>
                            <span className="text-[10px]" style={{ color: "var(--balboa-text-light)" }}>{lead.position}</span>
                          </div>
                        </div>
                      </td>
                      <td className="text-xs" style={{ color: "var(--balboa-text-muted)" }}>{lead.company}</td>
                      <td className="text-center"><StatusPill s={lead.contactStatus} /></td>
                      <td className="text-xs" style={{ color: "var(--balboa-text-muted)" }}>
                        <div className="flex items-center gap-1">
                          <MethodIcon m={lead.lastOutreachMethod} />
                          <span>{lead.lastActionDate ? `${daysSince(lead.lastActionDate)}d ago` : "—"}</span>
                        </div>
                      </td>
                      <td className="text-center">
                        {lead.emailsSentCount && lead.emailsSentCount > 0 ? (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px",
                            borderRadius: 99, fontSize: 10, fontWeight: 600,
                            background: lead.emailStatus === "replied" ? "#ecfdf5" : lead.emailStatus === "opened" ? "#fffbeb" : lead.emailStatus === "sent" ? "#eff6ff" : "#f1f5f9",
                            color: lead.emailStatus === "replied" ? "#059669" : lead.emailStatus === "opened" ? "#d97706" : lead.emailStatus === "sent" ? "#2563eb" : "#64748b",
                          }}>
                            {lead.emailsSentCount} sent · {lead.emailStatus === "not_sent" ? "—" : lead.emailStatus}
                          </span>
                        ) : (
                          <span className="text-[10px]" style={{ color: "var(--balboa-text-light)" }}>—</span>
                        )}
                      </td>
                      {/* Next Step — editable */}
                      <td style={{ minWidth: 160 }}>
                        {editing?.id === lead.id && editing.field === "nextStep" ? (
                          <div className="flex items-center gap-1">
                            <input type="text" value={editVal} onChange={e => setEditVal(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                              autoFocus style={{ fontSize: 11, padding: "2px 6px", border: "1px solid var(--balboa-blue)", borderRadius: 4, width: "100%", outline: "none" }} />
                            <button onClick={saveEdit} style={{ border: "none", background: "none", cursor: "pointer" }}>
                              <Check className="w-3 h-3" style={{ color: "#059669" }} />
                            </button>
                            <button onClick={cancelEdit} style={{ border: "none", background: "none", cursor: "pointer" }}>
                              <X className="w-3 h-3" style={{ color: "#dc2626" }} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1" style={{ cursor: "pointer" }}
                            onClick={() => startEdit(lead.id, "nextStep", lead.nextStep || "")}>
                            <span className="text-xs" style={{ color: lead.nextStep ? "var(--balboa-text-secondary)" : "var(--balboa-text-light)" }}>
                              {lead.nextStep ? (lead.nextStep.length > 40 ? lead.nextStep.slice(0, 40) + "..." : lead.nextStep) : "Add..."}
                            </span>
                            <Edit3 className="w-2.5 h-2.5 flex-shrink-0" style={{ color: "var(--balboa-text-light)", opacity: 0.4 }} />
                          </div>
                        )}
                      </td>
                      {/* Notes — editable */}
                      <td style={{ minWidth: 140 }}>
                        {editing?.id === lead.id && editing.field === "notes" ? (
                          <div className="flex items-center gap-1">
                            <input type="text" value={editVal} onChange={e => setEditVal(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                              autoFocus style={{ fontSize: 11, padding: "2px 6px", border: "1px solid var(--balboa-blue)", borderRadius: 4, width: "100%", outline: "none" }} />
                            <button onClick={saveEdit} style={{ border: "none", background: "none", cursor: "pointer" }}>
                              <Check className="w-3 h-3" style={{ color: "#059669" }} />
                            </button>
                            <button onClick={cancelEdit} style={{ border: "none", background: "none", cursor: "pointer" }}>
                              <X className="w-3 h-3" style={{ color: "#dc2626" }} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1" style={{ cursor: "pointer" }}
                            onClick={() => startEdit(lead.id, "notes", lead.notes || "")}>
                            <span className="text-xs" style={{
                              color: lead.notes ? "var(--balboa-text-muted)" : "var(--balboa-text-light)",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150, display: "block",
                            }}>
                              {lead.notes || "Add..."}
                            </span>
                            <Edit3 className="w-2.5 h-2.5 flex-shrink-0" style={{ color: "var(--balboa-text-light)", opacity: 0.4 }} />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ FOLLOW-UPS ════════════ */}
      {tab === "followups" && (
        <div className="space-y-5">
          {followupGroups.map(group => {
            if (group.leads.length === 0) return null;
            return (
              <div key={group.label}>
                <div className="flex items-center gap-2 mb-2">
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%", background: group.color,
                  }} />
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: group.color }}>
                    {group.label}
                  </h3>
                  <span style={{ fontSize: 11, color: "var(--balboa-text-muted)" }}>
                    ({group.leads.length})
                  </span>
                </div>
                <div className="space-y-1.5">
                  {group.leads
                    .sort((a, b) => daysUntil(a.nextStepDate) - daysUntil(b.nextStepDate))
                    .map(lead => {
                    const d = daysUntil(lead.nextStepDate);
                    return (
                      <div key={lead.id} className="card" style={{
                        padding: "10px 14px",
                        borderLeft: `3px solid ${group.color}`,
                        display: "flex", alignItems: "center", gap: 12,
                      }}>
                        <Av name={`${lead.firstName} ${lead.lastName}`} size={30} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs" style={{
                              color: "var(--balboa-navy)", cursor: onNavigateToLead ? "pointer" : undefined,
                            }} onClick={() => onNavigateToLead?.(lead.id)}>
                              {lead.firstName} {lead.lastName}
                            </span>
                            <span className="text-[11px]" style={{ color: "var(--balboa-text-muted)" }}>{lead.company}</span>
                            <StatusPill s={lead.contactStatus} />
                            {!lead.channels?.email && lead.channels?.linkedin && (
                              <span className="li-stage-pill" style={{ background: "#e8f4fd", color: "#0077b5", fontSize: 10, padding: "1px 6px" }}>
                                <Linkedin className="w-2.5 h-2.5" /> LI only
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <MethodIcon m={lead.lastOutreachMethod} />
                            <span className="text-[11px]" style={{ color: "var(--balboa-text-secondary)" }}>
                              {lead.nextStep || "No next step set"}
                            </span>
                          </div>
                        </div>
                        {/* Inline draft for follow-up cards */}
                        {(() => {
                          const fDraft = lead.draftMessages?.find(dm => dm.status === "draft");
                          const fExpanded = expandedDraft === `fu-${lead.id}`;
                          const fIsLI = !lead.channels?.email && lead.channels?.linkedin;
                          const fColor = fIsLI ? "#0077b5" : "#d97706";
                          const fBg = fIsLI ? "#e8f4fd" : "#fffbeb";
                          if (fDraft) {
                            return (
                              <div
                                style={{ flex: "0 0 auto", maxWidth: 220, cursor: "pointer", padding: "4px 8px", borderRadius: 6, background: fBg }}
                                onClick={(e) => { e.stopPropagation(); setExpandedDraft(fExpanded ? null : `fu-${lead.id}`); }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <MessageSquare className="w-2.5 h-2.5" style={{ color: fColor, flexShrink: 0 }} />
                                  <span style={{ fontSize: 10, color: fColor, fontWeight: 600 }}>Draft</span>
                                  <span style={{
                                    fontSize: 10, color: "var(--balboa-text-muted)", flex: 1, overflow: "hidden",
                                    textOverflow: "ellipsis", whiteSpace: fExpanded ? "pre-wrap" : "nowrap",
                                  }}>
                                    {fExpanded ? fDraft.body : (fDraft.body.length > 50 ? fDraft.body.slice(0, 50) + "..." : fDraft.body)}
                                  </span>
                                  <ChevronDown className="w-2.5 h-2.5" style={{
                                    color: "var(--balboa-text-light)", flexShrink: 0,
                                    transform: fExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease",
                                  }} />
                                </div>
                                {fExpanded && (
                                  <div style={{ marginTop: 6 }} onClick={e => e.stopPropagation()}>
                                    <button onClick={() => onCopyMessage?.(fDraft.body)} className="li-action-btn" style={{ fontSize: 9, padding: "2px 6px" }}>
                                      <Copy className="w-2.5 h-2.5" /> Copy
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return (
                            <button
                              onClick={(e) => { e.stopPropagation(); onGenerateMessage?.(lead, fIsLI ? "connection_followup" : "email_initial"); }}
                              className="li-action-btn"
                              style={{ fontSize: 9, padding: "2px 8px", background: fBg, color: fColor, borderColor: fBg }}
                              disabled={generatingForLeadId === lead.id}
                            >
                              {generatingForLeadId === lead.id ? (
                                <><RefreshCw className="w-2.5 h-2.5 animate-spin" /> ...</>
                              ) : (
                                <><Sparkles className="w-2.5 h-2.5" /> Generate</>
                              )}
                            </button>
                          );
                        })()}

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span style={{
                            fontSize: 11, fontWeight: 600, color: group.color,
                          }}>
                            {d < 0 ? `${Math.abs(d)}d late` : d === 0 ? "Today" : `In ${d}d`}
                          </span>
                          <button onClick={() => { setDone(prev => new Set(prev).add(lead.id)); trackEventClient({ eventCategory: "signal", eventAction: "signal_action_completed", leadId: lead.id }); }}
                            className="btn-ghost" style={{ padding: "2px 6px", fontSize: 10 }}>
                            <CheckCircle2 className="w-3 h-3" style={{ color: "#059669" }} />
                          </button>
                          <div style={{ position: "relative" }}>
                            <button onClick={() => setSnoozeOpen(snoozeOpen === lead.id ? null : lead.id)}
                              className="btn-ghost" style={{ padding: "2px 6px", fontSize: 10 }}>
                              <RotateCcw className="w-3 h-3" />
                            </button>
                            {snoozeOpen === lead.id && (
                              <div style={{
                                position: "absolute", top: "100%", right: 0, marginTop: 4,
                                background: "white", borderRadius: 8, padding: 4,
                                boxShadow: "0 4px 16px rgba(0,0,0,0.12)", border: "1px solid var(--balboa-border-light)",
                                zIndex: 50, display: "flex", flexDirection: "column", gap: 2, minWidth: 90,
                              }}>
                                {[{ label: "1d", d: 1 }, { label: "3d", d: 3 }, { label: "1w", d: 7 }, { label: "2w", d: 14 }].map(opt => (
                                  <button key={opt.d} onClick={() => handleSnooze(lead.id, opt.d)}
                                    style={{
                                      padding: "4px 8px", border: "none", background: "transparent",
                                      fontSize: 10, fontWeight: 500, cursor: "pointer", borderRadius: 4,
                                      textAlign: "left", color: "var(--balboa-text-secondary)",
                                    }}
                                    onMouseEnter={e => { (e.target as HTMLElement).style.background = "var(--balboa-bg-alt)"; }}
                                    onMouseLeave={e => { (e.target as HTMLElement).style.background = "transparent"; }}>
                                    {opt.label}
                                  </button>
                                ))}
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
          {followupGroups.every(g => g.leads.length === 0) && (
            <div className="card p-10 text-center">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3" style={{ color: "#059669" }} />
              <p className="font-semibold" style={{ color: "var(--balboa-navy)" }}>No follow-ups pending</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
