"use client";

import { useState } from "react";
import {
  Radar, Users, Calendar, TrendingUp, Copy, ChevronRight,
  Globe, Briefcase, Signal, MessageSquare, Target,
  ArrowRight, MapPin, Sparkles, AlertCircle, Building,
  PenTool, Search, Lock, UserPlus, Send, RefreshCw,
  CheckCircle, Linkedin, Zap,
} from "lucide-react";
import type { Prospect, EventOpportunity, MarketSignal } from "@/lib/types";
import { MOCK_PROSPECTS, MOCK_EVENTS, MOCK_SIGNALS } from "@/lib/mock-data";
import { trackEventClient } from "@/lib/tracking";

interface Props {
  onAddToLeads?: (prospect: Prospect) => void;
  onGenerateMessage?: (prospect: Prospect) => Promise<string>;
  onCopyMessage?: (text: string) => void;
}

export default function Prospecting({ onAddToLeads, onGenerateMessage, onCopyMessage }: Props) {
  const [prospects] = useState<Prospect[]>(MOCK_PROSPECTS);
  const [events] = useState<EventOpportunity[]>(MOCK_EVENTS);
  const [signals] = useState<MarketSignal[]>(MOCK_SIGNALS);
  const [subTab, setSubTab] = useState<"prospects" | "events" | "signals" | "content" | "research">("prospects");
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [generatingMessage, setGeneratingMessage] = useState(false);
  const [generatedMessage, setGeneratedMessage] = useState("");
  const [addedProspects, setAddedProspects] = useState<Set<string>>(new Set());

  const copyToClipboard = (text: string) => {
    if (onCopyMessage) onCopyMessage(text);
    else navigator.clipboard.writeText(text);
  };

  const handleGenerateMessage = async (prospect: Prospect) => {
    if (!onGenerateMessage) return;
    setGeneratingMessage(true);
    setGeneratedMessage("");
    try {
      const msg = await onGenerateMessage(prospect);
      setGeneratedMessage(msg);
    } catch { /* ignore */ }
    setGeneratingMessage(false);
  };

  const handleAddToLeads = (prospect: Prospect) => {
    if (!onAddToLeads) return;
    onAddToLeads(prospect);
    setAddedProspects(prev => new Set(prev).add(prospect.id));
    trackEventClient({ eventCategory: "lead", eventAction: "lead_created", metadata: { source: "prospecting", prospectId: prospect.id } });
  };

  const ScoreRing = ({ score, size = 40 }: { score: number; size?: number }) => {
    const radius = (size - 6) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    const color = score >= 70 ? "#e03131" : score >= 40 ? "#f59f00" : "#3b5bdb";
    return (
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--balboa-border)" strokeWidth="3" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="score-ring" />
        <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
          fill={color} fontSize={size * 0.3} fontWeight="bold" className="transform rotate-90" style={{ transformOrigin: "center" }}>
          {score}
        </text>
      </svg>
    );
  };

  const SignalIcon = ({ type }: { type: string }) => {
    const icons: Record<string, typeof TrendingUp> = {
      event_attendance: Calendar, content_engagement: MessageSquare, job_change: Briefcase,
      company_growth: TrendingUp, funding: TrendingUp, tech_adoption: Globe,
      pain_indicator: AlertCircle, competitor_mention: Target, hiring: Users,
      expansion: Building, leadership_change: Users, tech_change: Globe,
    };
    const Icon = icons[type] || Signal;
    return <Icon className="w-3.5 h-3.5" />;
  };

  const signalBadgeClass = (strength: string) => {
    if (strength === "strong" || strength === "high") return "signal-strong";
    if (strength === "moderate" || strength === "medium") return "signal-moderate";
    return "signal-weak";
  };

  return (
    <div style={{ padding: "24px 32px" }}>
      {/* Sub-tabs */}
      <div className="tab-nav" style={{ marginBottom: 24, paddingLeft: 0 }}>
        {[
          { id: "prospects" as const, label: `Prospects (${prospects.length})`, icon: Radar },
          { id: "events" as const, label: `Events (${events.length})`, icon: Calendar },
          { id: "signals" as const, label: `Market Signals (${signals.length})`, icon: Signal },
          { id: "content" as const, label: "Content Ideas", icon: PenTool },
          { id: "research" as const, label: "Research Lab", icon: Search },
        ].map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`tab-btn ${subTab === t.id ? "active" : ""}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* PROSPECTS */}
      {subTab === "prospects" && (
        <div style={{ display: "flex", gap: 24 }}>
          <div style={{ flex: selectedProspect ? "0 0 50%" : "1", display: "flex", flexDirection: "column", gap: 8 }}>
            {prospects.map((p) => (
              <div key={p.id} onClick={() => setSelectedProspect(p)}
                className={`card card-hover fade-in ${p.icpScore.tier === "hot" ? "priority-high" : "priority-medium"}`}
                style={{
                  padding: 16, cursor: "pointer",
                  borderColor: selectedProspect?.id === p.id ? "var(--balboa-blue-light)" : undefined,
                  boxShadow: selectedProspect?.id === p.id ? "0 2px 8px rgba(59, 91, 219, 0.12)" : undefined,
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <ScoreRing score={p.icpScore.overall} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <h3 style={{ fontWeight: 600, color: "var(--balboa-navy)", fontSize: 14 }}>{p.firstName} {p.lastName}</h3>
                      <span className={`badge badge-${p.icpScore.tier}`}>{p.icpScore.tier.toUpperCase()}</span>
                      <span style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 9999,
                        background: "#ede9fe", color: "#7c3aed", fontWeight: 500,
                      }}>{p.source}</span>
                    </div>
                    <p style={{ fontSize: 13, color: "var(--balboa-text-secondary)", marginTop: 2 }}>{p.position}</p>
                    <p style={{ fontSize: 12, color: "var(--balboa-text-muted)" }}>{p.company}</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <span style={{ fontSize: 10, color: "var(--balboa-text-muted)" }}>{p.signals.length} signals</span>
                    <ChevronRight className="w-4 h-4" style={{ color: "var(--balboa-text-light)" }} />
                  </div>
                </div>
                {/* Signals preview */}
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {p.signals.slice(0, 2).map((s, i) => (
                    <span key={i} className={`signal-badge ${signalBadgeClass(s.strength)}`}>
                      <SignalIcon type={s.type} /> {s.description.slice(0, 50)}...
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Prospect Detail */}
          {selectedProspect && (
            <div className="card fade-in" style={{ flex: "0 0 50%", padding: 24, maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--balboa-navy)" }}>
                    {selectedProspect.firstName} {selectedProspect.lastName}
                  </h2>
                  <p style={{ color: "var(--balboa-text-secondary)", fontSize: 14 }}>{selectedProspect.position}</p>
                  <p style={{ color: "var(--balboa-blue)", fontSize: 13, fontWeight: 500 }}>{selectedProspect.company}</p>
                </div>
                <ScoreRing score={selectedProspect.icpScore.overall} size={56} />
              </div>

              {/* Source */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <span style={{
                  fontSize: 11, padding: "4px 10px", borderRadius: 6,
                  background: "#ede9fe", color: "#7c3aed", fontWeight: 500,
                  display: "inline-flex", alignItems: "center", gap: 4,
                }}>
                  <Radar className="w-3 h-3" /> {selectedProspect.source}: {selectedProspect.sourceDetail}
                </span>
              </div>

              {/* Discovery Stage */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, color: "var(--balboa-text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" }}>
                  Discovery Stage
                </label>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {(["discovered", "researching", "qualified", "outreach_ready", "contacted"] as const).map((s) => (
                    <span key={s} style={{
                      padding: "4px 10px", borderRadius: 9999, fontSize: 11, fontWeight: 500,
                      background: selectedProspect.status === s ? "var(--balboa-navy)" : "var(--balboa-bg-alt)",
                      color: selectedProspect.status === s ? "white" : "var(--balboa-text-muted)",
                      border: `1px solid ${selectedProspect.status === s ? "var(--balboa-navy)" : "var(--balboa-border)"}`,
                    }}>
                      {s.replace("_", " ")}
                    </span>
                  ))}
                </div>
              </div>

              {/* Signals */}
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-navy)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <Signal className="w-4 h-4" style={{ color: "var(--balboa-orange)" }} /> Signals ({selectedProspect.signals.length})
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {selectedProspect.signals.map((s, i) => (
                    <div key={i} style={{ background: "var(--balboa-bg-alt)", borderRadius: 8, padding: 12, border: "1px solid var(--balboa-border-light)" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <span className={`signal-badge ${signalBadgeClass(s.strength)}`} style={{ flexShrink: 0 }}>
                          <SignalIcon type={s.type} /> {s.strength}
                        </span>
                        <div>
                          <p style={{ fontSize: 13, color: "var(--balboa-text-secondary)" }}>{s.description}</p>
                          <p style={{ fontSize: 10, color: "var(--balboa-text-muted)", marginTop: 4 }}>{s.source} &bull; {s.date}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ICP Fit */}
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-navy)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <Sparkles className="w-4 h-4" style={{ color: "var(--balboa-orange)" }} /> ICP Fit
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {selectedProspect.icpScore.signals.map((s, i) => (
                    <div key={i} style={{ fontSize: 13, color: "var(--balboa-text-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
                      <Target className="w-3 h-3" style={{ color: "var(--balboa-green)", flexShrink: 0 }} /> {s}
                    </div>
                  ))}
                </div>
              </div>

              {/* Suggested Approach */}
              {selectedProspect.suggestedApproach && (
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-navy)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <ArrowRight className="w-4 h-4" style={{ color: "var(--balboa-orange)" }} /> Recommended Approach
                  </h4>
                  <p style={{
                    fontSize: 13, color: "var(--balboa-text-secondary)",
                    background: "var(--balboa-bg-alt)", borderRadius: 8, padding: 12,
                    border: "1px solid var(--balboa-border-light)",
                  }}>
                    {selectedProspect.suggestedApproach}
                  </p>
                </div>
              )}

              {/* === ACTION BUTTONS === */}
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-navy)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <Zap className="w-4 h-4" style={{ color: "var(--balboa-orange)" }} /> Quick Actions
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Add to leads */}
                  <button onClick={() => handleAddToLeads(selectedProspect)}
                    disabled={addedProspects.has(selectedProspect.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, width: "100%",
                      background: addedProspects.has(selectedProspect.id) ? "#ecfdf5" : "linear-gradient(135deg, var(--balboa-navy), var(--balboa-blue))",
                      color: addedProspects.has(selectedProspect.id) ? "#059669" : "white",
                      border: addedProspects.has(selectedProspect.id) ? "1px solid #a7f3d0" : "none",
                      cursor: addedProspects.has(selectedProspect.id) ? "default" : "pointer",
                      fontSize: 13, fontWeight: 600,
                      boxShadow: addedProspects.has(selectedProspect.id) ? "none" : "0 2px 8px rgba(30,42,94,0.25)",
                      transition: "all 0.2s ease",
                    }}>
                    {addedProspects.has(selectedProspect.id) ? <CheckCircle className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                    {addedProspects.has(selectedProspect.id) ? "Added to Leads" : "Add to My Leads"}
                    <ChevronRight className="w-4 h-4" style={{ marginLeft: "auto", opacity: 0.6 }} />
                  </button>

                  {/* Generate AI message */}
                  <button onClick={() => handleGenerateMessage(selectedProspect)}
                    disabled={generatingMessage}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, width: "100%",
                      background: "var(--balboa-bg-alt)", color: "var(--balboa-navy)",
                      border: "1px solid var(--balboa-border)", cursor: generatingMessage ? "wait" : "pointer",
                      fontSize: 13, fontWeight: 600, transition: "all 0.2s ease",
                    }}>
                    {generatingMessage ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" style={{ color: "var(--balboa-blue)" }} />}
                    {generatingMessage ? "Generating Message..." : "Generate AI Message"}
                    <ChevronRight className="w-4 h-4" style={{ marginLeft: "auto", opacity: 0.4 }} />
                  </button>

                  {/* Copy LinkedIn URL */}
                  <button onClick={() => copyToClipboard(`https://linkedin.com/in/${selectedProspect.firstName.toLowerCase()}-${selectedProspect.lastName.toLowerCase()}`)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, width: "100%",
                      background: "white", color: "#0077b5",
                      border: "1px solid #b3d4fc", cursor: "pointer",
                      fontSize: 13, fontWeight: 600, transition: "all 0.2s ease",
                    }}>
                    <Linkedin className="w-4 h-4" /> Connect on LinkedIn
                    <ChevronRight className="w-4 h-4" style={{ marginLeft: "auto", opacity: 0.4 }} />
                  </button>
                </div>
              </div>

              {/* Generated AI message */}
              {generatedMessage && (
                <div className="fade-in" style={{ marginBottom: 16 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-navy)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <Sparkles className="w-4 h-4" style={{ color: "var(--balboa-blue)" }} /> AI-Generated Message
                  </h4>
                  <div style={{
                    background: "#f0f4ff", borderRadius: 10, padding: 14, marginBottom: 8,
                    border: "1px solid #dbe4ff",
                  }}>
                    <p style={{ fontSize: 13, color: "var(--balboa-text-secondary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{generatedMessage}</p>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => copyToClipboard(generatedMessage)} className="li-action-btn primary" style={{ fontSize: 11 }}>
                      <Copy className="w-3 h-3" /> Copy Message
                    </button>
                    <button onClick={() => handleGenerateMessage(selectedProspect)} className="li-action-btn" style={{ fontSize: 11 }}>
                      <RefreshCw className="w-3 h-3" /> Regenerate
                    </button>
                  </div>
                </div>
              )}

              {/* Suggested Message (static) */}
              {selectedProspect.suggestedMessage && !generatedMessage && (
                <div>
                  <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-navy)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <MessageSquare className="w-4 h-4" style={{ color: "var(--balboa-orange)" }} /> Suggested Outreach
                  </h4>
                  <div style={{
                    background: "var(--balboa-bg-alt)", borderRadius: 8, padding: 12, marginBottom: 8,
                    border: "1px solid var(--balboa-border-light)",
                  }}>
                    <p style={{ fontSize: 13, color: "var(--balboa-text-secondary)", lineHeight: 1.5 }}>{selectedProspect.suggestedMessage}</p>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => copyToClipboard(selectedProspect.suggestedMessage!)} className="li-action-btn primary" style={{ fontSize: 11 }}>
                      <Copy className="w-3 h-3" /> Copy Message
                    </button>
                    <button onClick={() => { setGeneratedMessage(selectedProspect.suggestedMessage!); }} className="li-action-btn" style={{ fontSize: 11 }}>
                      <Send className="w-3 h-3" /> Use as Draft
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* EVENTS */}
      {subTab === "events" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {events.map((evt) => (
            <div key={evt.id} className="card fade-in" style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)" }}>{evt.name}</h3>
                    <span className={`badge ${evt.icpDensity === "high" ? "badge-hot" : "badge-warm"}`}>
                      {evt.icpDensity.toUpperCase()} ICP DENSITY
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: "var(--balboa-text-muted)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Calendar className="w-3 h-3" /> {evt.date}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MapPin className="w-3 h-3" /> {evt.location}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Users className="w-3 h-3" /> ~{evt.estimatedAttendees.toLocaleString()} attendees</span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "var(--balboa-orange)" }}>{evt.relevanceScore}</div>
                  <div style={{ fontSize: 10, color: "var(--balboa-text-muted)" }}>Relevance</div>
                </div>
              </div>

              <div style={{
                background: "var(--balboa-bg-alt)", borderRadius: 8, padding: 12, marginBottom: 12,
                border: "1px solid var(--balboa-border-light)",
              }}>
                <p className="section-label" style={{ marginBottom: 4 }}>BALBOA ANGLE</p>
                <p style={{ fontSize: 13, color: "var(--balboa-text-secondary)" }}>{evt.balboaAngle}</p>
              </div>

              {evt.keyAttendees.length > 0 && (
                <div>
                  <p className="section-label" style={{ marginBottom: 8 }}>KEY ATTENDEES TO TARGET</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {evt.keyAttendees.map((a) => (
                      <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                        <ScoreRing score={a.icpScore.overall} size={28} />
                        <span style={{ fontWeight: 500, color: "var(--balboa-navy)" }}>{a.firstName} {a.lastName}</span>
                        <span style={{ color: "var(--balboa-text-muted)" }}>&mdash; {a.position}, {a.company}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* CONTENT IDEAS — Coming Soon */}
      {subTab === "content" && (
        <div className="card" style={{ padding: 48, textAlign: "center", maxWidth: 480, margin: "0 auto" }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, background: "var(--balboa-bg-alt)",
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
          }}>
            <PenTool className="w-6 h-6" style={{ color: "var(--balboa-text-light)" }} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 8 }}>Content Ideas</h3>
          <p style={{ fontSize: 13, color: "var(--balboa-text-muted)", lineHeight: 1.5, marginBottom: 16 }}>
            AI-powered LinkedIn content suggestions tailored to your ICP. Generate posts, articles, and engagement hooks based on your pipeline data.
          </p>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
            background: "#fef3c7", color: "#d97706",
          }}>
            <Lock className="w-3.5 h-3.5" /> Coming Soon — Requires API Credits
          </div>
        </div>
      )}

      {/* RESEARCH LAB — Coming Soon */}
      {subTab === "research" && (
        <div className="card" style={{ padding: 48, textAlign: "center", maxWidth: 480, margin: "0 auto" }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, background: "var(--balboa-bg-alt)",
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
          }}>
            <Search className="w-6 h-6" style={{ color: "var(--balboa-text-light)" }} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 8 }}>Research Lab</h3>
          <p style={{ fontSize: 13, color: "var(--balboa-text-muted)", lineHeight: 1.5, marginBottom: 16 }}>
            Deep-dive company research, industry trend analysis, and competitive intelligence powered by Claude. Query any company or market topic.
          </p>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
            background: "#fef3c7", color: "#d97706",
          }}>
            <Lock className="w-3.5 h-3.5" /> Coming Soon — Requires API Credits
          </div>
        </div>
      )}

      {/* MARKET SIGNALS */}
      {subTab === "signals" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {signals.map((sig) => {
            const typeStyles: Record<string, { bg: string; color: string }> = {
              pain_indicator: { bg: "#fee2e2", color: "#dc2626" },
              expansion: { bg: "#d1fae5", color: "#059669" },
              tech_change: { bg: "#dbeafe", color: "#2563eb" },
              hiring: { bg: "#ede9fe", color: "#7c3aed" },
              leadership_change: { bg: "#fef3c7", color: "#d97706" },
              funding: { bg: "#fff7ed", color: "#ea580c" },
            };
            const ts = typeStyles[sig.type] || { bg: "var(--balboa-bg-alt)", color: "var(--balboa-text-muted)" };

            return (
              <div key={sig.id}
                className={`card fade-in ${sig.relevance === "high" ? "priority-high" : "priority-medium"}`}
                style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <span style={{
                    fontSize: 10, padding: "4px 10px", borderRadius: 6,
                    background: ts.bg, color: ts.color, fontWeight: 500,
                    display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0,
                  }}>
                    <SignalIcon type={sig.type} /> {sig.type.replace("_", " ")}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <h4 style={{ fontWeight: 600, color: "var(--balboa-navy)", fontSize: 14 }}>{sig.company}</h4>
                      <span className={`badge ${sig.relevance === "high" ? "badge-hot" : "badge-warm"}`}>
                        {sig.relevance}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: "var(--balboa-text-secondary)", marginBottom: 8 }}>{sig.description}</p>
                    <div style={{
                      background: "var(--balboa-bg-alt)", borderRadius: 6, padding: 8, marginBottom: 8,
                      border: "1px solid var(--balboa-border-light)",
                    }}>
                      <p style={{ fontSize: 12, color: "var(--balboa-orange)", display: "flex", alignItems: "center", gap: 4 }}>
                        <ArrowRight className="w-3 h-3" />
                        {sig.suggestedAction}
                      </p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 10, color: "var(--balboa-text-muted)" }}>
                      <span>{sig.date}</span>
                      <span>Source: {sig.source}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
