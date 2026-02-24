"use client";

import { useState } from "react";
import { Lightbulb, Users, FileText, Clock, Star, Linkedin, Mail, Phone, Award, TrendingUp } from "lucide-react";
import type { PlaybookDashboardData } from "@/lib/types";
import PlaybookInsightCard from "./PlaybookInsightCard";

interface PlaybookDashboardProps {
  data: PlaybookDashboardData;
}

type PlaybookTab = "insights" | "personas" | "templates" | "timing";
type InsightFilter = "all" | "messaging" | "timing" | "persona" | "channel" | "demo" | "call_script" | "opener";

const channelIcons: Record<string, typeof Linkedin> = { linkedin: Linkedin, email: Mail, call: Phone };

export default function PlaybookDashboard({ data }: PlaybookDashboardProps) {
  const [activeTab, setActiveTab] = useState<PlaybookTab>("insights");
  const [insightFilter, setInsightFilter] = useState<InsightFilter>("all");
  const [timingChannel, setTimingChannel] = useState<"email" | "linkedin">("email");

  const filteredInsights = insightFilter === "all"
    ? data.topInsights
    : data.topInsights.filter(i => i.category === insightFilter);

  const tabs: { key: PlaybookTab; label: string; icon: typeof Lightbulb }[] = [
    { key: "insights", label: "Insights", icon: Lightbulb },
    { key: "personas", label: "Personas", icon: Users },
    { key: "templates", label: "Templates", icon: FileText },
    { key: "timing", label: "Timing", icon: Clock },
  ];

  const insightFilters: { key: InsightFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "messaging", label: "Messaging" },
    { key: "timing", label: "Timing" },
    { key: "persona", label: "Persona" },
    { key: "channel", label: "Channel" },
    { key: "opener", label: "Opener" },
    { key: "call_script", label: "Call Script" },
    { key: "demo", label: "Demo" },
  ];

  // Build timing heatmap grid
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const slots = ["8-10 AM", "10-12 PM", "2-4 PM"];
  const timingData = data.timingHeatmap.filter(t => t.channel === timingChannel);
  const getTimingCell = (day: string, slot: string) => {
    const fullSlot = `${day} ${slot.replace(" AM", "").replace(" PM", "")}`;
    return timingData.find(t => t.slot.includes(day) && t.slot.includes(slot.split(" ")[0]));
  };
  const maxReplyRate = Math.max(...timingData.map(t => t.replyRate), 1);

  return (
    <div>
      {/* Overall Stats Bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <div className="playbook-stat-card">
          <div className="stat-value">{data.overallStats.totalOutreachActions}</div>
          <div className="stat-label">Total Outreach</div>
        </div>
        <div className="playbook-stat-card">
          <div className="stat-value" style={{ color: "var(--balboa-green)" }}>{data.overallStats.avgResponseRate}%</div>
          <div className="stat-label">Avg Response Rate</div>
        </div>
        <div className="playbook-stat-card">
          <div className="stat-value" style={{ color: "var(--balboa-blue)" }}>{data.overallStats.bestPerformingChannel}</div>
          <div className="stat-label">Best Channel</div>
        </div>
        <div className="playbook-stat-card">
          <div className="stat-value" style={{ color: "var(--balboa-orange)", fontSize: 18 }}>{data.overallStats.topChampionPersona}</div>
          <div className="stat-label">Top Champion</div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="tab-nav" style={{ marginBottom: 16 }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} className={`tab-btn ${activeTab === t.key ? "active" : ""}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* === INSIGHTS TAB === */}
      {activeTab === "insights" && (
        <div>
          {/* Filter pills */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 16 }}>
            {insightFilters.map((f) => (
              <button
                key={f.key}
                onClick={() => setInsightFilter(f.key)}
                className="lang-pill"
                style={insightFilter === f.key ? { background: "var(--balboa-navy)", color: "white", borderColor: "var(--balboa-navy)" } : {}}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Insight cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredInsights.map((insight) => (
              <PlaybookInsightCard key={insight.id} insight={insight} />
            ))}
          </div>

          {filteredInsights.length === 0 && (
            <div className="card" style={{ padding: 32, textAlign: "center" }}>
              <Lightbulb className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--balboa-text-light)" }} />
              <p style={{ color: "var(--balboa-text-muted)", fontSize: 13 }}>No insights found for this filter.</p>
            </div>
          )}
        </div>
      )}

      {/* === PERSONAS TAB === */}
      {activeTab === "personas" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {data.personaBreakdown.map((persona) => {
            const ChannelIcon = channelIcons[persona.bestChannel] || Mail;
            return (
              <div key={persona.persona} className="persona-card">
                <div className="persona-card-header">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{persona.persona}</span>
                    {persona.isChampionMaterial && (
                      <span className="champion-badge">
                        <Award className="w-3 h-3" /> Champion
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>{persona.totalContacted} contacted</div>
                </div>
                <div className="persona-card-body">
                  {/* Response rate */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 28, fontWeight: 800, color: persona.responseRate >= 30 ? "var(--balboa-green)" : persona.responseRate >= 20 ? "var(--balboa-yellow)" : "var(--balboa-red)" }}>
                      {persona.responseRate}%
                    </span>
                    <span style={{ fontSize: 11, color: "var(--balboa-text-muted)" }}>response rate</span>
                  </div>

                  {/* Quick stats */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                    <div style={{ fontSize: 11 }}>
                      <div style={{ color: "var(--balboa-text-muted)" }}>Best Channel</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 600, color: "var(--balboa-navy)", marginTop: 2 }}>
                        <ChannelIcon className="w-3 h-3" /> {persona.bestChannel}
                      </div>
                    </div>
                    <div style={{ fontSize: 11 }}>
                      <div style={{ color: "var(--balboa-text-muted)" }}>Best Time</div>
                      <div style={{ fontWeight: 600, color: "var(--balboa-navy)", marginTop: 2 }}>{persona.bestTimeOfDay}</div>
                    </div>
                    <div style={{ fontSize: 11 }}>
                      <div style={{ color: "var(--balboa-text-muted)" }}>→ Demo Rate</div>
                      <div style={{ fontWeight: 600, color: "var(--balboa-navy)", marginTop: 2 }}>{persona.conversionToDemo}%</div>
                    </div>
                    <div style={{ fontSize: 11 }}>
                      <div style={{ color: "var(--balboa-text-muted)" }}>Avg Reply Time</div>
                      <div style={{ fontWeight: 600, color: "var(--balboa-navy)", marginTop: 2 }}>{persona.avgResponseTimeDays}d</div>
                    </div>
                  </div>

                  {/* Champion score bar */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--balboa-text-muted)", marginBottom: 3 }}>
                      <span>Champion Score</span>
                      <span style={{ fontWeight: 700, color: persona.championScore >= 70 ? "#d97706" : "var(--balboa-text-muted)" }}>
                        {persona.championScore}/100
                      </span>
                    </div>
                    <div className="rate-bar-track">
                      <div className="rate-bar-fill" style={{
                        width: `${persona.championScore}%`,
                        background: persona.championScore >= 70 ? "linear-gradient(90deg, #f59f00, #e8590c)" : "var(--balboa-text-light)",
                      }} />
                    </div>
                  </div>

                  {/* Top opening line */}
                  {persona.topOpeningLines[0] && (
                    <div style={{ background: "var(--balboa-bg-alt)", borderRadius: 6, padding: "8px 10px", fontSize: 11, color: "var(--balboa-text-secondary)", fontStyle: "italic", lineHeight: 1.4 }}>
                      &ldquo;{persona.topOpeningLines[0]}&rdquo;
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* === TEMPLATES TAB === */}
      {activeTab === "templates" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.templateRankings.map((tmpl, idx) => {
            const ChannelIcon = tmpl.channel === "linkedin" ? Linkedin : Mail;
            const isTop = idx === 0;
            return (
              <div key={tmpl.templateId} className="card" style={{
                padding: "14px 16px",
                border: isTop ? "2px solid var(--balboa-yellow)" : "1px solid var(--balboa-border)",
                position: "relative",
              }}>
                {isTop && (
                  <div style={{ position: "absolute", top: -8, right: 12, background: "var(--balboa-yellow)", color: "white", fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 8, display: "flex", alignItems: "center", gap: 4 }}>
                    <Star className="w-3 h-3" /> TOP PERFORMER
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {/* Rank */}
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: isTop ? "var(--balboa-yellow)" : "var(--balboa-bg-alt)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: isTop ? "white" : "var(--balboa-text-muted)", flexShrink: 0 }}>
                    #{idx + 1}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--balboa-navy)" }}>{tmpl.templateName}</span>
                      <span className={`channel-pill ${tmpl.channel === "linkedin" ? "channel-linkedin" : "channel-email"}`} style={{ fontSize: 10 }}>
                        <ChannelIcon className="w-3 h-3" /> {tmpl.channel}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--balboa-text-muted)" }}>
                      <span>Sent: <strong style={{ color: "var(--balboa-navy)" }}>{tmpl.totalSent}</strong></span>
                      <span>Best persona: <strong style={{ color: "var(--balboa-navy)" }}>{tmpl.bestPersona}</strong></span>
                      <span>Best time: <strong style={{ color: "var(--balboa-navy)" }}>{tmpl.bestTimeSlot}</strong></span>
                    </div>
                  </div>

                  {/* Reply rate bar */}
                  <div style={{ width: 120, flexShrink: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--balboa-text-muted)", marginBottom: 3 }}>
                      <span>Reply Rate</span>
                      <span style={{ fontWeight: 700, color: tmpl.replyRate >= 30 ? "var(--balboa-green)" : "var(--balboa-navy)" }}>{tmpl.replyRate}%</span>
                    </div>
                    <div className="rate-bar-track">
                      <div className="rate-bar-fill" style={{
                        width: `${tmpl.replyRate}%`,
                        background: tmpl.replyRate >= 30 ? "var(--balboa-green)" : "var(--balboa-blue)",
                      }} />
                    </div>
                  </div>
                </div>

                {/* Sample responses */}
                {tmpl.sampleResponses.length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--balboa-border-light)" }}>
                    <span style={{ fontSize: 10, color: "var(--balboa-text-muted)", fontWeight: 600 }}>SAMPLE REPLIES:</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                      {tmpl.sampleResponses.map((resp, i) => (
                        <div key={i} style={{ fontSize: 11, color: "var(--balboa-text-secondary)", fontStyle: "italic", paddingLeft: 10, borderLeft: "2px solid var(--balboa-border-light)" }}>
                          &ldquo;{resp}&rdquo;
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* === TIMING TAB === */}
      {activeTab === "timing" && (
        <div>
          {/* Channel toggle */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            <button onClick={() => setTimingChannel("email")} className="lang-pill" style={timingChannel === "email" ? { background: "var(--balboa-navy)", color: "white", borderColor: "var(--balboa-navy)" } : {}}>
              <Mail className="w-3 h-3" /> Email
            </button>
            <button onClick={() => setTimingChannel("linkedin")} className="lang-pill" style={timingChannel === "linkedin" ? { background: "var(--balboa-navy)", color: "white", borderColor: "var(--balboa-navy)" } : {}}>
              <Linkedin className="w-3 h-3" /> LinkedIn
            </button>
          </div>

          {/* Heatmap */}
          <div className="card" style={{ padding: 16, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 4 }}>
              <thead>
                <tr>
                  <th style={{ fontSize: 11, color: "var(--balboa-text-muted)", textAlign: "left", padding: "4px 8px", fontWeight: 600 }}>Day</th>
                  {slots.map((slot) => (
                    <th key={slot} style={{ fontSize: 11, color: "var(--balboa-text-muted)", textAlign: "center", padding: "4px 8px", fontWeight: 600 }}>{slot}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day}>
                    <td style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-navy)", padding: "4px 8px" }}>{day}</td>
                    {slots.map((slot) => {
                      const cell = getTimingCell(day, slot);
                      const replyRate = cell?.replyRate || 0;
                      const intensity = replyRate / maxReplyRate;
                      const bgColor = timingChannel === "email"
                        ? `rgba(59, 91, 219, ${0.1 + intensity * 0.7})`
                        : `rgba(30, 42, 94, ${0.1 + intensity * 0.7})`;
                      const textColor = intensity > 0.5 ? "white" : "var(--balboa-navy)";
                      return (
                        <td key={`${day}-${slot}`} style={{ padding: 2 }}>
                          <div className="heatmap-cell" style={{ background: bgColor, color: textColor }} title={cell?.recommendation || ""}>
                            {replyRate}%
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 12, height: 12, borderRadius: 2, background: `rgba(59, 91, 219, 0.15)` }} />
                <span style={{ fontSize: 10, color: "var(--balboa-text-muted)" }}>Low</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 12, height: 12, borderRadius: 2, background: `rgba(59, 91, 219, 0.5)` }} />
                <span style={{ fontSize: 10, color: "var(--balboa-text-muted)" }}>Medium</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 12, height: 12, borderRadius: 2, background: `rgba(59, 91, 219, 0.8)` }} />
                <span style={{ fontSize: 10, color: "var(--balboa-text-muted)" }}>High</span>
              </div>
              <span style={{ fontSize: 10, color: "var(--balboa-text-light)", marginLeft: "auto" }}>
                Values show {timingChannel === "email" ? "reply" : "response"} rate
              </span>
            </div>
          </div>

          {/* Best slots summary */}
          <div style={{ marginTop: 16 }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <TrendingUp className="w-3.5 h-3.5" /> Top Performing Slots
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {timingData
                .sort((a, b) => b.replyRate - a.replyRate)
                .slice(0, 3)
                .map((t, i) => (
                  <div key={t.slot} className="card" style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 22, height: 22, borderRadius: 6, background: i === 0 ? "var(--balboa-yellow)" : "var(--balboa-bg-alt)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: i === 0 ? "white" : "var(--balboa-text-muted)" }}>
                        {i + 1}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-navy)" }}>{t.slot}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
                      <span style={{ color: "var(--balboa-text-muted)" }}>n={t.sampleSize}</span>
                      <span style={{ fontWeight: 700, color: "var(--balboa-green)" }}>{t.replyRate}% reply</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
