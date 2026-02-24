"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, Plus, Copy, CheckCircle } from "lucide-react";
import type { PrepKit } from "@/lib/types";

interface PrepKitPanelProps {
  kits: PrepKit[];
  onGenerateNew: () => void;
}

const typeLabels: Record<string, { label: string; emoji: string }> = {
  demo: { label: "Demo", emoji: "🎯" },
  discovery: { label: "Discovery", emoji: "🔍" },
  technical: { label: "Technical", emoji: "⚙️" },
  proposal: { label: "Proposal", emoji: "📊" },
  custom: { label: "Custom", emoji: "✏️" },
};

const langFlags: Record<string, string> = { english: "🇺🇸", spanish: "🇪🇸", portuguese: "🇧🇷" };

export default function PrepKitPanel({ kits, onGenerateNew }: PrepKitPanelProps) {
  const [expandedKit, setExpandedKit] = useState<string | null>(kits.length > 0 ? kits[0].id : null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleSection = (sectionKey: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionKey)) next.delete(sectionKey);
      else next.add(sectionKey);
      return next;
    });
  };

  const copySection = (items: string[], sectionKey: string) => {
    navigator.clipboard.writeText(items.join("\n• "));
    setCopiedId(sectionKey);
    setTimeout(() => setCopiedId(null), 1500);
  };

  if (kits.length === 0) return null;

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold flex items-center gap-1" style={{ color: "var(--balboa-text-secondary)" }}>
          <BookOpen className="w-3.5 h-3.5" style={{ color: "var(--balboa-navy)" }} /> Prep Kits
        </h4>
        <button onClick={onGenerateNew} className="btn-ghost text-[10px]">
          <Plus className="w-3 h-3" /> New Kit
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {kits.map((kit) => {
          const tl = typeLabels[kit.type] || typeLabels.custom;
          const isExpanded = expandedKit === kit.id;
          return (
            <div key={kit.id} style={{ border: "1px solid var(--balboa-border-light)", borderRadius: 8, overflow: "hidden" }}>
              {/* Kit header */}
              <div
                onClick={() => setExpandedKit(isExpanded ? null : kit.id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 12px", cursor: "pointer", background: isExpanded ? "var(--balboa-bg-alt)" : "white",
                  transition: "background 0.15s",
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{tl.emoji}</span>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-navy)" }}>{kit.title}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span className="badge badge-warm" style={{ fontSize: 9 }}>{tl.label}</span>
                      <span style={{ fontSize: 10, color: "var(--balboa-text-light)" }}>
                        {langFlags[kit.language]} {new Date(kit.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5" style={{
                  color: "var(--balboa-text-light)",
                  transform: isExpanded ? "rotate(180deg)" : "none",
                  transition: "transform 0.15s",
                }} />
              </div>

              {/* Kit sections */}
              {isExpanded && (
                <div className="fade-in" style={{ borderTop: "1px solid var(--balboa-border-light)" }}>
                  {kit.sections.map((section, sIdx) => {
                    const sKey = `${kit.id}-${sIdx}`;
                    const sOpen = expandedSections.has(sKey);
                    return (
                      <div key={sIdx} className="prep-kit-section">
                        <div className="prep-kit-section-header" onClick={() => toggleSection(sKey)}>
                          <span>{section.title}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); copySection(section.items, sKey); }}
                              className="btn-ghost" style={{ padding: 2 }}>
                              {copiedId === sKey
                                ? <CheckCircle className="w-3 h-3" style={{ color: "var(--balboa-green)" }} />
                                : <Copy className="w-3 h-3" style={{ color: "var(--balboa-text-light)" }} />}
                            </button>
                            <ChevronDown className="w-3 h-3" style={{
                              color: "var(--balboa-text-light)",
                              transform: sOpen ? "rotate(180deg)" : "none",
                              transition: "transform 0.15s",
                            }} />
                          </div>
                        </div>
                        {sOpen && (
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
