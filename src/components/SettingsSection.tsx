"use client";

import { useState } from "react";
import { Shield, Eye, Bot, Plug, Linkedin, Building2, Search, Phone } from "lucide-react";
import SectionTabBar from "./SectionTabBar";
import ComplianceDashboard from "./ComplianceDashboard";
import LinkedInFilterSettings from "./LinkedInFilterSettings";
import LinkedInConversationList from "./LinkedInConversationList";
import LinkedInAuditLog from "./LinkedInAuditLog";
import AgentHubSection from "./AgentHubSection";
import GmailIntegrationPanel from "./GmailIntegrationPanel";
import IntegrationCard from "./IntegrationCard";
import type { Lead, SupportedLanguage } from "@/lib/types";

type SettingsTab = "compliance" | "privacy" | "agents" | "integrations";

interface SettingsSectionProps {
  leads: Lead[];
  selectedLead: Lead | null;
  language: SupportedLanguage;
  initialTab?: SettingsTab;
}

const TABS = [
  { key: "integrations" as const, label: "Integrations", icon: <Plug size={14} /> },
  { key: "compliance" as const, label: "Compliance", icon: <Shield size={14} /> },
  { key: "privacy" as const, label: "Privacy", icon: <Eye size={14} /> },
  { key: "agents" as const, label: "Agents", icon: <Bot size={14} /> },
];

export default function SettingsSection({
  leads,
  selectedLead,
  language,
  initialTab,
}: SettingsSectionProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || "integrations");
  const [showLinkedInAuditLog, setShowLinkedInAuditLog] = useState(false);

  return (
    <div>
      <SectionTabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "integrations" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 680 }}>
          <GmailIntegrationPanel />
          <IntegrationCard
            name="LinkedIn"
            description="Connect your LinkedIn account to sync prospect data and outreach activity."
            icon={Linkedin}
            iconGradient="linear-gradient(135deg, var(--balboa-bg-alt), var(--balboa-bg-hover))"
            status="coming_soon"
          />
          <IntegrationCard
            name="HubSpot"
            description="Sync your CRM deals, contacts, and pipeline data with Balboa."
            icon={Building2}
            iconGradient="linear-gradient(135deg, var(--balboa-bg-alt), var(--balboa-bg-hover))"
            status="coming_soon"
          />
          <IntegrationCard
            name="Amplemarket"
            description="Import prospecting lists and enrich lead data automatically."
            icon={Search}
            iconGradient="linear-gradient(135deg, var(--balboa-bg-alt), var(--balboa-bg-hover))"
            status="coming_soon"
          />
          <IntegrationCard
            name="Aircall"
            description="Log call activity and sync call outcomes to your pipeline."
            icon={Phone}
            iconGradient="linear-gradient(135deg, var(--balboa-bg-alt), var(--balboa-bg-hover))"
            status="coming_soon"
          />
        </div>
      )}

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
