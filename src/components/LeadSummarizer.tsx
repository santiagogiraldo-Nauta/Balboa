"use client";

import { useState } from "react";
import { trackEventClient } from "@/lib/tracking";
import type { Lead, SupportedLanguage, LeadSummary } from "@/lib/types";

interface LeadSummarizerProps {
  lead: Lead;
  language: SupportedLanguage;
}

export default function LeadSummarizer({ lead, language }: LeadSummarizerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<LeadSummary | null>(null);

  const handleSummarize = async () => {
    if (summary) {
      if (isExpanded) {
        trackEventClient({ eventCategory: "analysis", eventAction: "lead_summary_collapsed", leadId: lead.id });
      } else {
        trackEventClient({ eventCategory: "analysis", eventAction: "lead_summary_expanded", leadId: lead.id });
      }
      setIsExpanded(!isExpanded);
      return;
    }
    trackEventClient({ eventCategory: "analysis", eventAction: "lead_summary_requested", leadId: lead.id });
    setIsExpanded(true);
    setIsLoading(true);
    try {
      const res = await fetch("/api/summarize-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead, language }),
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data.result as LeadSummary);
      }
    } catch (err) {
      console.error("Lead summarize error:", err);
    }
    setIsLoading(false);
  };

  const sentimentColor = (s: "positive" | "neutral" | "negative") => {
    if (s === "positive") return "#2b8a3e";
    if (s === "negative") return "#e03131";
    return "#adb5bd";
  };

  const channelIcon = (channel: string) => {
    switch (channel) {
      case "email": return "\u2709";
      case "linkedin": return "\uD83D\uDD17";
      case "call": return "\uD83D\uDCDE";
      case "sms": return "\uD83D\uDCF1";
      case "whatsapp": return "\uD83D\uDCAC";
      default: return "\u25CB";
    }
  };

  if (!isExpanded) {
    return (
      <button
        onClick={handleSummarize}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 8,
          border: "1px solid #e9ecef",
          background: "linear-gradient(135deg, #f8f9fa 0%, #fff 100%)",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          color: "#1e2a5e",
          transition: "all 0.15s ease",
        }}
      >
        <span style={{ fontSize: 14 }}>{"\u26A1"}</span>
        Summarize Lead
      </button>
    );
  }

  return (
    <div
      style={{
        border: "1px solid #e9ecef",
        borderRadius: 12,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 14px",
          background: "linear-gradient(135deg, #1e2a5e 0%, #3b5bdb 100%)",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>
          {"\u26A1"} Lead Summary
        </div>
        <button
          onClick={() => {
            trackEventClient({ eventCategory: "analysis", eventAction: "lead_summary_collapsed", leadId: lead.id });
            setIsExpanded(false);
          }}
          style={{
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.7)",
            cursor: "pointer",
            fontSize: 14,
            padding: "0 2px",
            lineHeight: 1,
          }}
        >
          &minus;
        </button>
      </div>

      <div style={{ padding: "12px 14px" }}>
        {isLoading ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div
              style={{
                width: 22,
                height: 22,
                border: "2px solid #e9ecef",
                borderTopColor: "#3b5bdb",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 8px",
              }}
            />
            <div style={{ fontSize: 11, color: "#868e96" }}>Analyzing lead data...</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : summary ? (
          <>
            {/* Executive Summary */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#1e2a5e", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                Executive Summary
              </div>
              <p style={{ fontSize: 12, color: "#495057", lineHeight: 1.6, margin: 0 }}>
                {summary.executiveSummary}
              </p>
            </div>

            {/* Sentiment Timeline */}
            {summary.sentimentTimeline && summary.sentimentTimeline.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#1e2a5e", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                  Sentiment Timeline
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                  {summary.sentimentTimeline.map((entry, i) => (
                    <div
                      key={i}
                      title={`${entry.date}: ${entry.reason}`}
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: sentimentColor(entry.sentiment),
                        cursor: "help",
                        transition: "transform 0.15s ease",
                      }}
                      onMouseEnter={(e) => { (e.target as HTMLElement).style.transform = "scale(1.4)"; }}
                      onMouseLeave={(e) => { (e.target as HTMLElement).style.transform = "scale(1)"; }}
                    />
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <span style={{ fontSize: 9, color: "#868e96" }}>{"\u25CF"} <span style={{ color: "#2b8a3e" }}>Positive</span></span>
                  <span style={{ fontSize: 9, color: "#868e96" }}>{"\u25CF"} <span style={{ color: "#adb5bd" }}>Neutral</span></span>
                  <span style={{ fontSize: 9, color: "#868e96" }}>{"\u25CF"} <span style={{ color: "#e03131" }}>Negative</span></span>
                </div>
              </div>
            )}

            {/* Key Milestones */}
            {summary.keyMilestones && summary.keyMilestones.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#1e2a5e", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                  Key Milestones
                </div>
                <ul style={{ margin: 0, padding: "0 0 0 14px", listStyle: "disc" }}>
                  {summary.keyMilestones.map((m, i) => (
                    <li key={i} style={{ fontSize: 11, color: "#495057", lineHeight: 1.5, marginBottom: 1 }}>
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Channel Stats */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#1e2a5e", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                Channel Activity
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[
                  { label: "Email", icon: channelIcon("email"), count: summary.totalEmails },
                  { label: "LinkedIn", icon: channelIcon("linkedin"), count: summary.totalLinkedIn },
                  { label: "Calls", icon: channelIcon("call"), count: summary.totalCalls },
                  { label: "SMS", icon: channelIcon("sms"), count: summary.totalSms },
                  { label: "WhatsApp", icon: channelIcon("whatsapp"), count: summary.totalWhatsApp },
                ].map((ch, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: "#f8f9fa",
                      border: "1px solid #e9ecef",
                      fontSize: 11,
                      color: "#495057",
                    }}
                  >
                    <span style={{ fontSize: 12 }}>{ch.icon}</span>
                    <span style={{ fontWeight: 600 }}>{ch.count}</span>
                    <span style={{ color: "#868e96", fontSize: 10 }}>{ch.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Response Metrics */}
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1, padding: "8px 10px", borderRadius: 8, background: "#f8f9fa", border: "1px solid #e9ecef" }}>
                <div style={{ fontSize: 10, color: "#868e96", marginBottom: 2 }}>Response Rate</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1e2a5e" }}>
                  {Math.round(summary.responseRate * 100)}%
                </div>
              </div>
              <div style={{ flex: 1, padding: "8px 10px", borderRadius: 8, background: "#f8f9fa", border: "1px solid #e9ecef" }}>
                <div style={{ fontSize: 10, color: "#868e96", marginBottom: 2 }}>Avg Response</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1e2a5e" }}>
                  {summary.avgResponseTime}
                </div>
              </div>
              <div style={{ flex: 1, padding: "8px 10px", borderRadius: 8, background: "#f8f9fa", border: "1px solid #e9ecef" }}>
                <div style={{ fontSize: 10, color: "#868e96", marginBottom: 2 }}>Touchpoints</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1e2a5e" }}>
                  {summary.totalTouchpoints}
                </div>
              </div>
            </div>

            {/* Call Recording Highlights */}
            {summary.callRecordingHighlights && summary.callRecordingHighlights.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#1e2a5e", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                  Call Highlights
                </div>
                <ul style={{ margin: 0, padding: "0 0 0 14px", listStyle: "disc" }}>
                  {summary.callRecordingHighlights.map((h, i) => (
                    <li key={i} style={{ fontSize: 11, color: "#495057", lineHeight: 1.5, marginBottom: 1 }}>
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Next Recommended Action */}
            <div
              style={{
                marginBottom: 12,
                padding: "8px 12px",
                borderRadius: 8,
                background: "rgba(59,91,219,0.06)",
                border: "1px solid rgba(59,91,219,0.15)",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: "#3b5bdb", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                Next Recommended Action
              </div>
              <div style={{ fontSize: 12, color: "#1e2a5e", fontWeight: 500 }}>
                {summary.nextRecommendedAction}
              </div>
            </div>

            {/* Deal Probability Bar */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#1e2a5e", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Deal Probability
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: summary.dealProbability >= 0.6 ? "#2b8a3e" : summary.dealProbability >= 0.3 ? "#f59f00" : "#e03131" }}>
                  {Math.round(summary.dealProbability * 100)}%
                </div>
              </div>
              <div style={{ width: "100%", height: 6, borderRadius: 3, background: "#e9ecef", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.round(summary.dealProbability * 100)}%`,
                    height: "100%",
                    borderRadius: 3,
                    background: summary.dealProbability >= 0.6
                      ? "linear-gradient(90deg, #2b8a3e, #40c057)"
                      : summary.dealProbability >= 0.3
                        ? "linear-gradient(90deg, #f59f00, #fcc419)"
                        : "linear-gradient(90deg, #e03131, #ff6b6b)",
                    transition: "width 0.6s ease",
                  }}
                />
              </div>
            </div>

            {/* Risk Factors */}
            {summary.riskFactors && summary.riskFactors.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#e03131", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                  Risk Factors
                </div>
                {summary.riskFactors.map((risk, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      background: "rgba(224,49,49,0.06)",
                      border: "1px solid rgba(224,49,49,0.15)",
                      marginBottom: 4,
                      fontSize: 11,
                      color: "#c92a2a",
                      lineHeight: 1.4,
                    }}
                  >
                    {"\u26A0"} {risk}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "16px 0", fontSize: 12, color: "#868e96" }}>
            Failed to load summary. Try again.
          </div>
        )}
      </div>
    </div>
  );
}
