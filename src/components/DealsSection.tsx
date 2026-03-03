"use client";

import { useState } from "react";
import { Target, Map, Users } from "lucide-react";
import SectionTabBar from "./SectionTabBar";
import DealPipeline from "./DealPipeline";
import BuyerJourneyMap from "./BuyerJourneyMap";
import MultiThreadingIntelligence from "./MultiThreadingIntelligence";
import type { Lead, Deal, Account } from "@/lib/types";
import type { PipelineDeal } from "@/lib/mock-phase2";

type DealsTab = "pipeline" | "journey" | "stakeholders";

interface DealsSectionProps {
  deals: PipelineDeal[];
  typedDeals: Deal[];
  accounts: Account[];
  leads: Lead[];
  selectedLead: Lead | null;
  onNavigateToLead: (leadId: string) => void;
}

const TABS = [
  { key: "pipeline" as const, label: "Pipeline", icon: <Target size={14} /> },
  { key: "journey" as const, label: "Journey", icon: <Map size={14} /> },
  { key: "stakeholders" as const, label: "Stakeholders", icon: <Users size={14} /> },
];

export default function DealsSection({
  deals,
  typedDeals,
  accounts,
  leads,
  selectedLead,
  onNavigateToLead,
}: DealsSectionProps) {
  const [activeTab, setActiveTab] = useState<DealsTab>("pipeline");

  return (
    <div>
      <SectionTabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "pipeline" && (
        <DealPipeline
          deals={deals}
          leads={leads}
          onNavigateToLead={onNavigateToLead}
        />
      )}

      {activeTab === "journey" && (
        <BuyerJourneyMap
          leads={leads}
          deals={typedDeals}
          onNavigateToLead={onNavigateToLead}
          selectedLead={selectedLead}
        />
      )}

      {activeTab === "stakeholders" && (
        <MultiThreadingIntelligence
          leads={leads}
          deals={typedDeals}
          accounts={accounts}
          onNavigateToLead={onNavigateToLead}
        />
      )}
    </div>
  );
}
