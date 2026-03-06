"use client";

import { useState } from "react";
import { Rocket, Play, BarChart3 } from "lucide-react";
import SectionTabBar from "./SectionTabBar";
import RocketPipeline from "./RocketPipeline";
import ExecutionCenter from "./ExecutionCenter";
import AnalyticsDashboard from "./AnalyticsDashboard";
import type { Lead } from "@/lib/types";

type OutreachTab = "build" | "execute" | "analyze";

interface OutreachSectionProps {
  leads: Lead[];
  onNavigateToLead: (leadId: string) => void;
  onImportComplete?: (summary: { leads: number; sequences: number; errors: number }) => void;
}

const TABS = [
  { key: "build" as const, label: "Build", icon: <Rocket size={14} /> },
  { key: "execute" as const, label: "Execute", icon: <Play size={14} /> },
  { key: "analyze" as const, label: "Analyze", icon: <BarChart3 size={14} /> },
];

export default function OutreachSection({
  leads,
  onNavigateToLead,
  onImportComplete,
}: OutreachSectionProps) {
  const [activeTab, setActiveTab] = useState<OutreachTab>("build");

  return (
    <div>
      <SectionTabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "build" && (
        <RocketPipeline onImportComplete={onImportComplete} />
      )}

      {activeTab === "execute" && (
        <ExecutionCenter leads={leads} onNavigateToLead={onNavigateToLead} />
      )}

      {activeTab === "analyze" && (
        <AnalyticsDashboard leads={leads} />
      )}
    </div>
  );
}
