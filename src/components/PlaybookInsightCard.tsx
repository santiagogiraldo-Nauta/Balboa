"use client";

import { useState } from "react";
import { TrendingUp, Minus, TrendingDown, ChevronDown, Lightbulb, Zap } from "lucide-react";
import type { PlaybookInsight } from "@/lib/types";

interface PlaybookInsightCardProps {
  insight: PlaybookInsight;
}

export default function PlaybookInsightCard({ insight }: PlaybookInsightCardProps) {
  const [expanded, setExpanded] = useState(false);

  const TrendIcon = insight.trend === "improving" ? TrendingUp : insight.trend === "declining" ? TrendingDown : Minus;
  const trendClass = insight.trend === "improving" ? "trend-up" : insight.trend === "declining" ? "trend-down" : "trend-stable";

  return (
    <div className={`insight-card insight-card-${insight.category}`} onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer" }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 4, lineHeight: 1.3 }}>
            {insight.title}
          </h4>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--balboa-blue)" }}>{insight.metric}</span>
            <span className={`confidence-dot ${insight.confidence}`} />
            <span style={{ fontSize: 10, color: "var(--balboa-text-muted)" }}>{insight.confidence} confidence</span>
            <span className={trendClass} style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 10 }}>
              <TrendIcon className="w-3 h-3" /> {insight.trend}
            </span>
            <span style={{ fontSize: 10, color: "var(--balboa-text-light)" }}>n={insight.sampleSize}</span>
          </div>
        </div>
        <ChevronDown className="w-4 h-4" style={{
          color: "var(--balboa-text-light)", flexShrink: 0, marginTop: 2,
          transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s",
        }} />
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="fade-in" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--balboa-border-light)" }}>
          <p style={{ fontSize: 12, color: "var(--balboa-text-secondary)", lineHeight: 1.5, marginBottom: 10 }}>
            {insight.description}
          </p>
          <div style={{ background: "var(--balboa-bg-alt)", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12 }}>
              <Lightbulb className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--balboa-orange)", marginTop: 1 }} />
              <span style={{ color: "var(--balboa-text-secondary)", fontWeight: 500 }}>{insight.actionable}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Zap className="w-3 h-3" style={{ color: "var(--balboa-text-light)" }} />
            <span style={{ fontSize: 10, color: "var(--balboa-text-muted)" }}>Source: {insight.dataSource}</span>
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
            {insight.tags.map((tag) => (
              <span key={tag} style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 10,
                background: "rgba(30,42,94,0.06)", color: "var(--balboa-navy)",
              }}>{tag}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
