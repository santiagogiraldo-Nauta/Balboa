"use client";

import React, { useState, useMemo } from "react";
import {
  BarChart3, Users, Mail, Phone, TrendingUp, ArrowRight, ArrowDown,
  Target, Zap, CheckCircle, AlertCircle, Clock, Filter,
} from "lucide-react";
import { STRATEGIC_PRIORITIES, BUSINESS_CHALLENGES, PERSONA_OPENERS } from "@/lib/rocket-constants";
import type { Lead } from "@/lib/types";

// ─── Types ──────────────────────────────────────────────────────

type AnalyticsSubTab = "funnel" | "sequence" | "intelligence";

// ─── Props ──────────────────────────────────────────────────────

interface AnalyticsDashboardProps {
  leads: Lead[];
}

// ─── Component ──────────────────────────────────────────────────

export default function AnalyticsDashboard({ leads }: AnalyticsDashboardProps) {
  const [subTab, setSubTab] = useState<AnalyticsSubTab>("funnel");

  // ── Funnel Stats ──────────────────────────────────────────────

  const funnelStats = useMemo(() => {
    const total = leads.length;
    const newLeads = leads.filter((l) => l.status === "new").length;
    const researched = leads.filter((l) => l.status === "researched").length;
    const engaged = leads.filter((l) => l.status === "engaged").length;
    const opportunity = leads.filter((l) => l.status === "opportunity").length;
    const nurture = leads.filter((l) => l.status === "nurture").length;

    return [
      { label: "Total Leads", count: total, color: "#3b82f6", pct: 100 },
      { label: "New", count: newLeads, color: "#64748b", pct: total > 0 ? Math.round((newLeads / total) * 100) : 0 },
      { label: "Researched", count: researched, color: "#0ea5e9", pct: total > 0 ? Math.round((researched / total) * 100) : 0 },
      { label: "Engaged", count: engaged, color: "#8b5cf6", pct: total > 0 ? Math.round((engaged / total) * 100) : 0 },
      { label: "Opportunity", count: opportunity, color: "#f59e0b", pct: total > 0 ? Math.round((opportunity / total) * 100) : 0 },
      { label: "Nurture", count: nurture, color: "#10b981", pct: total > 0 ? Math.round((nurture / total) * 100) : 0 },
    ];
  }, [leads]);

  // ── SP/BC Distribution ────────────────────────────────────────

  const spbcDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    for (const lead of leads) {
      const intel = lead.companyIntel;
      const category = intel?.industry || "Unclassified";
      dist[category] = (dist[category] || 0) + 1;
    }
    return Object.entries(dist).sort((a, b) => b[1] - a[1]);
  }, [leads]);

  // ── Persona Distribution ──────────────────────────────────────

  const personaDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    for (const lead of leads) {
      const pos = (lead.position || "").toLowerCase();
      let persona = "Other";
      if (/procurement|purchasing|cpo/i.test(pos)) persona = "VP Procurement";
      else if (/supply chain|csco|logistics director/i.test(pos)) persona = "VP Supply Chain";
      else if (/cfo|controller|finance/i.test(pos)) persona = "CFO";
      else if (/coo|ceo|owner|president/i.test(pos)) persona = "COO/CEO";
      else if (/import|logistics manager|freight/i.test(pos)) persona = "Import Manager";
      else if (/director/i.test(pos)) persona = "Director";
      else if (/vp|vice president/i.test(pos)) persona = "VP";
      else if (/manager/i.test(pos)) persona = "Manager";
      dist[persona] = (dist[persona] || 0) + 1;
    }
    return Object.entries(dist).sort((a, b) => b[1] - a[1]);
  }, [leads]);

  // ── Key Metrics ───────────────────────────────────────────────

  const keyMetrics = useMemo(() => {
    const contacted = leads.filter((l) => l.status === "engaged" || l.status === "opportunity").length;
    const replied = leads.filter((l) => l.status === "opportunity").length;
    const meetings = leads.filter((l) => l.status === "opportunity").length;

    return {
      replyRate: contacted > 0 ? Math.round((replied / contacted) * 100) : 0,
      meetingRate: contacted > 0 ? Math.round((meetings / contacted) * 100) : 0,
      totalContacted: contacted,
      totalReplied: replied,
    };
  }, [leads]);

  // ── Render ────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Sub-tab bar */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20 }}>
        {[
          { key: "funnel" as const, label: "Pipeline Funnel", icon: <TrendingUp size={13} /> },
          { key: "sequence" as const, label: "Performance", icon: <BarChart3 size={13} /> },
          { key: "intelligence" as const, label: "Intelligence", icon: <Zap size={13} /> },
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
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── PIPELINE FUNNEL ────────────────────────────────────────── */}
      {subTab === "funnel" && (
        <div>
          {/* Key metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
            {[
              { label: "Total Leads", value: leads.length, icon: <Users size={14} />, color: "#3b82f6" },
              { label: "Reply Rate", value: `${keyMetrics.replyRate}%`, icon: <Mail size={14} />, color: "#8b5cf6" },
              { label: "Meeting Rate", value: `${keyMetrics.meetingRate}%`, icon: <Target size={14} />, color: "#f59e0b" },
              { label: "Contacted", value: keyMetrics.totalContacted, icon: <Phone size={14} />, color: "#0ea5e9" },
            ].map((m) => (
              <div key={m.label} style={{
                padding: 16, borderRadius: 10, background: "white",
                border: "1px solid #e2e8f0",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ color: m.color }}>{m.icon}</span>
                  <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{m.label}</span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "var(--balboa-navy)" }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Visual funnel */}
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 12 }}>
              Pipeline Funnel
            </h4>
            {funnelStats.map((stage, i) => (
              <div key={stage.label} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "8px 0",
              }}>
                <div style={{ width: 110, fontSize: 12, fontWeight: 500, color: "#64748b", textAlign: "right" }}>
                  {stage.label}
                </div>
                <div style={{ flex: 1, height: 24, background: "#f1f5f9", borderRadius: 6, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 6, transition: "width 0.5s ease",
                    width: `${Math.max(stage.pct, 2)}%`,
                    background: stage.color,
                    display: "flex", alignItems: "center", paddingLeft: 8,
                  }}>
                    {stage.count > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "white" }}>{stage.count}</span>
                    )}
                  </div>
                </div>
                <div style={{ width: 40, fontSize: 11, fontWeight: 600, color: "#64748b", textAlign: "right" }}>
                  {stage.pct}%
                </div>
              </div>
            ))}
          </div>

          {/* SP/BC Distribution */}
          {spbcDistribution.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 12 }}>
                SP/BC Distribution
              </h4>
              <div style={{ display: "grid", gap: 6 }}>
                {spbcDistribution.slice(0, 8).map(([category, count]) => {
                  const spDef = STRATEGIC_PRIORITIES[category as keyof typeof STRATEGIC_PRIORITIES];
                  const bcDef = BUSINESS_CHALLENGES[category as keyof typeof BUSINESS_CHALLENGES];
                  const color = spDef?.color || bcDef?.color || "#94a3b8";
                  const label = spDef?.label || bcDef?.label || category;
                  return (
                    <div key={category} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 12px", borderRadius: 8, background: "white", border: "1px solid #e2e8f0",
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: 4, background: color }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-navy)", flex: 1 }}>
                        {category}: {label}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SEQUENCE PERFORMANCE ────────────────────────────────────── */}
      {subTab === "sequence" && (
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 4 }}>
            Sequence Performance
          </h3>
          <p style={{ fontSize: 12, color: "#64748b", marginBottom: 20 }}>
            Breakdown by persona and segment.
          </p>

          {/* Persona breakdown */}
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 12 }}>
              By Persona
            </h4>
            <div style={{ display: "grid", gap: 8 }}>
              {personaDistribution.map(([persona, count]) => (
                <div key={persona} style={{
                  padding: 14, borderRadius: 10, border: "1px solid #e2e8f0", background: "white",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-navy)" }}>{persona}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{count} leads</div>
                  </div>
                  <div style={{ display: "flex", gap: 16 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#3b82f6" }}>—</div>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>Open</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#8b5cf6" }}>—</div>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>Reply</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#f59e0b" }}>—</div>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>Meeting</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {leads.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
              <BarChart3 size={32} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
              <p style={{ fontSize: 14, fontWeight: 600 }}>No sequence data yet</p>
              <p style={{ fontSize: 12, marginTop: 4 }}>
                Performance metrics will populate as sequences run and leads engage.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── CALL INTELLIGENCE ──────────────────────────────────────── */}
      {subTab === "intelligence" && (
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 4 }}>
            Call Intelligence
          </h3>
          <p style={{ fontSize: 12, color: "#64748b", marginBottom: 20 }}>
            Insights from call outcomes and competitive mentions.
          </p>

          <div style={{
            padding: 40, textAlign: "center", borderRadius: 12,
            background: "#f8fafc", border: "1px solid #e2e8f0",
          }}>
            <Zap size={32} style={{ color: "#94a3b8", margin: "0 auto 12px", opacity: 0.5 }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: "#64748b" }}>
              Call Intelligence Coming Soon
            </p>
            <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, maxWidth: 360, margin: "4px auto 0" }}>
              As you log call outcomes in the Execute tab, this section will surface top objections,
              competitor mentions, and common pain points across your pipeline.
            </p>

            {/* Preview of what's coming */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 24 }}>
              {[
                { label: "Top Objections", desc: "Track and counter common objections", icon: <AlertCircle size={16} /> },
                { label: "Competitor Mentions", desc: "Which competitors come up most", icon: <Target size={16} /> },
                { label: "Weekly Summary", desc: "Automated insights digest", icon: <Clock size={16} /> },
              ].map((item) => (
                <div key={item.label} style={{
                  padding: 14, borderRadius: 8, background: "white", border: "1px solid #e2e8f0",
                }}>
                  <div style={{ color: "#94a3b8", marginBottom: 6 }}>{item.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>{item.label}</div>
                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
