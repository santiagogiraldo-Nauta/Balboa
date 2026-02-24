"use client";

import { useState, useMemo } from "react";
import type { Lead, Deal, BuyerJourneyStage } from "@/lib/types";

// ─── Stage definitions ────────────────────────────────────────

interface StageConfig {
  id: BuyerJourneyStage;
  label: string;
  color: string;
  bgLight: string;
  description: string;
  recommendedActions: string[];
}

const STAGES: StageConfig[] = [
  {
    id: "unaware",
    label: "Unaware",
    color: "#868e96",
    bgLight: "#f8f9fa",
    description: "Lead has not been contacted yet and is at the very start of the pipeline.",
    recommendedActions: [
      "Send an initial LinkedIn connection request",
      "Add to a cold outreach email sequence",
      "Research their company for personalization hooks",
    ],
  },
  {
    id: "problem_aware",
    label: "Problem Aware",
    color: "#f59f00",
    bgLight: "#fff9db",
    description: "Lead is aware of the problem space but may not know about your solution.",
    recommendedActions: [
      "Share educational content about the problem space",
      "Send a case study showing the cost of inaction",
      "Engage with their LinkedIn posts on related topics",
    ],
  },
  {
    id: "solution_aware",
    label: "Solution Aware",
    color: "#3b5bdb",
    bgLight: "#dbe4ff",
    description: "Lead knows solutions exist and has engaged with your outreach.",
    recommendedActions: [
      "Send a product walkthrough video (Loom)",
      "Share a comparison guide against alternatives",
      "Offer a personalized demo tailored to their use case",
    ],
  },
  {
    id: "evaluating",
    label: "Evaluating",
    color: "#7c3aed",
    bgLight: "#ede9fe",
    description: "Lead is actively evaluating you alongside competitors.",
    recommendedActions: [
      "Prepare a competitive battle card",
      "Introduce a champion or reference customer",
      "Schedule a technical deep-dive with their team",
    ],
  },
  {
    id: "decision",
    label: "Decision",
    color: "#e03131",
    bgLight: "#ffe3e3",
    description: "Lead is close to making a final purchase decision.",
    recommendedActions: [
      "Send a customized ROI analysis",
      "Offer a limited pilot or POC",
      "Loop in executive sponsor for a CXO-to-CXO call",
    ],
  },
  {
    id: "customer",
    label: "Customer",
    color: "#2b8a3e",
    bgLight: "#d3f9d8",
    description: "Deal closed. Focus on retention and expansion.",
    recommendedActions: [
      "Send an onboarding welcome kit",
      "Schedule a 30-day check-in call",
      "Identify expansion and upsell opportunities",
    ],
  },
];

// ─── Stage detection ──────────────────────────────────────────

function detectStage(lead: Lead, deals: Deal[]): BuyerJourneyStage {
  // Customer: deal with dealStage === "closed_won"
  const leadDeals = deals.filter((d) => d.leadId === lead.id);
  if (leadDeals.some((d) => d.dealStage === "closed_won")) return "customer";

  // Decision: deals associated or status === "opportunity" && contactStatus === "positive"
  if (leadDeals.length > 0) return "decision";
  if (lead.status === "opportunity" && lead.contactStatus === "positive") return "decision";

  // Evaluating: status === "opportunity" || meetingScheduled === true
  if (lead.status === "opportunity" || lead.meetingScheduled === true) return "evaluating";

  // Solution Aware: status === "engaged" && draftMessages.some(d => d.status === "sent")
  if (lead.status === "engaged" && lead.draftMessages.some((d) => d.status === "sent")) return "solution_aware";

  // Problem Aware: status === "researched" || (status === "new" && contactStatus !== "not_contacted")
  if (lead.status === "researched") return "problem_aware";
  if (lead.status === "new" && lead.contactStatus !== "not_contacted") return "problem_aware";

  // Unaware: status === "new" && contactStatus === "not_contacted"
  return "unaware";
}

// ─── Component ────────────────────────────────────────────────

interface BuyerJourneyMapProps {
  leads: Lead[];
  deals: Deal[];
  onNavigateToLead: (leadId: string) => void;
  selectedLead?: Lead | null;
}

export default function BuyerJourneyMap({
  leads,
  deals,
  onNavigateToLead,
  selectedLead,
}: BuyerJourneyMapProps) {
  const [activeStageId, setActiveStageId] = useState<BuyerJourneyStage | null>(null);

  // Map each lead to its stage
  const leadStages = useMemo(() => {
    const map = new Map<string, BuyerJourneyStage>();
    leads.forEach((lead) => {
      map.set(lead.id, detectStage(lead, deals));
    });
    return map;
  }, [leads, deals]);

  // Count per stage
  const stageCounts = useMemo(() => {
    const counts: Record<BuyerJourneyStage, number> = {
      unaware: 0,
      problem_aware: 0,
      solution_aware: 0,
      evaluating: 0,
      decision: 0,
      customer: 0,
    };
    leadStages.forEach((stage) => {
      counts[stage]++;
    });
    return counts;
  }, [leadStages]);

  // Selected lead's stage
  const selectedLeadStage = selectedLead ? leadStages.get(selectedLead.id) : undefined;

  // Leads in the active stage
  const leadsInActiveStage = useMemo(() => {
    if (!activeStageId) return [];
    return leads.filter((l) => leadStages.get(l.id) === activeStageId);
  }, [activeStageId, leads, leadStages]);

  // Active stage config
  const activeStageConfig = STAGES.find((s) => s.id === activeStageId);

  return (
    <div style={{ padding: "24px 32px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1e2a5e", marginBottom: 4 }}>
          Buyer Journey Map
        </h2>
        <p style={{ fontSize: 13, color: "#868e96" }}>
          Visualize where your leads are in the buying process. Click a stage to see leads and recommended actions.
        </p>
      </div>

      {/* Pipeline visualization */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 32,
          position: "relative",
        }}
      >
        {STAGES.map((stage, idx) => {
          const count = stageCounts[stage.id];
          const isSelected = activeStageId === stage.id;
          const isLeadStage = selectedLeadStage === stage.id;

          return (
            <div
              key={stage.id}
              style={{ flex: 1, position: "relative", cursor: "pointer" }}
              onClick={() => setActiveStageId(isSelected ? null : stage.id)}
            >
              {/* Stage pill */}
              <div
                style={{
                  background: isSelected ? stage.color : stage.bgLight,
                  color: isSelected ? "white" : stage.color,
                  borderRadius: idx === 0 ? "12px 0 0 12px" : idx === STAGES.length - 1 ? "0 12px 12px 0" : 0,
                  padding: "14px 12px",
                  textAlign: "center",
                  transition: "all 0.2s ease",
                  border: `2px solid ${isSelected ? stage.color : "transparent"}`,
                  position: "relative",
                  minHeight: 72,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    lineHeight: 1,
                    marginBottom: 4,
                  }}
                >
                  {count}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {stage.label}
                </div>

                {/* Arrow connector between pills */}
                {idx < STAGES.length - 1 && (
                  <div
                    style={{
                      position: "absolute",
                      right: -7,
                      top: "50%",
                      transform: "translateY(-50%)",
                      zIndex: 2,
                      fontSize: 14,
                      color: "#868e96",
                    }}
                  >
                    {"\u25B6"}
                  </div>
                )}
              </div>

              {/* Selected lead indicator */}
              {isLeadStage && selectedLead && (
                <div
                  style={{
                    position: "absolute",
                    bottom: -20,
                    left: "50%",
                    transform: "translateX(-50%)",
                    fontSize: 14,
                    color: stage.color,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  {"\u25B2"} {selectedLead.firstName}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected lead info banner */}
      {selectedLead && selectedLeadStage && (
        <div
          style={{
            background: "white",
            border: `1px solid ${STAGES.find((s) => s.id === selectedLeadStage)?.color || "#f1f3f5"}`,
            borderRadius: 12,
            padding: "14px 20px",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: STAGES.find((s) => s.id === selectedLeadStage)?.color,
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1e2a5e" }}>
              {selectedLead.firstName} {selectedLead.lastName}
            </span>
            <span style={{ fontSize: 12, color: "#868e96", marginLeft: 8 }}>
              {selectedLead.company} -- Currently in{" "}
              <strong style={{ color: STAGES.find((s) => s.id === selectedLeadStage)?.color }}>
                {STAGES.find((s) => s.id === selectedLeadStage)?.label}
              </strong>
            </span>
          </div>
          <button
            onClick={() => onNavigateToLead(selectedLead.id)}
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: "6px 14px",
              borderRadius: 8,
              border: "none",
              background: "#3b5bdb",
              color: "white",
              cursor: "pointer",
            }}
          >
            View Lead
          </button>
        </div>
      )}

      {/* Expanded stage detail */}
      {activeStageConfig && (
        <div
          style={{
            background: "white",
            borderRadius: 12,
            border: "1px solid #f1f3f5",
            overflow: "hidden",
          }}
        >
          {/* Stage header */}
          <div
            style={{
              background: activeStageConfig.bgLight,
              padding: "16px 24px",
              borderBottom: "1px solid #f1f3f5",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: activeStageConfig.color,
                }}
              />
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1e2a5e" }}>
                {activeStageConfig.label}
              </h3>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  background: activeStageConfig.color,
                  color: "white",
                  borderRadius: 9999,
                  padding: "2px 10px",
                }}
              >
                {stageCounts[activeStageConfig.id]} leads
              </span>
            </div>
            <p style={{ fontSize: 13, color: "#868e96" }}>{activeStageConfig.description}</p>
          </div>

          <div style={{ display: "flex" }}>
            {/* Leads list */}
            <div style={{ flex: 1, padding: 20, borderRight: "1px solid #f1f3f5", minHeight: 200 }}>
              <h4
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#868e96",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 12,
                }}
              >
                Leads in this stage
              </h4>

              {leadsInActiveStage.length === 0 ? (
                <p style={{ fontSize: 13, color: "#868e96", textAlign: "center", padding: 24 }}>
                  No leads currently in this stage.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {leadsInActiveStage.map((lead) => {
                    const isHighlighted = selectedLead?.id === lead.id;
                    return (
                      <div
                        key={lead.id}
                        onClick={() => onNavigateToLead(lead.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "10px 14px",
                          borderRadius: 10,
                          cursor: "pointer",
                          background: isHighlighted ? `${activeStageConfig.color}10` : "#f8f9fa",
                          border: isHighlighted
                            ? `2px solid ${activeStageConfig.color}`
                            : "1px solid #f1f3f5",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {/* Score circle */}
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            background:
                              lead.icpScore.tier === "hot"
                                ? "#ffe3e3"
                                : lead.icpScore.tier === "warm"
                                ? "#fff9db"
                                : "#dbe4ff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 700,
                            color:
                              lead.icpScore.tier === "hot"
                                ? "#e03131"
                                : lead.icpScore.tier === "warm"
                                ? "#f59f00"
                                : "#3b5bdb",
                            flexShrink: 0,
                          }}
                        >
                          {lead.icpScore.overall}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1e2a5e" }}>
                            {lead.firstName} {lead.lastName}
                          </div>
                          <div style={{ fontSize: 11, color: "#868e96" }}>
                            {lead.position} at {lead.company}
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 500,
                            padding: "2px 8px",
                            borderRadius: 6,
                            background:
                              lead.contactStatus === "positive"
                                ? "#d3f9d8"
                                : lead.contactStatus === "negative"
                                ? "#ffe3e3"
                                : lead.contactStatus === "neutral"
                                ? "#fff9db"
                                : "#f8f9fa",
                            color:
                              lead.contactStatus === "positive"
                                ? "#2b8a3e"
                                : lead.contactStatus === "negative"
                                ? "#e03131"
                                : lead.contactStatus === "neutral"
                                ? "#f59f00"
                                : "#868e96",
                          }}
                        >
                          {lead.contactStatus.replace("_", " ")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recommended actions */}
            <div style={{ flex: "0 0 300px", padding: 20 }}>
              <h4
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#868e96",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 12,
                }}
              >
                Recommended Actions
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {activeStageConfig.recommendedActions.map((action, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: "#f8f9fa",
                      border: "1px solid #f1f3f5",
                    }}
                  >
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: activeStageConfig.color,
                        color: "white",
                        fontSize: 11,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {idx + 1}
                    </span>
                    <p style={{ fontSize: 12, color: "#495057", lineHeight: 1.5 }}>{action}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No stage selected hint */}
      {!activeStageConfig && (
        <div
          style={{
            textAlign: "center",
            padding: 48,
            background: "white",
            borderRadius: 12,
            border: "1px solid #f1f3f5",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>
            {"\uD83D\uDDFA\uFE0F"}
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1e2a5e", marginBottom: 8 }}>
            Click a stage above to explore
          </h3>
          <p style={{ fontSize: 13, color: "#868e96", maxWidth: 400, margin: "0 auto" }}>
            Select any stage in the pipeline to see leads at that point in the buyer journey, along with the recommended next actions.
          </p>
        </div>
      )}
    </div>
  );
}
