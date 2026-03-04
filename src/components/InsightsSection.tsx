"use client";

import { useState } from "react";
import { BookOpen, TrendingUp } from "lucide-react";
import SectionTabBar from "./SectionTabBar";
import PlaybookIntelligence from "./PlaybookIntelligence";
import WinLossIntelligence from "./WinLossIntelligence";
import type { Deal, Lead } from "@/lib/types";

type InsightsTab = "playbook" | "winloss";

interface InsightsSectionProps {
  deals: Deal[];
  leads: Lead[];
  onAskVasco?: (prompt: string) => void;
}

const TABS = [
  { key: "playbook" as const, label: "Playbook", icon: <BookOpen size={14} /> },
  { key: "winloss" as const, label: "Win/Loss", icon: <TrendingUp size={14} /> },
];

export default function InsightsSection({
  deals,
  leads,
  onAskVasco: _onAskVasco,
}: InsightsSectionProps) {
  void _onAskVasco;
  const [activeTab, setActiveTab] = useState<InsightsTab>("playbook");

  return (
    <div>
      <SectionTabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "playbook" && (
        <PlaybookIntelligence />
      )}

      {activeTab === "winloss" && (
        <WinLossIntelligence
          deals={deals}
          leads={leads}
        />
      )}
    </div>
  );
}
