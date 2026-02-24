"use client";

import { useState, useEffect } from "react";
import { trackEventClient } from "@/lib/tracking";
import type { Lead, SupportedLanguage, DeepResearchResult } from "@/lib/types";

interface DeepResearchPanelProps {
  lead: Lead;
  onClose: () => void;
  language: SupportedLanguage;
}

type ResearchTab = "person" | "company" | "industry" | "competition" | "approach";

const TABS: { key: ResearchTab; label: string }[] = [
  { key: "person", label: "Person" },
  { key: "company", label: "Company" },
  { key: "industry", label: "Industry" },
  { key: "competition", label: "Competition" },
  { key: "approach", label: "Approach" },
];

export default function DeepResearchPanel({ lead, onClose, language }: DeepResearchPanelProps) {
  const [activeTab, setActiveTab] = useState<ResearchTab>("person");
  const [isLoading, setIsLoading] = useState(false);
  const [researchData, setResearchData] = useState<DeepResearchResult | null>(null);
  const [loadedTabs, setLoadedTabs] = useState<Set<ResearchTab>>(new Set());

  useEffect(() => {
    trackEventClient({ eventCategory: "analysis", eventAction: "deep_research_panel_opened", leadId: lead.id });
  }, []);

  const fetchTab = async (tab: ResearchTab) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/research/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, tab, lead, language }),
      });
      if (res.ok) {
        const data = await res.json();
        setResearchData((prev) => {
          const base = prev || ({} as DeepResearchResult);
          return { ...base, ...data.result } as DeepResearchResult;
        });
        setLoadedTabs((prev) => new Set(prev).add(tab));
        trackEventClient({ eventCategory: "analysis", eventAction: "deep_research_tab_completed", leadId: lead.id, metadata: { tab } });
      }
    } catch (err) {
      console.error("Deep research fetch error:", err);
    }
    setIsLoading(false);
  };

  const handleTabClick = (tab: ResearchTab) => {
    setActiveTab(tab);
    trackEventClient({ eventCategory: "analysis", eventAction: "deep_research_tab_clicked", leadId: lead.id, metadata: { tab } });
    if (!loadedTabs.has(tab)) {
      fetchTab(tab);
    }
  };

  const handleResearchAll = async () => {
    trackEventClient({ eventCategory: "analysis", eventAction: "deep_research_all_tabs", leadId: lead.id });
    setIsLoading(true);
    try {
      const res = await fetch("/api/research/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, tab: "all", lead, language }),
      });
      if (res.ok) {
        const data = await res.json();
        setResearchData(data.result as DeepResearchResult);
        setLoadedTabs(new Set(TABS.map((t) => t.key)));
      }
    } catch (err) {
      console.error("Research all error:", err);
    }
    setIsLoading(false);
  };

  const renderBulletList = (items: string[]) => (
    <ul style={{ margin: "4px 0 0 0", padding: "0 0 0 16px", listStyle: "disc" }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontSize: 12, color: "#495057", lineHeight: 1.6, marginBottom: 2 }}>
          {item}
        </li>
      ))}
    </ul>
  );

  const renderCard = (title: string, children: React.ReactNode) => (
    <div
      style={{
        background: "#f8f9fa",
        border: "1px solid #e9ecef",
        borderRadius: 10,
        padding: "12px 14px",
        marginBottom: 10,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "#1e2a5e", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );

  const renderPersonTab = () => {
    if (!researchData?.person) return null;
    const p = researchData.person;
    return (
      <>
        {renderCard("Summary", <p style={{ fontSize: 12, color: "#495057", lineHeight: 1.6, margin: 0 }}>{p.summary}</p>)}
        {renderCard("Career History", renderBulletList(p.careerHistory))}
        {renderCard("Recent Activity", renderBulletList(p.recentActivity))}
        {renderCard("Communication Style", <p style={{ fontSize: 12, color: "#495057", lineHeight: 1.6, margin: 0 }}>{p.communicationStyle}</p>)}
        {renderCard("Motivations", renderBulletList(p.motivations))}
        {renderCard("Decision Drivers", renderBulletList(p.decisionDrivers))}
      </>
    );
  };

  const renderCompanyTab = () => {
    if (!researchData?.company) return null;
    const c = researchData.company;
    return (
      <>
        {renderCard("Overview", <p style={{ fontSize: 12, color: "#495057", lineHeight: 1.6, margin: 0 }}>{c.overview}</p>)}
        {renderCard("Financials", <p style={{ fontSize: 12, color: "#495057", lineHeight: 1.6, margin: 0 }}>{c.financials}</p>)}
        {renderCard("Recent News", renderBulletList(c.recentNews))}
        {renderCard("Strategic Initiatives", renderBulletList(c.strategicInitiatives))}
        {renderCard("Pain Points", renderBulletList(c.painPoints))}
        {renderCard("Tech Stack", renderBulletList(c.techStack))}
        {renderCard("Competitors", renderBulletList(c.competitors))}
        {renderCard("Org Structure", <p style={{ fontSize: 12, color: "#495057", lineHeight: 1.6, margin: 0 }}>{c.orgStructure}</p>)}
      </>
    );
  };

  const renderIndustryTab = () => {
    if (!researchData?.industry) return null;
    const ind = researchData.industry;
    return (
      <>
        {renderCard("Market Size", <p style={{ fontSize: 12, color: "#495057", lineHeight: 1.6, margin: 0 }}>{ind.marketSize}</p>)}
        {renderCard("Growth Rate", <p style={{ fontSize: 12, color: "#495057", lineHeight: 1.6, margin: 0 }}>{ind.growthRate}</p>)}
        {renderCard("Trends", renderBulletList(ind.trends))}
        {renderCard("Challenges", renderBulletList(ind.challenges))}
        {renderCard("Regulations", renderBulletList(ind.regulations))}
      </>
    );
  };

  const renderCompetitionTab = () => {
    if (!researchData?.competition) return null;
    const comp = researchData.competition;
    return (
      <>
        {comp.mainCompetitors.map((c, i) => (
          <div
            key={i}
            style={{
              background: "#f8f9fa",
              border: "1px solid #e9ecef",
              borderRadius: 10,
              padding: "12px 14px",
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2a5e", marginBottom: 8 }}>{c.name}</div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#2b8a3e", textTransform: "uppercase", marginBottom: 4 }}>
                  Strengths
                </div>
                {renderBulletList(c.strengths)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#e03131", textTransform: "uppercase", marginBottom: 4 }}>
                  Weaknesses
                </div>
                {renderBulletList(c.weaknesses)}
              </div>
            </div>
          </div>
        ))}
        {renderCard("Competitive Advantage", (
          <p style={{ fontSize: 12, color: "#495057", lineHeight: 1.6, margin: 0 }}>{comp.competitiveAdvantage}</p>
        ))}
        {renderCard("Switching Costs", (
          <p style={{ fontSize: 12, color: "#495057", lineHeight: 1.6, margin: 0 }}>{comp.switchingCosts}</p>
        ))}
      </>
    );
  };

  const renderApproachTab = () => {
    if (!researchData?.approach) return null;
    const a = researchData.approach;
    return (
      <>
        {renderCard("Recommended Angle", (
          <p style={{ fontSize: 12, color: "#495057", lineHeight: 1.6, margin: 0 }}>{a.recommendedAngle}</p>
        ))}
        {renderCard("Key Talking Points", renderBulletList(a.keyTalkingPoints))}
        {renderCard("Objection Handling", (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #dee2e6", fontSize: 11, fontWeight: 700, color: "#1e2a5e" }}>
                  Objection
                </th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #dee2e6", fontSize: 11, fontWeight: 700, color: "#1e2a5e" }}>
                  Response
                </th>
              </tr>
            </thead>
            <tbody>
              {a.objectionHandling.map((row, i) => (
                <tr key={i}>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid #f1f3f5", color: "#e03131", fontWeight: 500, verticalAlign: "top" }}>
                    {row.objection}
                  </td>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid #f1f3f5", color: "#495057", verticalAlign: "top" }}>
                    {row.response}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
        {renderCard("Ideal Timing", (
          <p style={{ fontSize: 12, color: "#495057", lineHeight: 1.6, margin: 0 }}>{a.idealTiming}</p>
        ))}
        {renderCard("Suggested Channel", (
          <div
            style={{
              display: "inline-block",
              padding: "4px 10px",
              borderRadius: 6,
              background: "#3b5bdb",
              color: "#fff",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {a.suggestedChannel}
          </div>
        ))}
      </>
    );
  };

  const renderTabContent = () => {
    if (isLoading && !loadedTabs.has(activeTab)) {
      return (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div
            style={{
              width: 28,
              height: 28,
              border: "3px solid #e9ecef",
              borderTopColor: "#3b5bdb",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 12px",
            }}
          />
          <div style={{ fontSize: 12, color: "#868e96" }}>
            Researching {activeTab}...
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }

    if (!loadedTabs.has(activeTab)) {
      return (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ fontSize: 13, color: "#868e96", marginBottom: 12 }}>
            Click a tab to load research data
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case "person": return renderPersonTab();
      case "company": return renderCompanyTab();
      case "industry": return renderIndustryTab();
      case "competition": return renderCompetitionTab();
      case "approach": return renderApproachTab();
      default: return null;
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: 640,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 48px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: "linear-gradient(135deg, #1e2a5e 0%, #3b5bdb 100%)",
            padding: "20px 24px 16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>
                Deep Research
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
                {lead.firstName} {lead.lastName} &middot; {lead.position} at {lead.company}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={handleResearchAll}
                disabled={isLoading}
                style={{
                  padding: "5px 12px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.3)",
                  background: "rgba(255,255,255,0.12)",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: isLoading ? "wait" : "pointer",
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                {isLoading ? "Researching..." : "Research All"}
              </button>
              <button
                onClick={onClose}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.7)",
                  cursor: "pointer",
                  fontSize: 18,
                  padding: "2px 4px",
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 2, marginTop: 16 }}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabClick(tab.key)}
                style={{
                  flex: 1,
                  padding: "7px 0",
                  borderRadius: "6px 6px 0 0",
                  border: "none",
                  background: activeTab === tab.key ? "#fff" : "rgba(255,255,255,0.1)",
                  color: activeTab === tab.key ? "#1e2a5e" : "rgba(255,255,255,0.7)",
                  fontSize: 11,
                  fontWeight: activeTab === tab.key ? 700 : 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {tab.label}
                {loadedTabs.has(tab.key) && (
                  <span style={{ marginLeft: 4, fontSize: 9, color: "#2b8a3e" }}>&#10003;</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
}
