"use client";

import { useState, useEffect } from "react";
import { Shield, Eye, Bot, Plug, Linkedin, Building2, Phone, Database, Webhook, Globe, RefreshCw } from "lucide-react";
import SectionTabBar from "./SectionTabBar";
import ComplianceDashboard from "./ComplianceDashboard";
import LinkedInFilterSettings from "./LinkedInFilterSettings";
import LinkedInConversationList from "./LinkedInConversationList";
import LinkedInAuditLog from "./LinkedInAuditLog";
import AgentHubSection from "./AgentHubSection";
import GmailIntegrationPanel from "./GmailIntegrationPanel";
import AmplemarketIntegrationPanel from "./AmplemarketIntegrationPanel";
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
          <AmplemarketIntegrationPanel />

          {/* HubSpot — OAuth connection */}
          <IntegrationCard
            name="HubSpot"
            description="Bi-directional CRM sync — contacts, deals, sequences with open/click/reply tracking."
            icon={Building2}
            iconGradient="linear-gradient(135deg, #ff7a45, #ff4d4f)"
            status="available"
            onConnect={() => { window.location.href = "/api/hubspot/auth"; }}
          />

          {/* Aircall — Webhook-based */}
          <IntegrationCard
            name="Aircall"
            description="Real-time call tracking via webhooks. Configure webhook URL in Aircall dashboard."
            icon={Phone}
            iconGradient="linear-gradient(135deg, #22c55e, #16a34a)"
            status="available"
          />
          <div style={{ padding: "8px 16px", fontSize: 11, color: "var(--text-secondary)", background: "var(--bg-secondary)", borderRadius: 8, marginTop: -8 }}>
            Aircall Webhook URL: <code style={{ color: "var(--text-primary)" }}>{typeof window !== "undefined" ? window.location.origin : "https://balboa-xi.vercel.app"}/api/webhooks/aircall</code>
          </div>

          {/* LinkedIn — Apify + n8n */}
          <IntegrationCard
            name="LinkedIn Tracking"
            description="Near real-time LinkedIn activity tracking via Apify scrapers + n8n workflows."
            icon={Linkedin}
            iconGradient="linear-gradient(135deg, #0077b5, #005885)"
            status="available"
          />
          <div style={{ padding: "8px 16px", fontSize: 11, color: "var(--text-secondary)", background: "var(--bg-secondary)", borderRadius: 8, marginTop: -8 }}>
            n8n Endpoint: <code style={{ color: "var(--text-primary)" }}>{typeof window !== "undefined" ? window.location.origin : "https://balboa-xi.vercel.app"}/api/linkedin/track</code>
          </div>

          {/* Clay — Webhook-based enrichment */}
          <IntegrationCard
            name="Clay"
            description="Webhook-based lead enrichment. Push leads to Clay, receive enriched data back."
            icon={Database}
            iconGradient="linear-gradient(135deg, #8b5cf6, #6d28d9)"
            status="available"
          />
          <div style={{ padding: "8px 16px", fontSize: 11, color: "var(--text-secondary)", background: "var(--bg-secondary)", borderRadius: 8, marginTop: -8 }}>
            Clay Return Webhook: <code style={{ color: "var(--text-primary)" }}>{typeof window !== "undefined" ? window.location.origin : "https://balboa-xi.vercel.app"}/api/webhooks/clay</code>
          </div>

          {/* Fireflies — Already integrated */}
          <IntegrationCard
            name="Fireflies"
            description="Meeting transcript sync and AI summaries. Already integrated."
            icon={Globe}
            iconGradient="linear-gradient(135deg, #f59e0b, #d97706)"
            status="connected"
          />

          {/* Webhook URLs summary */}
          <div style={{
            padding: 16,
            background: "var(--bg-secondary)",
            borderRadius: 10,
            border: "1px solid var(--border-primary)",
            marginTop: 8,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Webhook size={14} style={{ color: "#3B5BDB" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Webhook URLs for n8n / Integrations</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
              {[
                { label: "Amplemarket", path: "/api/webhooks/amplemarket" },
                { label: "HubSpot", path: "/api/webhooks/hubspot" },
                { label: "Aircall", path: "/api/webhooks/aircall" },
                { label: "Clay", path: "/api/webhooks/clay" },
                { label: "Gmail Push", path: "/api/webhooks/gmail-push" },
                { label: "LinkedIn (n8n)", path: "/api/linkedin/track" },
              ].map(({ label, path }) => (
                <div key={path} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "var(--text-secondary)" }}>{label}:</span>
                  <code style={{ color: "var(--text-primary)", fontSize: 10 }}>
                    {typeof window !== "undefined" ? window.location.origin : "https://balboa-xi.vercel.app"}{path}
                  </code>
                </div>
              ))}
            </div>
          </div>
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
