"use client";

import { useState } from "react";
import { Shield, ChevronDown, Plus, AlertTriangle, Crosshair, Swords, Target, HelpCircle, Zap } from "lucide-react";
import type { BattleCard, Lead } from "@/lib/types";

interface BattleCardPanelProps {
  lead: Lead;
  cards: BattleCard[];
  onGenerate: (competitor: string) => void;
}

const competitorDisplayNames: Record<string, string> = {
  project44: "project44", fourkites: "FourKites", flexport: "Flexport", descartes: "Descartes",
  sapibp: "SAP IBP", oraclescm: "Oracle SCM", blueyonder: "Blue Yonder", e2open: "E2Open",
  coupa: "Coupa", other: "Other",
};

export default function BattleCardPanel({ lead, cards, onGenerate }: BattleCardPanelProps) {
  const [selectedCard, setSelectedCard] = useState<string | null>(cards.length > 0 ? cards[0].id : null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["strengths", "balboa"]));

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const activeCard = cards.find(c => c.id === selectedCard);

  if (cards.length === 0) return null;

  const sections = activeCard ? [
    { key: "strengths", label: "THEIR STRENGTHS", items: activeCard.strengths, className: "battle-section-strength", icon: Swords },
    { key: "weaknesses", label: "THEIR WEAKNESSES", items: activeCard.weaknesses, className: "battle-section-weakness", icon: Target },
    { key: "balboa", label: "BALBOA DIFFERENTIATORS", items: activeCard.balboaDifferentiators, className: "battle-section-balboa", icon: Shield },
    { key: "questions", label: "KILLER QUESTIONS", items: activeCard.killerQuestions, className: "battle-section-questions", icon: HelpCircle },
  ] : [];

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold flex items-center gap-1" style={{ color: "var(--balboa-text-secondary)" }}>
          <Shield className="w-3.5 h-3.5" style={{ color: "var(--balboa-navy)" }} /> Battle Cards
        </h4>
        <button onClick={() => onGenerate("auto")} className="btn-ghost text-[10px]">
          <Plus className="w-3 h-3" /> Generate
        </button>
      </div>

      {/* Competitor pills */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
        {cards.map((card) => (
          <button
            key={card.id}
            onClick={() => setSelectedCard(card.id)}
            className="lang-pill"
            style={selectedCard === card.id ? { background: "var(--balboa-navy)", color: "white", borderColor: "var(--balboa-navy)" } : {}}
          >
            <Crosshair className="w-3 h-3" />
            {card.competitorDisplayName}
          </button>
        ))}
      </div>

      {/* Active card */}
      {activeCard && (
        <div className="battle-card fade-in">
          <div className="battle-card-header">
            <Crosshair className="w-4 h-4" />
            vs {activeCard.competitorDisplayName}
            {activeCard.autoDetectedFrom && (
              <span style={{ marginLeft: "auto", fontSize: 9, opacity: 0.7, display: "flex", alignItems: "center", gap: 4 }}>
                <Zap className="w-3 h-3" /> Auto-detected
              </span>
            )}
          </div>

          {/* Sections */}
          {sections.map(({ key, label, items, className, icon: Icon }) => {
            const isOpen = expandedSections.has(key);
            return (
              <div key={key} className={`battle-section ${className}`}>
                <div onClick={() => toggleSection(key)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                  <h4 style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon className="w-3 h-3" /> {label}
                  </h4>
                  <ChevronDown className="w-3 h-3" style={{
                    color: "var(--balboa-text-light)",
                    transform: isOpen ? "rotate(180deg)" : "none",
                    transition: "transform 0.15s",
                  }} />
                </div>
                {isOpen && (
                  <ul className="fade-in" style={{ listStyle: "none", padding: 0, margin: "6px 0 0" }}>
                    {items.map((item, i) => (
                      <li key={i} style={{ paddingLeft: 14, position: "relative" }}>
                        <span style={{ position: "absolute", left: 0, top: 3, width: 5, height: 5, borderRadius: "50%", background: "var(--balboa-text-light)" }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          {/* Landmines */}
          {activeCard.landmines.length > 0 && (
            <div style={{ padding: "12px 16px" }}>
              <div className="landmine-box">
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <AlertTriangle className="w-3.5 h-3.5" style={{ color: "#d97706" }} />
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "#92400e" }}>LANDMINES</span>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {activeCard.landmines.map((lm, i) => (
                    <li key={i} style={{ fontSize: 12, color: "#78350f", marginBottom: 4 }}>⚠️ {lm}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
