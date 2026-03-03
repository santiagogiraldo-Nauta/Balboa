"use client";

import { useState } from "react";
import { Shield, Eye, Bot } from "lucide-react";
import SectionTabBar from "./SectionTabBar";
import ComplianceDashboard from "./ComplianceDashboard";
import LinkedInFilterSettings from "./LinkedInFilterSettings";
import LinkedInConversationList from "./LinkedInConversationList";
import LinkedInAuditLog from "./LinkedInAuditLog";
import AgentHubSection from "./AgentHubSection";
import type { Lead, SupportedLanguage } from "@/lib/types";

type SettingsTab = "compliance" | "privacy" | "agents";

interface SettingsSectionProps {
  leads: Lead[];
  selectedLead: Lead | null;
  language: SupportedLanguage;
}

const TABS = [
  { key: "compliance" as const, label: "Compliance", icon: <Shield size={14} /> },
  { key: "privacy" as const, label: "Privacy", icon: <Eye size={14} /> },
  { key: "agents" as const, label: "Agents", icon: <Bot size={14} /> },
];

export default function SettingsSection({
  leads,
  selectedLead,
  language,
}: SettingsSectionProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("compliance");
  const [showLinkedInAuditLog, setShowLinkedInAuditLog] = useState(false);

  return (
    <div>
      <SectionTabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "compliance" && (
        <ComplianceDashboard
          leads={leads}
          language={language}
        />
      )}

      {activeTab === "privacy" && (
        <>
          {showLinkedInAuditLog ? (
            <LinkedInAuditLog
              visible={true}
              onBack={() => setShowLinkedInAuditLog(false)}
            />
          ) : (
            <>
              <LinkedInFilterSettings
                visible={true}
                onShowAuditLog={() => setShowLinkedInAuditLog(true)}
              />
              <div style={{ height: 1, background: "rgba(148,163,184,0.1)", margin: "16px 0" }} />
              <LinkedInConversationList visible={true} />
            </>
          )}
        </>
      )}

      {activeTab === "agents" && (
        <AgentHubSection
          leads={leads}
          selectedLead={selectedLead}
          language={language}
        />
      )}
    </div>
  );
}
