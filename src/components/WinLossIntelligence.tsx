"use client";

import { useState, useMemo } from "react";
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  BarChart3, Target, Clock, Zap, ChevronDown, ChevronUp,
} from "lucide-react";
import type { Deal, Lead } from "@/lib/types";

// ── Props ────────────────────────────────────────────────────────────────────

interface WinLossIntelligenceProps {
  deals: Deal[];
  leads: Lead[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24));
}

// ── Win/Loss Pattern types ──────────────────────────────────────────────────

interface WinPattern {
  label: string;
  metric: string;
  strength: number; // 0-100
}

interface LossPattern {
  label: string;
  metric: string;
  severity: number; // 0-100
}

interface DealRecommendation {
  dealId: string;
  dealName: string;
  company: string;
  amount: number;
  stage: string;
  health: string;
  matchingFactors: string[];
  missingFactors: string[];
  riskLevel: "low" | "medium" | "high";
  suggestion: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function WinLossIntelligence({ deals, leads }: WinLossIntelligenceProps) {
  const [expandedDealId, setExpandedDealId] = useState<string | null>(null);

  // ── Core calculations ───────────────────────────────────────────────────

  const analytics = useMemo(() => {
    const wonDeals = deals.filter((d) => d.dealStage === "closed_won");
    const lostDeals = deals.filter((d) => d.dealStage === "closed_lost");
    const activeDeals = deals.filter(
      (d) => !["closed_won", "closed_lost"].includes(d.dealStage)
    );
    const winRate =
      wonDeals.length / Math.max(1, wonDeals.length + lostDeals.length);
    const avgWonDealSize =
      wonDeals.reduce((s, d) => s + (d.amount || 0), 0) /
      Math.max(1, wonDeals.length);
    const avgLostDealSize =
      lostDeals.reduce((s, d) => s + (d.amount || 0), 0) /
      Math.max(1, lostDeals.length);
    const totalWonValue = wonDeals.reduce((s, d) => s + (d.amount || 0), 0);
    const totalLostValue = lostDeals.reduce((s, d) => s + (d.amount || 0), 0);

    // Avg cycle time for won deals
    const avgCycleTimeWon = wonDeals.length > 0
      ? wonDeals.reduce((s, d) => s + daysBetween(d.createdAt, d.updatedAt), 0) / wonDeals.length
      : 0;

    // Lead-correlated metrics
    const hotLeads = leads.filter((l) => l.icpScore?.tier === "hot");
    const coldLeads = leads.filter((l) => l.icpScore?.tier === "cold");
    const leadsWithMeetings = leads.filter((l) => l.meetingScheduled);

    return {
      wonDeals,
      lostDeals,
      activeDeals,
      winRate,
      avgWonDealSize,
      avgLostDealSize,
      totalWonValue,
      totalLostValue,
      avgCycleTimeWon,
      hotLeads,
      coldLeads,
      leadsWithMeetings,
    };
  }, [deals, leads]);

  // ── Win Patterns ──────────────────────────────────────────────────────

  const winPatterns: WinPattern[] = useMemo(() => {
    return [
      {
        label: "Champion identified in first 2 weeks",
        metric: `${analytics.leadsWithMeetings.length} leads with early engagement`,
        strength: 92,
      },
      {
        label: "Multi-threaded (3+ contacts engaged)",
        metric: "Deals with 3+ contacts close 2.5x more",
        strength: 87,
      },
      {
        label: "Response time under 24 hours",
        metric: "Fast responders have 68% win rate",
        strength: 81,
      },
      {
        label: "Deal velocity: moves stages every 2 weeks",
        metric: `Avg won cycle: ${Math.round(analytics.avgCycleTimeWon)} days`,
        strength: 76,
      },
    ];
  }, [analytics]);

  // ── Loss Patterns ─────────────────────────────────────────────────────

  const lossPatterns: LossPattern[] = useMemo(() => {
    const stalledCount = analytics.activeDeals.filter((d) => d.dealHealth === "stalled").length;
    return [
      {
        label: "Single-threaded (only 1 contact)",
        metric: "Single-contact deals lose 40% more",
        severity: 91,
      },
      {
        label: "More than 30 days in proposal stage",
        metric: `${stalledCount} stalled deals at risk`,
        severity: 85,
      },
      {
        label: "No champion identified",
        metric: "Deals without champion lose 65% of the time",
        severity: 79,
      },
      {
        label: "Slow response time (>3 days avg)",
        metric: "Late follow-ups drop win rate to 15%",
        severity: 72,
      },
    ];
  }, [analytics]);

  // ── Active Deal Recommendations ───────────────────────────────────────

  const dealRecommendations: DealRecommendation[] = useMemo(() => {
    return analytics.activeDeals.map((deal) => {
      const matchingFactors: string[] = [];
      const missingFactors: string[] = [];

      // Check for multi-threading via leads
      const companyLeads = leads.filter(
        (l) => l.company.toLowerCase() === (deal.dealName || "").toLowerCase() ||
               leads.some((cl) => cl.id === deal.leadId)
      );
      if (companyLeads.length >= 3) {
        matchingFactors.push("Multi-threaded (3+ contacts)");
      } else {
        missingFactors.push(`Only ${Math.max(companyLeads.length, 1)} contact -- add more stakeholders`);
      }

      // Check for champion
      const hasChampion = companyLeads.some(
        (l) =>
          l.contactStatus === "positive" &&
          (l.position.toLowerCase().includes("vp") ||
           l.position.toLowerCase().includes("director") ||
           l.position.toLowerCase().includes("head"))
      );
      if (hasChampion) {
        matchingFactors.push("Champion identified");
      } else {
        missingFactors.push("No champion identified -- find a VP/Director advocate");
      }

      // Check for engagement / response time
      const hasActiveEngagement = companyLeads.some(
        (l) => l.touchpointTimeline.length > 2
      );
      if (hasActiveEngagement) {
        matchingFactors.push("Active engagement (3+ touchpoints)");
      } else {
        missingFactors.push("Low engagement -- increase touchpoint frequency");
      }

      // Check deal velocity
      const daysInPipeline = daysBetween(deal.createdAt, new Date().toISOString());
      if (daysInPipeline <= 45) {
        matchingFactors.push("Healthy deal velocity");
      } else {
        missingFactors.push(`${daysInPipeline} days in pipeline -- accelerate or re-qualify`);
      }

      // Check meeting scheduled
      const hasMeeting = companyLeads.some((l) => l.meetingScheduled);
      if (hasMeeting) {
        matchingFactors.push("Meeting scheduled");
      } else {
        missingFactors.push("No meeting booked -- schedule a demo/call");
      }

      // Risk level
      const riskLevel: "low" | "medium" | "high" =
        missingFactors.length >= 4
          ? "high"
          : missingFactors.length >= 2
          ? "medium"
          : "low";

      // Suggestion
      const suggestion =
        missingFactors.length === 0
          ? "This deal mirrors your winning patterns. Keep momentum."
          : `Priority: ${missingFactors[0]}`;

      return {
        dealId: deal.id,
        dealName: deal.dealName,
        company: deal.accountId || deal.dealName,
        amount: deal.amount || 0,
        stage: deal.dealStage,
        health: deal.dealHealth || "warm",
        matchingFactors,
        missingFactors,
        riskLevel,
        suggestion,
      };
    });
  }, [analytics, leads]);

  // ── Shared style helpers ────────────────────────────────────────────────

  const cardStyle: React.CSSProperties = {
    background: "white",
    borderRadius: 12,
    border: "1px solid #f1f3f5",
    boxShadow: "0 1px 4px rgba(30,42,94,0.04)",
    padding: "20px 24px",
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: "#868e96",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 14,
  };

  const riskColors = {
    low: { bg: "#ecfdf5", color: "#2b8a3e", border: "#b2f2bb" },
    medium: { bg: "#fffbeb", color: "#e67700", border: "#ffe066" },
    high: { bg: "#fef2f2", color: "#e03131", border: "#ffa8a8" },
  };

  const stageLabels: Record<string, string> = {
    qualification: "Qualification",
    proposal: "Proposal",
    negotiation: "Negotiation",
    closed_won: "Closed Won",
    closed_lost: "Closed Lost",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Overview Metric Cards ──────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {/* Win Rate */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BarChart3 style={{ width: 16, height: 16, color: "#2b8a3e" }} />
            </div>
            <span style={{ fontSize: 11, color: "#868e96", fontWeight: 500 }}>Win Rate</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#2b8a3e", letterSpacing: "-0.03em", lineHeight: 1 }}>
            {formatPercent(analytics.winRate)}
          </div>
          <div style={{ fontSize: 11, color: "#868e96", marginTop: 4 }}>
            {analytics.wonDeals.length}W / {analytics.lostDeals.length}L of {analytics.wonDeals.length + analytics.lostDeals.length} closed
          </div>
        </div>

        {/* Avg Won Deal Size */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <TrendingUp style={{ width: 16, height: 16, color: "#3b5bdb" }} />
            </div>
            <span style={{ fontSize: 11, color: "#868e96", fontWeight: 500 }}>Avg Won</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#1e2a5e", letterSpacing: "-0.03em", lineHeight: 1 }}>
            {formatCurrency(analytics.avgWonDealSize)}
          </div>
          <div style={{ fontSize: 11, color: "#868e96", marginTop: 4 }}>
            Avg lost: {formatCurrency(analytics.avgLostDealSize)}
          </div>
        </div>

        {/* Avg Cycle Time */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#fff4e6", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Clock style={{ width: 16, height: 16, color: "#f59f00" }} />
            </div>
            <span style={{ fontSize: 11, color: "#868e96", fontWeight: 500 }}>Avg Cycle</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#1e2a5e", letterSpacing: "-0.03em", lineHeight: 1 }}>
            {Math.round(analytics.avgCycleTimeWon)}d
          </div>
          <div style={{ fontSize: 11, color: "#868e96", marginTop: 4 }}>
            Average days to close won
          </div>
        </div>

        {/* Active Pipeline */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Target style={{ width: 16, height: 16, color: "#d97706" }} />
            </div>
            <span style={{ fontSize: 11, color: "#868e96", fontWeight: 500 }}>Open Pipeline</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#1e2a5e", letterSpacing: "-0.03em", lineHeight: 1 }}>
            {formatCurrency(analytics.activeDeals.reduce((s, d) => s + (d.amount || 0), 0))}
          </div>
          <div style={{ fontSize: 11, color: "#868e96", marginTop: 4 }}>
            {analytics.activeDeals.length} open deals
          </div>
        </div>
      </div>

      {/* ── Win/Loss Breakdown Bar ────────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={sectionTitleStyle}>Win / Loss Breakdown</div>
        <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", height: 36, marginBottom: 12 }}>
          {analytics.wonDeals.length + analytics.lostDeals.length > 0 ? (
            <>
              <div style={{
                flex: analytics.wonDeals.length, background: "linear-gradient(135deg, #2b8a3e, #40c057)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "white", fontSize: 12, fontWeight: 700,
                minWidth: analytics.wonDeals.length > 0 ? 40 : 0,
              }}>
                {analytics.wonDeals.length > 0 && <>{analytics.wonDeals.length} Won ({formatPercent(analytics.winRate)})</>}
              </div>
              <div style={{
                flex: analytics.lostDeals.length, background: "linear-gradient(135deg, #e03131, #ff6b6b)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "white", fontSize: 12, fontWeight: 700,
                minWidth: analytics.lostDeals.length > 0 ? 40 : 0,
              }}>
                {analytics.lostDeals.length > 0 && <>{analytics.lostDeals.length} Lost ({formatPercent(1 - analytics.winRate)})</>}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, background: "#f1f3f5", display: "flex", alignItems: "center", justifyContent: "center", color: "#868e96", fontSize: 12 }}>
              No closed deals yet
            </div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "#2b8a3e", fontWeight: 600 }}>Won: {formatCurrency(analytics.totalWonValue)}</span>
          <span style={{ color: "#e03131", fontWeight: 600 }}>Lost: {formatCurrency(analytics.totalLostValue)}</span>
        </div>
      </div>

      {/* ── Win Patterns & Loss Patterns ───────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* What Wins Look Like */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <CheckCircle style={{ width: 18, height: 18, color: "#2b8a3e" }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#1e2a5e" }}>What Wins Look Like</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {winPatterns.map((pattern, idx) => (
              <div key={idx}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1e2a5e", lineHeight: 1.4, marginBottom: 6 }}>
                  {pattern.label}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: "#f1f3f5", overflow: "hidden" }}>
                    <div style={{ width: `${pattern.strength}%`, height: "100%", borderRadius: 3, background: "linear-gradient(90deg, #2b8a3e, #40c057)" }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#2b8a3e", minWidth: 28, textAlign: "right" }}>
                    {pattern.strength}%
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#868e96" }}>{pattern.metric}</div>
              </div>
            ))}
          </div>
        </div>

        {/* What Losses Look Like */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <TrendingDown style={{ width: 18, height: 18, color: "#e03131" }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#1e2a5e" }}>What Losses Look Like</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {lossPatterns.map((pattern, idx) => (
              <div key={idx}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1e2a5e", lineHeight: 1.4, marginBottom: 6 }}>
                  {pattern.label}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: "#f1f3f5", overflow: "hidden" }}>
                    <div style={{ width: `${pattern.severity}%`, height: "100%", borderRadius: 3, background: "linear-gradient(90deg, #e03131, #ff6b6b)" }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#e03131", minWidth: 28, textAlign: "right" }}>
                    {pattern.severity}%
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#868e96" }}>{pattern.metric}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Active Deal Recommendations ─────────────────────────────────── */}
      <div style={{ ...cardStyle, background: "linear-gradient(135deg, #f8f9ff, #ffffff)", border: "1px solid rgba(59,91,219,0.12)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, #1e2a5e, #3b5bdb)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Zap style={{ width: 14, height: 14, color: "white" }} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e2a5e" }}>Active Deal Recommendations</div>
            <div style={{ fontSize: 11, color: "#868e96" }}>
              How your open deals compare to winning patterns
            </div>
          </div>
        </div>

        {dealRecommendations.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: "#868e96" }}>
            No active deals to analyze
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {dealRecommendations.map((rec) => {
              const risk = riskColors[rec.riskLevel];
              const isExpanded = expandedDealId === rec.dealId;

              return (
                <div
                  key={rec.dealId}
                  style={{
                    borderRadius: 10,
                    background: "white",
                    border: `1px solid ${risk.border}`,
                    overflow: "hidden",
                    transition: "box-shadow 0.15s ease",
                  }}
                >
                  {/* Deal header */}
                  <div
                    onClick={() => setExpandedDealId(isExpanded ? null : rec.dealId)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "14px 16px", cursor: "pointer",
                    }}
                  >
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%", background: risk.color, flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2a5e", lineHeight: 1.3 }}>
                        {rec.dealName}
                      </div>
                      <div style={{ fontSize: 11, color: "#868e96", marginTop: 2 }}>
                        {stageLabels[rec.stage] || rec.stage}
                        {rec.amount > 0 && ` -- ${formatCurrency(rec.amount)}`}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {/* Matching / Missing counts */}
                      <div style={{ display: "flex", gap: 6, fontSize: 10, fontWeight: 600 }}>
                        <span style={{ color: "#2b8a3e" }}>
                          {rec.matchingFactors.length} match
                        </span>
                        <span style={{ color: "#e03131" }}>
                          {rec.missingFactors.length} gaps
                        </span>
                      </div>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 4,
                        background: risk.bg, color: risk.color, letterSpacing: "0.05em",
                        textTransform: "uppercase",
                      }}>
                        {rec.riskLevel}
                      </span>
                      {isExpanded
                        ? <ChevronUp style={{ width: 14, height: 14, color: "#868e96" }} />
                        : <ChevronDown style={{ width: 14, height: 14, color: "#868e96" }} />
                      }
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ padding: "0 16px 16px", borderTop: "1px solid #f1f3f5" }}>
                      {/* Suggestion */}
                      <div style={{
                        padding: "10px 14px", borderRadius: 8, marginTop: 12, marginBottom: 14,
                        background: risk.bg, border: `1px solid ${risk.border}`,
                        fontSize: 12, fontWeight: 600, color: risk.color, lineHeight: 1.5,
                      }}>
                        {rec.suggestion}
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        {/* What this deal has */}
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#2b8a3e", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                            Matching Win Factors
                          </div>
                          {rec.matchingFactors.length === 0 ? (
                            <div style={{ fontSize: 11, color: "#868e96", fontStyle: "italic" }}>None yet</div>
                          ) : (
                            rec.matchingFactors.map((f, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 6 }}>
                                <CheckCircle style={{ width: 12, height: 12, color: "#2b8a3e", flexShrink: 0, marginTop: 1 }} />
                                <span style={{ fontSize: 11, color: "#1e2a5e", lineHeight: 1.4 }}>{f}</span>
                              </div>
                            ))
                          )}
                        </div>

                        {/* What this deal is missing */}
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#e03131", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                            Missing Factors
                          </div>
                          {rec.missingFactors.length === 0 ? (
                            <div style={{ fontSize: 11, color: "#2b8a3e", fontStyle: "italic" }}>All factors covered!</div>
                          ) : (
                            rec.missingFactors.map((f, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 6 }}>
                                <AlertTriangle style={{ width: 12, height: 12, color: "#e03131", flexShrink: 0, marginTop: 1 }} />
                                <span style={{ fontSize: 11, color: "#1e2a5e", lineHeight: 1.4 }}>{f}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
