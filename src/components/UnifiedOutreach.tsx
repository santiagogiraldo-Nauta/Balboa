"use client";

import { useState } from "react";
import {
  Send, Copy, ChevronRight, RefreshCw, Linkedin, AtSign,
  MessageSquare, Sparkles, CheckCircle, User, Filter,
  Mail, Zap, Clock, ArrowRight,
} from "lucide-react";
import type { Lead, SupportedLanguage } from "@/lib/types";
import { trackEventClient } from "@/lib/tracking";

interface Props {
  leads: Lead[];
  onGenerateMessage: (lead: Lead, type: string) => Promise<void>;
  onCopyMessage: (text: string) => void;
  onNavigateToLead: (leadId: string) => void;
  generatingForLeadId: string | null;
  contentLanguage: SupportedLanguage;
}

export default function UnifiedOutreach({
  leads, onGenerateMessage, onCopyMessage, onNavigateToLead, generatingForLeadId, contentLanguage,
}: Props) {
  const [channelFilter, setChannelFilter] = useState<"all" | "email" | "linkedin">("all");
  const [tierFilter, setTierFilter] = useState<"all" | "hot" | "warm" | "cold">("all");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [composing, setComposing] = useState(false);
  const [composeMessage, setComposeMessage] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeChannel, setComposeChannel] = useState<"email" | "linkedin">("linkedin");
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent">("idle");

  // Filter leads that have actionable items
  const actionableLeads = leads.filter(l => {
    if (l.disqualifyReason) return false;
    if (tierFilter !== "all" && l.icpScore?.tier !== tierFilter) return false;
    if (channelFilter === "email" && !l.channels?.email) return false;
    if (channelFilter === "linkedin" && !l.channels?.linkedin) return false;
    return true;
  }).sort((a, b) => {
    // Priority: hot first, then by draft count
    const tierOrder = { hot: 0, warm: 1, cold: 2 };
    const aTier = tierOrder[a.icpScore?.tier as keyof typeof tierOrder] ?? 3;
    const bTier = tierOrder[b.icpScore?.tier as keyof typeof tierOrder] ?? 3;
    if (aTier !== bTier) return aTier - bTier;
    return b.draftMessages.length - a.draftMessages.length;
  });

  const readyDrafts = leads.reduce((acc, l) => acc + l.draftMessages.filter(d => d.status === "draft").length, 0);
  const sentMessages = leads.reduce((acc, l) => acc + l.draftMessages.filter(d => d.status === "sent" || d.status === "approved").length, 0);

  const handleSendMessage = async () => {
    if (!selectedLead || !composeMessage.trim()) return;
    setSendStatus("sending");
    try {
      await fetch("/api/send-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: selectedLead.id,
          channel: composeChannel,
          subject: composeSubject,
          message: composeMessage,
        }),
      });
      setSendStatus("sent");
      trackEventClient({
        eventCategory: "outreach",
        eventAction: "message_sent",
        leadId: selectedLead.id,
        channel: composeChannel,
        leadTier: selectedLead.icpScore?.tier,
      });
      setTimeout(() => {
        setSendStatus("idle");
        setComposing(false);
        setComposeMessage("");
        setComposeSubject("");
      }, 1500);
    } catch {
      setSendStatus("idle");
    }
  };

  const handleGenerateAndCompose = async (lead: Lead, type: string) => {
    setSelectedLead(lead);
    setComposing(true);
    setComposeChannel(lead.channels?.email ? "email" : "linkedin");
    await onGenerateMessage(lead, type);
    // After generation, the lead's draftMessages will update
    const latestDraft = lead.draftMessages[lead.draftMessages.length - 1];
    if (latestDraft) {
      setComposeMessage(latestDraft.body);
      setComposeSubject(latestDraft.subject || "");
    }
  };

  return (
    <div>
      {/* Stats bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
        <div className="metric-card">
          <div className="metric-value" style={{ color: "var(--balboa-blue)" }}>{actionableLeads.length}</div>
          <div className="metric-label">Actionable Leads</div>
        </div>
        <div className="metric-card">
          <div className="metric-value" style={{ color: "var(--balboa-orange)" }}>{readyDrafts}</div>
          <div className="metric-label">Ready to Send</div>
        </div>
        <div className="metric-card">
          <div className="metric-value" style={{ color: "var(--balboa-green)" }}>{sentMessages}</div>
          <div className="metric-label">Messages Sent</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Filter className="w-4 h-4" style={{ color: "var(--balboa-text-muted)" }} />
        <div style={{ display: "flex", gap: 4 }}>
          {(["all", "hot", "warm", "cold"] as const).map(t => (
            <button key={t} onClick={() => setTierFilter(t)}
              className={`badge ${tierFilter === t ? `badge-${t === "all" ? "connected" : t}` : ""}`}
              style={{
                cursor: "pointer", border: "1px solid var(--balboa-border)", padding: "4px 12px",
                background: tierFilter === t ? undefined : "white", color: tierFilter === t ? undefined : "var(--balboa-text-muted)",
              }}>
              {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ height: 20, width: 1, background: "var(--balboa-border)" }} />
        <div style={{ display: "flex", gap: 4 }}>
          {(["all", "linkedin", "email"] as const).map(ch => (
            <button key={ch} onClick={() => setChannelFilter(ch)}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 12px", borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${channelFilter === ch ? (ch === "linkedin" ? "#0077b5" : ch === "email" ? "#d97706" : "var(--balboa-navy)") : "var(--balboa-border)"}`,
                background: channelFilter === ch ? (ch === "linkedin" ? "#e8f4fd" : ch === "email" ? "#fef3e2" : "var(--balboa-bg-alt)") : "white",
                color: channelFilter === ch ? (ch === "linkedin" ? "#0077b5" : ch === "email" ? "#d97706" : "var(--balboa-navy)") : "var(--balboa-text-muted)",
              }}>
              {ch === "linkedin" && <Linkedin className="w-3 h-3" />}
              {ch === "email" && <AtSign className="w-3 h-3" />}
              {ch === "all" ? "All Channels" : ch.charAt(0).toUpperCase() + ch.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Main content area */}
      <div style={{ display: "flex", gap: 20 }}>
        {/* Lead list */}
        <div style={{ flex: selectedLead ? "0 0 45%" : 1, transition: "flex 0.3s ease" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "calc(100vh - 380px)", overflowY: "auto", paddingRight: 4 }}>
            {actionableLeads.map(lead => {
              const isSelected = selectedLead?.id === lead.id;
              const hasDrafts = lead.draftMessages.filter(d => d.status === "draft").length;
              const isGenerating = generatingForLeadId === lead.id;

              return (
                <div key={lead.id}
                  onClick={() => { setSelectedLead(lead); setComposing(false); }}
                  className={`card card-hover fade-in ${lead.icpScore?.tier === "hot" ? "priority-urgent" : lead.icpScore?.tier === "warm" ? "priority-medium" : "priority-low"}`}
                  style={{
                    padding: "14px 16px", cursor: "pointer",
                    borderColor: isSelected ? "var(--balboa-blue)" : undefined,
                    boxShadow: isSelected ? "0 0 0 2px rgba(59, 91, 219, 0.15)" : undefined,
                  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: "50%",
                      background: lead.icpScore?.tier === "hot" ? "#fef2f2" : lead.icpScore?.tier === "warm" ? "#fffbeb" : "#eff6ff",
                      color: lead.icpScore?.tier === "hot" ? "#dc2626" : lead.icpScore?.tier === "warm" ? "#d97706" : "#2563eb",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 700, flexShrink: 0,
                    }}>
                      {lead.firstName[0]}{lead.lastName[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <h4 style={{ fontWeight: 600, fontSize: 13, color: "var(--balboa-navy)" }}>{lead.firstName} {lead.lastName}</h4>
                        <span className={`badge badge-${lead.icpScore?.tier}`}>{lead.icpScore?.tier?.toUpperCase()}</span>
                      </div>
                      <p style={{ fontSize: 11, color: "var(--balboa-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {lead.position} at {lead.company}
                      </p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {lead.channels?.linkedin && (
                          <span style={{ width: 20, height: 20, borderRadius: 4, background: "#e8f4fd", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Linkedin className="w-3 h-3" style={{ color: "#0077b5" }} />
                          </span>
                        )}
                        {lead.channels?.email && (
                          <span style={{ width: 20, height: 20, borderRadius: 4, background: "#fef3e2", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Mail className="w-3 h-3" style={{ color: "#d97706" }} />
                          </span>
                        )}
                      </div>
                      {hasDrafts > 0 && (
                        <span style={{ fontSize: 10, color: "var(--balboa-blue)", fontWeight: 600 }}>
                          {hasDrafts} draft{hasDrafts > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quick action buttons */}
                  <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                    <button onClick={(e) => { e.stopPropagation(); handleGenerateAndCompose(lead, "connection_followup"); }}
                      disabled={isGenerating}
                      className="li-action-btn primary"
                      style={{ flex: 1, justifyContent: "center" }}>
                      {isGenerating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      {isGenerating ? "Generating..." : "Generate Message"}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); setComposing(true); }}
                      className="li-action-btn"
                      style={{ justifyContent: "center" }}>
                      <Send className="w-3 h-3" /> Compose
                    </button>
                  </div>
                </div>
              );
            })}
            {actionableLeads.length === 0 && (
              <div className="card" style={{ padding: 40, textAlign: "center" }}>
                <MessageSquare className="w-8 h-8" style={{ color: "var(--balboa-text-light)", margin: "0 auto 12px" }} />
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--balboa-navy)", marginBottom: 4 }}>No matching leads</p>
                <p style={{ fontSize: 12, color: "var(--balboa-text-muted)" }}>Adjust your filters or import more leads</p>
              </div>
            )}
          </div>
        </div>

        {/* Right panel: Lead detail + compose */}
        {selectedLead && (
          <div className="card fade-in" style={{ flex: "0 0 53%", maxHeight: "calc(100vh - 380px)", overflowY: "auto" }}>
            {/* Lead header */}
            <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--balboa-border-light)", background: "linear-gradient(135deg, rgba(30,42,94,0.02), rgba(59,91,219,0.02))" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)" }}>{selectedLead.firstName} {selectedLead.lastName}</h3>
                  <p style={{ fontSize: 12, color: "var(--balboa-text-muted)", marginTop: 2 }}>{selectedLead.position} at <span style={{ color: "var(--balboa-blue)", fontWeight: 500 }}>{selectedLead.company}</span></p>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => onNavigateToLead(selectedLead.id)} className="btn-ghost" style={{ fontSize: 11, color: "var(--balboa-blue)" }}>
                    <User className="w-3 h-3" /> View Profile
                  </button>
                </div>
              </div>
            </div>

            <div style={{ padding: "18px 22px" }}>
              {/* Compose area */}
              {composing ? (
                <div className="fade-in">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <Zap className="w-4 h-4" style={{ color: "var(--balboa-orange)" }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--balboa-navy)" }}>Compose Message</span>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                      {(["linkedin", "email"] as const).map(ch => (
                        <button key={ch} onClick={() => setComposeChannel(ch)}
                          style={{
                            display: "flex", alignItems: "center", gap: 4,
                            padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
                            border: "none",
                            background: composeChannel === ch ? (ch === "linkedin" ? "#0077b5" : "#d97706") : "var(--balboa-bg-alt)",
                            color: composeChannel === ch ? "white" : "var(--balboa-text-muted)",
                            transition: "all 0.15s ease",
                          }}>
                          {ch === "linkedin" ? <Linkedin className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                          {ch.charAt(0).toUpperCase() + ch.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {composeChannel === "email" && (
                    <input
                      type="text"
                      placeholder="Email subject..."
                      value={composeSubject}
                      onChange={e => setComposeSubject(e.target.value)}
                      style={{ width: "100%", marginBottom: 10 }}
                    />
                  )}

                  <textarea
                    value={composeMessage}
                    onChange={e => setComposeMessage(e.target.value)}
                    placeholder={`Write your ${composeChannel} message...`}
                    rows={6}
                    style={{ marginBottom: 12 }}
                  />

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button onClick={handleSendMessage} disabled={!composeMessage.trim() || sendStatus === "sending"}
                      className="btn-primary" style={{
                        background: sendStatus === "sent" ? "var(--balboa-green)" : "var(--balboa-navy)",
                        fontSize: 13,
                      }}>
                      {sendStatus === "sending" && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      {sendStatus === "sent" && <CheckCircle className="w-3.5 h-3.5" />}
                      {sendStatus === "idle" && <Send className="w-3.5 h-3.5" />}
                      {sendStatus === "sending" ? "Sending..." : sendStatus === "sent" ? "Sent!" : "Send Message"}
                    </button>
                    <button onClick={() => onCopyMessage(composeMessage)} className="btn-secondary" style={{ fontSize: 12 }}>
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </button>
                    <button onClick={() => { setComposing(false); setComposeMessage(""); setComposeSubject(""); }}
                      className="btn-ghost" style={{ fontSize: 12, marginLeft: "auto" }}>
                      Cancel
                    </button>
                  </div>

                  {/* AI generate buttons */}
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--balboa-border-light)" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                      <Sparkles className="w-3 h-3" /> AI-Generate Message
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[
                        { type: "connection_followup", label: "Follow-up" },
                        { type: "warm_intro", label: "Warm Intro" },
                        { type: "value_share", label: "Value Share" },
                        { type: "meeting_request", label: "Meeting Request" },
                      ].map(t => (
                        <button key={t.type}
                          onClick={() => onGenerateMessage(selectedLead, t.type)}
                          disabled={generatingForLeadId === selectedLead.id}
                          className="li-action-btn"
                          style={{ fontSize: 11 }}>
                          {generatingForLeadId === selectedLead.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Existing drafts for this lead */
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--balboa-navy)", display: "flex", alignItems: "center", gap: 6 }}>
                      <MessageSquare className="w-4 h-4" /> Messages ({selectedLead.draftMessages.length})
                    </span>
                    <button onClick={() => setComposing(true)}
                      className="btn-primary" style={{ fontSize: 12 }}>
                      <Send className="w-3.5 h-3.5" /> New Message
                    </button>
                  </div>

                  {selectedLead.draftMessages.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 32 }}>
                      <MessageSquare className="w-8 h-8" style={{ color: "var(--balboa-text-light)", margin: "0 auto 12px" }} />
                      <p style={{ fontSize: 13, color: "var(--balboa-text-muted)", marginBottom: 14 }}>No messages yet for this lead</p>
                      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                        <button onClick={() => handleGenerateAndCompose(selectedLead, "connection_followup")}
                          className="btn-primary" style={{ fontSize: 12, background: "var(--balboa-blue)" }}>
                          <Sparkles className="w-3.5 h-3.5" /> AI Generate
                        </button>
                        <button onClick={() => setComposing(true)}
                          className="btn-secondary" style={{ fontSize: 12 }}>
                          <Send className="w-3.5 h-3.5" /> Write Manually
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {selectedLead.draftMessages.map(d => (
                        <div key={d.id} style={{ borderRadius: 10, padding: 14, background: "var(--balboa-bg-alt)", border: "1px solid var(--balboa-border-light)" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span className={`channel-pill ${d.channel === "linkedin" ? "channel-linkedin" : "channel-email"}`}>
                                {d.channel === "linkedin" ? <Linkedin className="w-3 h-3" /> : <AtSign className="w-3 h-3" />}
                                {d.channel}
                              </span>
                              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--balboa-text-muted)" }}>{d.type?.replace(/_/g, " ")}</span>
                            </div>
                            <span className={`badge ${d.status === "approved" || d.status === "sent" ? "badge-connected" : d.status === "rejected" ? "badge-hot" : "badge-warm"}`}>
                              {d.status}
                            </span>
                          </div>
                          <p style={{ fontSize: 12, color: "var(--balboa-text-secondary)", lineHeight: 1.5, marginBottom: 8, whiteSpace: "pre-wrap" }}>
                            {d.body.length > 200 ? d.body.slice(0, 200) + "..." : d.body}
                          </p>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => { setComposing(true); setComposeMessage(d.body); setComposeSubject(d.subject || ""); setComposeChannel((d.channel === "email" || d.channel === "linkedin") ? d.channel : "linkedin"); }}
                              className="li-action-btn primary" style={{ fontSize: 10 }}>
                              <Send className="w-3 h-3" /> Send This
                            </button>
                            <button onClick={() => onCopyMessage(d.body)} className="li-action-btn" style={{ fontSize: 10 }}>
                              <Copy className="w-3 h-3" /> Copy
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
