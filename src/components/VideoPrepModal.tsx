"use client";

import { useState } from "react";
import { X, Video, FileText, BarChart3, Lock, Sparkles, Copy, CheckCircle, Loader2 } from "lucide-react";
import type { Lead, VideoOption, SupportedLanguage, VideoPrep, SlideContent } from "@/lib/types";
import LanguageSelector from "./LanguageSelector";
import VideoSlidesRenderer from "./VideoSlidesRenderer";

interface VideoPrepModalProps {
  lead: Lead;
  onClose: () => void;
  onSave: (prep: VideoPrep) => void;
}

export default function VideoPrepModal({ lead, onClose, onSave }: VideoPrepModalProps) {
  const [selectedOptions, setSelectedOptions] = useState<Set<VideoOption>>(new Set());
  const [language, setLanguage] = useState<SupportedLanguage>(lead.preferredLanguage || "english");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ script?: string; slides?: SlideContent[] } | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<"script" | "slides">("script");
  const [copied, setCopied] = useState(false);

  const toggleOption = (opt: VideoOption) => {
    if (opt === "video") return; // Coming soon
    setSelectedOptions(prev => {
      const next = new Set(prev);
      if (next.has(opt)) next.delete(opt);
      else next.add(opt);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (selectedOptions.size === 0) return;
    setLoading(true);
    try {
      const resp = await fetch("/api/video-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead, options: Array.from(selectedOptions), language }),
      });
      const data = await resp.json();
      setResult({ script: data.script, slides: data.slides });
      if (selectedOptions.has("slides") && !selectedOptions.has("script")) setActiveResultTab("slides");
    } catch {
      // Fallback mock
      setResult({
        script: selectedOptions.has("script") ? generateMockScript(lead) : undefined,
        slides: selectedOptions.has("slides") ? generateMockSlides(lead) : undefined,
      });
      if (selectedOptions.has("slides") && !selectedOptions.has("script")) setActiveResultTab("slides");
    }
    setLoading(false);
  };

  const handleSave = () => {
    if (!result) return;
    const prep: VideoPrep = {
      id: `vp-${Date.now()}`,
      leadId: lead.id,
      options: Array.from(selectedOptions),
      language,
      script: result.script,
      slides: result.slides,
      createdAt: new Date().toISOString(),
    };
    onSave(prep);
    onClose();
  };

  const copyScript = () => {
    if (result?.script) {
      navigator.clipboard.writeText(result.script);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const options: { key: VideoOption; icon: typeof FileText; title: string; desc: string; disabled: boolean }[] = [
    { key: "script", icon: FileText, title: "Talk Track", desc: "3-5 min personalized script", disabled: false },
    { key: "slides", icon: BarChart3, title: "Slide Deck", desc: "5 personalized slides", disabled: false },
    { key: "video", icon: Video, title: "AI Video", desc: "Coming Soon", disabled: true },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680 }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, var(--balboa-navy), var(--balboa-blue))", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Video className="w-4.5 h-4.5" style={{ color: "white" }} />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)" }}>Video Prep</h2>
              <p style={{ fontSize: 12, color: "var(--balboa-text-muted)" }}>
                Create personalized content for {lead.firstName} at {lead.company}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost"><X className="w-4 h-4" /></button>
        </div>

        <div className="modal-body">
          {!result ? (
            <>
              {/* Option cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                {options.map((opt) => (
                  <div
                    key={opt.key}
                    onClick={() => toggleOption(opt.key)}
                    className={`option-card ${selectedOptions.has(opt.key) ? "selected" : ""} ${opt.disabled ? "disabled" : ""}`}
                  >
                    <div className="option-icon">
                      {opt.disabled ? <Lock className="w-7 h-7 mx-auto" style={{ color: "var(--balboa-text-light)" }} /> : (
                        <opt.icon className="w-7 h-7 mx-auto" style={{ color: selectedOptions.has(opt.key) ? "var(--balboa-navy)" : "var(--balboa-text-muted)" }} />
                      )}
                    </div>
                    <div className="option-title">{opt.title}</div>
                    <div className="option-desc">{opt.desc}</div>
                    {selectedOptions.has(opt.key) && (
                      <div style={{ marginTop: 6 }}>
                        <CheckCircle className="w-4 h-4 mx-auto" style={{ color: "var(--balboa-green)" }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <p style={{ fontSize: 11, color: "var(--balboa-text-muted)", marginBottom: 4 }}>
                💡 Select one or combine Talk Track + Slides for a complete presentation package
              </p>

              {/* Language */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--balboa-text-muted)", display: "block", marginBottom: 6 }}>Language</label>
                <LanguageSelector value={language} onChange={setLanguage} />
              </div>
            </>
          ) : (
            /* Results */
            <div>
              {/* Result tabs */}
              {result.script && result.slides && (
                <div className="tab-nav" style={{ marginBottom: 16 }}>
                  <button onClick={() => setActiveResultTab("script")} className={`tab-btn ${activeResultTab === "script" ? "active" : ""}`}>
                    <FileText className="w-3.5 h-3.5" /> Talk Track
                  </button>
                  <button onClick={() => setActiveResultTab("slides")} className={`tab-btn ${activeResultTab === "slides" ? "active" : ""}`}>
                    <BarChart3 className="w-3.5 h-3.5" /> Slides
                  </button>
                </div>
              )}

              {/* Script view */}
              {activeResultTab === "script" && result.script && (
                <div>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                    <button onClick={copyScript} className="btn-ghost text-[11px]">
                      {copied ? <><CheckCircle className="w-3 h-3" style={{ color: "var(--balboa-green)" }} /> Copied!</> : <><Copy className="w-3 h-3" /> Copy Script</>}
                    </button>
                  </div>
                  <div style={{ background: "var(--balboa-bg-alt)", borderRadius: 10, padding: 16, maxHeight: 400, overflowY: "auto", border: "1px solid var(--balboa-border-light)" }}>
                    <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12, lineHeight: 1.6, color: "var(--balboa-text-secondary)", margin: 0 }}>
                      {result.script}
                    </pre>
                  </div>
                </div>
              )}

              {/* Slides view */}
              {activeResultTab === "slides" && result.slides && (
                <VideoSlidesRenderer slides={result.slides} leadName={`${lead.firstName} ${lead.lastName}`} company={lead.company} />
              )}
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
                disabled={selectedOptions.size === 0 || loading}
                className="btn-primary"
                style={{ opacity: selectedOptions.size === 0 ? 0.5 : 1 }}
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><Sparkles className="w-4 h-4" /> Generate</>}
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

// Fallback mock generators
function generateMockScript(lead: Lead): string {
  const company = lead.company;
  const pain = lead.companyIntel?.painPoints?.[0] || "supply chain visibility gaps";
  const industry = lead.companyIntel?.industry || "distribution";
  return `[SLIDE 1 - OPENER]\nHi ${lead.firstName}, thanks for taking a few minutes to watch this. I put this together specifically for ${company} because I know managing a ${industry} operation at your scale comes with unique challenges.\n\n[SLIDE 2 - THE PAIN]\nHere's what we're seeing across companies like ${company}: ${pain} is costing distributors an average of 2-5% of revenue annually. At Balboa, we currently track 92 in-transit shipments in real-time, and our platform flagged 801 delayed shipments this week alone — before they became customer-facing problems.\n\n[SLIDE 3 - HOW NAUTA WORKS]\nBalboa sits on top of your existing systems — we don't replace anything, we synchronize everything. Real-time tracking, automated PO management with 250+ active purchase orders, inventory optimization showing $9.1M on-hand with smart safety stock recommendations, and Section 301 tariff exposure monitoring.\n\n[SLIDE 4 - ROI]\nFor a company ${company}'s size, we typically see: 0.25% fill rate improvement, 18% safety stock reduction freeing significant working capital, and a 92% reduction in emergency POs. That translates to millions in recovered revenue and freed cash.\n\n[SLIDE 5 - NEXT STEPS]\nI'd love to show you a live 20-minute demo tailored to ${company}'s specific operations. Would next week work for a quick call?`;
}

function generateMockSlides(lead: Lead): SlideContent[] {
  const company = lead.company;
  return [
    { title: `Built for ${company}`, subtitle: `How Balboa transforms ${lead.companyIntel?.industry || "supply chain"} operations`, bullets: ["One unified control tower for all operations", "Real-time visibility across your entire supply chain", `Purpose-built for ${lead.companyIntel?.industry || "distribution"}`], highlightStat: "3 min read" },
    { title: "The Hidden Cost", subtitle: "What fragmented systems are costing you", bullets: [lead.companyIntel?.painPoints?.[0] || "Supply chain visibility gaps", "Safety stock 20-30% higher than necessary", "Emergency POs destroying margins", "Systems that don't talk to each other"], highlightStat: "2-5% of revenue" },
    { title: "How Balboa Works", subtitle: "One platform. Every system connected.", bullets: ["Sits on top of your existing ERP + WMS", "92 shipments tracked in real-time right now", "Automated PO management (250+ active)", "Section 301 tariff exposure monitoring"], highlightStat: "801 delays caught" },
    { title: "Your ROI Potential", subtitle: `Based on ${company}'s operational scale`, bullets: ["Fill rate improvement = recovered revenue", "Safety stock reduction = freed capital", "Emergency PO reduction: 92%", "10-15 day DIO improvement"], highlightStat: "90-day payback" },
    { title: "Let's Talk", subtitle: "20-minute live demo, tailored to you", bullets: ["See your pain points addressed live", "Get a custom ROI analysis", "Meet our industry specialist", "No commitment required"], highlightStat: "Next week?" },
  ];
}
