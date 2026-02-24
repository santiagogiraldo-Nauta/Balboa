"use client";

import { useState } from "react";
import { X, BookOpen, Target, Search, Settings, BarChart3, PenTool, Sparkles, CheckCircle, ChevronDown, Copy, Loader2 } from "lucide-react";
import type { Lead, PrepKitType, SupportedLanguage, PrepKit, PrepKitSection } from "@/lib/types";
import LanguageSelector from "./LanguageSelector";

interface SalesPrepModalProps {
  lead: Lead;
  onClose: () => void;
  onSave: (kit: PrepKit) => void;
}

const kitTypes: { key: PrepKitType; icon: typeof Target; title: string; desc: string; emoji: string }[] = [
  { key: "demo", icon: Target, title: "Demo Prep", desc: "Agenda, talking points, demo flow", emoji: "🎯" },
  { key: "discovery", icon: Search, title: "Discovery", desc: "Questions, pain points, qualification", emoji: "🔍" },
  { key: "technical", icon: Settings, title: "Technical", desc: "Integration, data flow, timeline", emoji: "⚙️" },
  { key: "proposal", icon: BarChart3, title: "Proposal", desc: "Executive summary, ROI, pricing", emoji: "📊" },
  { key: "custom", icon: PenTool, title: "Custom", desc: "Free-form prep document", emoji: "✏️" },
];

export default function SalesPrepModal({ lead, onClose, onSave }: SalesPrepModalProps) {
  const [selectedType, setSelectedType] = useState<PrepKitType | null>(null);
  const [language, setLanguage] = useState<SupportedLanguage>(lead.preferredLanguage || "english");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ title: string; sections: PrepKitSection[] } | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]));
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const toggleSection = (idx: number) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const copySection = (items: string[], idx: number) => {
    navigator.clipboard.writeText(items.map(i => `• ${i}`).join("\n"));
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const handleGenerate = async () => {
    if (!selectedType) return;
    setLoading(true);
    try {
      const resp = await fetch("/api/prep-kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead, kitType: selectedType, language }),
      });
      const data = await resp.json();
      setResult({ title: data.title, sections: data.sections });
    } catch {
      // Fallback mock
      setResult(generateMockKit(lead, selectedType));
    }
    setLoading(false);
    setExpandedSections(new Set([0]));
  };

  const handleSave = () => {
    if (!result || !selectedType) return;
    const kit: PrepKit = {
      id: `pk-${Date.now()}`,
      leadId: lead.id,
      type: selectedType,
      title: result.title,
      language,
      sections: result.sections,
      createdAt: new Date().toISOString(),
    };
    onSave(kit);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, var(--balboa-navy), var(--balboa-blue))", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BookOpen className="w-4.5 h-4.5" style={{ color: "white" }} />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)" }}>Sales Prep Kit</h2>
              <p style={{ fontSize: 12, color: "var(--balboa-text-muted)" }}>
                Prepare for your next interaction with {lead.firstName} at {lead.company}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost"><X className="w-4 h-4" /></button>
        </div>

        <div className="modal-body">
          {!result ? (
            <>
              {/* Kit type cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                {kitTypes.slice(0, 3).map((kt) => (
                  <div
                    key={kt.key}
                    onClick={() => setSelectedType(kt.key)}
                    className={`option-card ${selectedType === kt.key ? "selected" : ""}`}
                    style={{ padding: 14 }}
                  >
                    <div style={{ fontSize: 24, marginBottom: 4 }}>{kt.emoji}</div>
                    <div className="option-title" style={{ fontSize: 13 }}>{kt.title}</div>
                    <div className="option-desc">{kt.desc}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                {kitTypes.slice(3).map((kt) => (
                  <div
                    key={kt.key}
                    onClick={() => setSelectedType(kt.key)}
                    className={`option-card ${selectedType === kt.key ? "selected" : ""}`}
                    style={{ padding: 14 }}
                  >
                    <div style={{ fontSize: 24, marginBottom: 4 }}>{kt.emoji}</div>
                    <div className="option-title" style={{ fontSize: 13 }}>{kt.title}</div>
                    <div className="option-desc">{kt.desc}</div>
                  </div>
                ))}
              </div>

              {/* Language */}
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--balboa-text-muted)", display: "block", marginBottom: 6 }}>Language</label>
                <LanguageSelector value={language} onChange={setLanguage} />
              </div>
            </>
          ) : (
            /* Results — accordion sections */
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 12 }}>{result.title}</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {result.sections.map((section, idx) => {
                  const isOpen = expandedSections.has(idx);
                  return (
                    <div key={idx} className="prep-kit-section">
                      <div className="prep-kit-section-header" onClick={() => toggleSection(idx)}>
                        <span>{section.title}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); copySection(section.items, idx); }}
                            className="btn-ghost" style={{ padding: 2 }}>
                            {copiedIdx === idx
                              ? <CheckCircle className="w-3 h-3" style={{ color: "var(--balboa-green)" }} />
                              : <Copy className="w-3 h-3" style={{ color: "var(--balboa-text-light)" }} />}
                          </button>
                          <ChevronDown className="w-3 h-3" style={{
                            color: "var(--balboa-text-light)",
                            transform: isOpen ? "rotate(180deg)" : "none",
                            transition: "transform 0.15s",
                          }} />
                        </div>
                      </div>
                      {isOpen && (
                        <div className="prep-kit-section-body fade-in">
                          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                            {section.items.map((item, iIdx) => (
                              <li key={iIdx}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {!result ? (
            <>
              <button onClick={onClose} className="btn-secondary">Cancel</button>
              <button
                onClick={handleGenerate}
                disabled={!selectedType || loading}
                className="btn-primary"
                style={{ opacity: !selectedType ? 0.5 : 1 }}
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><Sparkles className="w-4 h-4" /> Generate Kit</>}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setResult(null)} className="btn-secondary">← Back</button>
              <button onClick={handleSave} className="btn-primary">
                <CheckCircle className="w-4 h-4" /> Save to Lead
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function generateMockKit(lead: Lead, type: PrepKitType): { title: string; sections: PrepKitSection[] } {
  const company = lead.company;
  const industry = lead.companyIntel?.industry || "distribution";
  const pain = lead.companyIntel?.painPoints?.[0] || "supply chain visibility";

  const kits: Record<PrepKitType, { title: string; sections: PrepKitSection[] }> = {
    demo: {
      title: `Demo Prep: ${company} — ${industry}`,
      sections: [
        { title: "Agenda (30 min)", items: [`5 min — ${company} context recap + confirm priorities`, "10 min — Live dashboard: real-time tracking + alerts", `8 min — ${pain} workflow demo`, "5 min — ROI discussion", "2 min — Next steps"] },
        { title: "Key Talking Points", items: [`${company} operates in ${industry} — show relevant use cases`, `Their top pain: ${pain}`, "Show 92 in-transit shipments tracked in real-time", "Reference OTIF improvement (22% → 90%+)", "Anchor ROI to their specific scale"] },
        { title: "Demo Flow", items: ["Start with Real-Time Tracking dashboard", "Show delayed shipment alerts (801 flagged)", "Navigate to Order Management", "Show Inventory Health with safety stock", "End with Tariff module if relevant"] },
        { title: "Objection Handling", items: ["'We have an ERP' → Balboa augments, doesn't replace", "'Too expensive' → ROI pays for itself in 90 days", "'Long implementation' → 6-8 week deployment", "'Need IT approval' → Schedule technical validation call"] },
      ],
    },
    discovery: {
      title: `Discovery Prep: ${company}`,
      sections: [
        { title: "Discovery Questions", items: [`How are you currently managing ${pain}?`, "What systems are you running for supply chain today?", "Who else would be involved in evaluating a platform?", "What's your timeline for making changes?", "Are you evaluating other solutions?"] },
        { title: "Pain Points to Probe", items: [pain, "Manual tracking via spreadsheets", "Lack of real-time visibility", "High safety stock levels", "Emergency POs destroying margins"] },
        { title: "Qualification Criteria", items: ["Budget: Is there allocated spend?", `Authority: Is ${lead.firstName} a decision-maker?`, "Need: Active evaluation or just exploring?", "Timeline: Fiscal year deadlines?"] },
      ],
    },
    technical: {
      title: `Technical Prep: ${company}`,
      sections: [
        { title: "Integration Requirements", items: [`Current ERP: ${lead.companyIntel?.techStack?.join(", ") || "Unknown — ask"}`, "API connectivity: REST APIs for all integrations", "Data sync frequency: Real-time for tracking, hourly for inventory", "SSO/Authentication: SAML 2.0 supported"] },
        { title: "Architecture Overview", items: ["Cloud-native SaaS (AWS)", "SOC 2 Type II compliant", "99.9% uptime SLA", "No on-prem installation required"] },
        { title: "Implementation Timeline", items: ["Week 1-2: Data mapping + API connections", "Week 3-4: Configuration + custom workflows", "Week 5-6: UAT + training", "Week 7-8: Go-live + hypercare"] },
      ],
    },
    proposal: {
      title: `Proposal Prep: ${company}`,
      sections: [
        { title: "Executive Summary", items: [`${company} needs a unified supply chain control tower`, `Key pain: ${pain}`, "Balboa provides real-time visibility + autonomous action", "Expected ROI: 90-day payback"] },
        { title: "Solution Mapping", items: ["Real-Time Tracking → Solves visibility gaps", "Automated PO Management → Eliminates manual work", "Inventory Optimization → Reduces safety stock 18%", "Tariff Monitoring → Compliance + cost avoidance"] },
        { title: "ROI Calculation", items: ["Fill rate improvement: 0.25% = significant revenue recovery", "Safety stock reduction: 18% = freed working capital", "Emergency PO reduction: 92%", "DIO improvement: 10-15 days"] },
      ],
    },
    custom: {
      title: `Custom Prep: ${company}`,
      sections: [
        { title: "Key Information", items: [`Company: ${company}`, `Contact: ${lead.firstName} ${lead.lastName}`, `Role: ${lead.position}`, `Industry: ${industry}`] },
        { title: "Notes", items: ["Add your custom prep notes here", "Personalize based on your specific call objectives"] },
      ],
    },
  };

  return kits[type];
}
