"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Phone, Mail, Linkedin, ChevronDown, ChevronRight, CheckCircle,
  Clock, AlertCircle, MessageSquare, Users, PhoneCall, PhoneOff,
  Send, RefreshCw, Calendar, ArrowRight, Eye, Filter,
  Voicemail, X, ThumbsUp, ThumbsDown, HelpCircle, UserPlus,
} from "lucide-react";
import { PERSONA_OPENERS, STRATEGIC_PRIORITIES, BUSINESS_CHALLENGES, DISCOVERY_QUESTIONS } from "@/lib/rocket-constants";
import type { Lead, PersonaType } from "@/lib/types";

// ─── Types ──────────────────────────────────────────────────────

type ExecutionSubTab = "calls" | "emails" | "replies";

interface CallItem {
  leadId: string;
  leadName: string;
  company: string;
  persona: PersonaType;
  spbc: string;
  callScript: string;
  touchNumber: number;
  status: "pending" | "completed" | "rescheduled" | "no-answer" | "voicemail";
}

interface EmailItem {
  leadId: string;
  leadName: string;
  company: string;
  subject: string;
  sentAt: string;
  status: "sent" | "opened" | "clicked" | "replied" | "bounced";
  openCount: number;
  touchNumber: number;
}

interface ReplyItem {
  leadId: string;
  leadName: string;
  company: string;
  subject: string;
  replyPreview: string;
  receivedAt: string;
  classification: "positive" | "negative" | "question" | "ooo" | "referral" | null;
}

// ─── Props ──────────────────────────────────────────────────────

interface ExecutionCenterProps {
  leads: Lead[];
  onNavigateToLead: (leadId: string) => void;
}

// ─── Component ──────────────────────────────────────────────────

export default function ExecutionCenter({ leads, onNavigateToLead }: ExecutionCenterProps) {
  const [subTab, setSubTab] = useState<ExecutionSubTab>("calls");
  const [calls, setCalls] = useState<CallItem[]>([]);
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [replies, setReplies] = useState<ReplyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedCall, setExpandedCall] = useState<string | null>(null);
  const [expandedReply, setExpandedReply] = useState<string | null>(null);
  const [filterSPBC, setFilterSPBC] = useState<string>("all");

  // ── Load execution data from leads ────────────────────────────

  useEffect(() => {
    if (!leads || leads.length === 0) return;

    // Build call items from leads with active sequences
    const callItems: CallItem[] = [];
    const emailItems: EmailItem[] = [];
    const replyItems: ReplyItem[] = [];

    for (const lead of leads) {
      const spbc = lead.companyIntel?.industry || "";
      const position = lead.position || "";

      // Detect persona from position
      let persona: PersonaType = "vp-procurement";
      if (/supply chain|csco|logistics director/i.test(position)) persona = "vp-supply-chain";
      else if (/cfo|controller|finance/i.test(position)) persona = "cfo";
      else if (/coo|ceo|owner|president/i.test(position)) persona = "coo";
      else if (/import|logistics manager|freight/i.test(position)) persona = "import-manager";

      // Simulate pending calls based on lead status
      if (lead.status === "engaged" || lead.status === "new" || lead.status === "researched") {
        callItems.push({
          leadId: lead.id,
          leadName: `${lead.firstName} ${lead.lastName}`.trim(),
          company: lead.company,
          persona,
          spbc,
          callScript: DISCOVERY_QUESTIONS[Math.floor(Math.random() * DISCOVERY_QUESTIONS.length)]?.question || "",
          touchNumber: lead.status === "engaged" ? 3 : 1,
          status: "pending",
        });
      }

      // Build email items from communications/drafts
      if (lead.status === "engaged") {
        emailItems.push({
          leadId: lead.id,
          leadName: `${lead.firstName} ${lead.lastName}`.trim(),
          company: lead.company,
          subject: `re: ${lead.company} supply chain`,
          sentAt: new Date(Date.now() - Math.random() * 86400000 * 3).toISOString(),
          status: Math.random() > 0.5 ? "opened" : "sent",
          openCount: Math.floor(Math.random() * 4),
          touchNumber: 1,
        });
      }

      // Build reply items from leads in opportunity stage
      if (lead.status === "opportunity") {
        replyItems.push({
          leadId: lead.id,
          leadName: `${lead.firstName} ${lead.lastName}`.trim(),
          company: lead.company,
          subject: `re: ${lead.company}`,
          replyPreview: "Thanks for reaching out. Can we schedule a call next week?",
          receivedAt: new Date(Date.now() - Math.random() * 86400000).toISOString(),
          classification: null,
        });
      }
    }

    setCalls(callItems);
    setEmails(emailItems);
    setReplies(replyItems);
  }, [leads]);

  // ── Call outcome handler ──────────────────────────────────────

  const handleCallOutcome = useCallback((leadId: string, outcome: CallItem["status"]) => {
    setCalls((prev) => prev.map((c) => c.leadId === leadId ? { ...c, status: outcome } : c));
  }, []);

  // ── Reply classification handler ──────────────────────────────

  const handleClassifyReply = useCallback((leadId: string, classification: ReplyItem["classification"]) => {
    setReplies((prev) => prev.map((r) => r.leadId === leadId ? { ...r, classification } : r));
  }, []);

  // ── Filtered items ────────────────────────────────────────────

  const filteredCalls = filterSPBC === "all" ? calls : calls.filter((c) => c.spbc.includes(filterSPBC));
  const pendingCalls = filteredCalls.filter((c) => c.status === "pending");
  const completedCalls = filteredCalls.filter((c) => c.status !== "pending");

  // ── Render ────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Sub-tab bar */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20 }}>
        {[
          { key: "calls" as const, label: "Call Sheet", icon: <Phone size={13} />, badge: pendingCalls.length },
          { key: "emails" as const, label: "Email Tracker", icon: <Mail size={13} />, badge: emails.length },
          { key: "replies" as const, label: "Reply Handler", icon: <MessageSquare size={13} />, badge: replies.filter((r) => !r.classification).length },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            style={{
              padding: "8px 14px", fontSize: 12, fontWeight: subTab === tab.key ? 700 : 500,
              color: subTab === tab.key ? "var(--balboa-navy)" : "#64748b",
              background: subTab === tab.key ? "rgba(30, 42, 94, 0.06)" : "transparent",
              border: "none", borderBottom: subTab === tab.key ? "2px solid var(--balboa-navy)" : "2px solid transparent",
              borderRadius: "8px 8px 0 0", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {tab.icon}
            {tab.label}
            {tab.badge > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, background: subTab === tab.key ? "var(--balboa-navy)" : "#94a3b8",
                color: "white", padding: "1px 6px", borderRadius: 10, minWidth: 18, textAlign: "center",
              }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── CALL SHEET ─────────────────────────────────────────────── */}
      {subTab === "calls" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--balboa-navy)" }}>Today&apos;s Calls</h3>
              <p style={{ fontSize: 12, color: "#64748b" }}>
                {pendingCalls.length} pending, {completedCalls.length} completed
              </p>
            </div>
            <select
              value={filterSPBC}
              onChange={(e) => setFilterSPBC(e.target.value)}
              style={{ padding: "5px 10px", fontSize: 12, borderRadius: 6, border: "1px solid #e2e8f0" }}
            >
              <option value="all">All Segments</option>
              {Object.values(STRATEGIC_PRIORITIES).map((sp) => (
                <option key={sp.id} value={sp.id}>{sp.id}: {sp.label}</option>
              ))}
              {Object.values(BUSINESS_CHALLENGES).map((bc) => (
                <option key={bc.id} value={bc.id}>{bc.id}: {bc.label}</option>
              ))}
            </select>
          </div>

          {pendingCalls.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
              <Phone size={32} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
              <p style={{ fontSize: 14, fontWeight: 600 }}>No pending calls</p>
              <p style={{ fontSize: 12, marginTop: 4 }}>
                Build sequences in the Build tab to populate your call sheet.
              </p>
            </div>
          )}

          {pendingCalls.map((call) => {
            const personaInfo = PERSONA_OPENERS[call.persona];
            const isExpanded = expandedCall === call.leadId;
            return (
              <div key={call.leadId} style={{
                padding: 14, borderRadius: 10, border: "1px solid #e2e8f0",
                background: "white", marginBottom: 8,
              }}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                  onClick={() => setExpandedCall(isExpanded ? null : call.leadId)}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, background: "#fef3c7",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <PhoneCall size={16} style={{ color: "#d97706" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-navy)" }}>
                      {call.leadName}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                      {call.company} · Touch #{call.touchNumber} · {personaInfo?.label || call.persona}
                    </div>
                  </div>
                  {call.spbc && (
                    <span style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
                      background: "#f1f5f9", color: "#64748b",
                    }}>
                      {call.spbc}
                    </span>
                  )}
                  <ChevronDown size={14} style={{ color: "#94a3b8", transform: isExpanded ? "rotate(180deg)" : "none" }} />
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 12, borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
                    {/* Call Script */}
                    <div style={{ padding: 12, background: "#fafbfc", borderRadius: 8, marginBottom: 12 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>Opening Question</p>
                      <p style={{ fontSize: 12, color: "var(--balboa-navy)" }}>{call.callScript}</p>
                    </div>

                    {personaInfo && (
                      <div style={{ padding: 12, background: "#f0f9ff", borderRadius: 8, marginBottom: 12 }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: "#0369a1", marginBottom: 4 }}>Persona Opener</p>
                        <p style={{ fontSize: 12, color: "#0c4a6e" }}>{personaInfo.opener}</p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => handleCallOutcome(call.leadId, "completed")}
                        style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, background: "#dcfce7", color: "#16a34a", border: "none", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                      >
                        <CheckCircle size={12} /> Completed
                      </button>
                      <button
                        onClick={() => handleCallOutcome(call.leadId, "rescheduled")}
                        style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, background: "#fef3c7", color: "#d97706", border: "none", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                      >
                        <Calendar size={12} /> Reschedule
                      </button>
                      <button
                        onClick={() => handleCallOutcome(call.leadId, "no-answer")}
                        style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, background: "#fef2f2", color: "#dc2626", border: "none", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                      >
                        <PhoneOff size={12} /> No Answer
                      </button>
                      <button
                        onClick={() => handleCallOutcome(call.leadId, "voicemail")}
                        style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                      >
                        <Voicemail size={12} /> Left VM
                      </button>
                    </div>

                    <button
                      onClick={() => onNavigateToLead(call.leadId)}
                      style={{
                        marginTop: 10, padding: "5px 10px", fontSize: 11, color: "var(--balboa-blue)",
                        background: "none", border: "none", cursor: "pointer", fontWeight: 600,
                        display: "flex", alignItems: "center", gap: 4,
                      }}
                    >
                      View Lead Profile <ArrowRight size={10} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── EMAIL TRACKER ──────────────────────────────────────────── */}
      {subTab === "emails" && (
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 4 }}>
            Email Tracker
          </h3>
          <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
            Track sent emails across active sequences.
          </p>

          {emails.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
              <Mail size={32} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
              <p style={{ fontSize: 14, fontWeight: 600 }}>No emails tracked yet</p>
              <p style={{ fontSize: 12, marginTop: 4 }}>
                Emails will appear here once sequences are active.
              </p>
            </div>
          ) : (
            <div>
              {/* Stats row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                {[
                  { label: "Sent", count: emails.length, color: "#3b82f6" },
                  { label: "Opened", count: emails.filter((e) => e.status === "opened" || e.status === "clicked").length, color: "#16a34a" },
                  { label: "Replied", count: emails.filter((e) => e.status === "replied").length, color: "#8b5cf6" },
                  { label: "Bounced", count: emails.filter((e) => e.status === "bounced").length, color: "#dc2626" },
                ].map((s) => (
                  <div key={s.label} style={{
                    padding: 12, borderRadius: 8, background: "#f8fafc", textAlign: "center",
                    border: "1px solid #e2e8f0",
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.count}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Email list */}
              {emails.map((email) => (
                <div key={`${email.leadId}-${email.touchNumber}`} style={{
                  padding: "10px 14px", borderBottom: "1px solid #f1f5f9",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: 4,
                    background: email.status === "opened" || email.status === "clicked" ? "#16a34a" :
                      email.status === "replied" ? "#8b5cf6" :
                      email.status === "bounced" ? "#dc2626" : "#94a3b8",
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-navy)" }}>
                      {email.leadName} — {email.company}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                      {email.subject} · Touch #{email.touchNumber}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
                      background: email.status === "opened" ? "#dcfce7" :
                        email.status === "replied" ? "#ede9fe" :
                        email.status === "bounced" ? "#fef2f2" : "#f1f5f9",
                      color: email.status === "opened" ? "#16a34a" :
                        email.status === "replied" ? "#7c3aed" :
                        email.status === "bounced" ? "#dc2626" : "#64748b",
                    }}>
                      {email.status}{email.openCount > 0 ? ` (${email.openCount}x)` : ""}
                    </span>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                      {new Date(email.sentAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── REPLY HANDLER ──────────────────────────────────────────── */}
      {subTab === "replies" && (
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 4 }}>
            Reply Handler
          </h3>
          <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
            Classify and act on incoming replies.
          </p>

          {replies.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
              <MessageSquare size={32} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
              <p style={{ fontSize: 14, fontWeight: 600 }}>No replies yet</p>
              <p style={{ fontSize: 12, marginTop: 4 }}>
                Replies will appear here as prospects respond to your sequences.
              </p>
            </div>
          ) : (
            <div>
              {replies.map((reply) => {
                const isExpanded = expandedReply === reply.leadId;
                return (
                  <div key={reply.leadId} style={{
                    padding: 14, borderRadius: 10, border: "1px solid #e2e8f0",
                    background: reply.classification ? "#f8fafc" : "white",
                    marginBottom: 8,
                  }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                      onClick={() => setExpandedReply(isExpanded ? null : reply.leadId)}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: 8,
                        background: reply.classification ? "#dcfce7" : "#dbeafe",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {reply.classification ? (
                          <CheckCircle size={16} style={{ color: "#16a34a" }} />
                        ) : (
                          <MessageSquare size={16} style={{ color: "#3b82f6" }} />
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-navy)" }}>
                          {reply.leadName} — {reply.company}
                        </div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>
                          {reply.replyPreview.substring(0, 80)}...
                        </div>
                      </div>
                      {reply.classification && (
                        <span style={{
                          fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
                          background: reply.classification === "positive" ? "#dcfce7" :
                            reply.classification === "negative" ? "#fef2f2" :
                            reply.classification === "question" ? "#dbeafe" : "#fef3c7",
                          color: reply.classification === "positive" ? "#16a34a" :
                            reply.classification === "negative" ? "#dc2626" :
                            reply.classification === "question" ? "#2563eb" : "#d97706",
                        }}>
                          {reply.classification}
                        </span>
                      )}
                      <ChevronDown size={14} style={{ color: "#94a3b8", transform: isExpanded ? "rotate(180deg)" : "none" }} />
                    </div>

                    {isExpanded && !reply.classification && (
                      <div style={{ marginTop: 12, borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
                        <p style={{ fontSize: 12, color: "var(--balboa-navy)", marginBottom: 10 }}>
                          {reply.replyPreview}
                        </p>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => handleClassifyReply(reply.leadId, "positive")}
                            style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, background: "#dcfce7", color: "#16a34a", border: "none", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                          >
                            <ThumbsUp size={11} /> Positive
                          </button>
                          <button
                            onClick={() => handleClassifyReply(reply.leadId, "negative")}
                            style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, background: "#fef2f2", color: "#dc2626", border: "none", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                          >
                            <ThumbsDown size={11} /> Negative
                          </button>
                          <button
                            onClick={() => handleClassifyReply(reply.leadId, "question")}
                            style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, background: "#dbeafe", color: "#2563eb", border: "none", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                          >
                            <HelpCircle size={11} /> Question
                          </button>
                          <button
                            onClick={() => handleClassifyReply(reply.leadId, "ooo")}
                            style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, background: "#fef3c7", color: "#d97706", border: "none", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                          >
                            <Clock size={11} /> OOO
                          </button>
                          <button
                            onClick={() => handleClassifyReply(reply.leadId, "referral")}
                            style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, background: "#e0e7ff", color: "#4f46e5", border: "none", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                          >
                            <UserPlus size={11} /> Referral
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
