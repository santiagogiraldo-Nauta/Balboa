"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Eye,
  Bot,
  Plug,
  Linkedin,
  Building2,
  Phone,
  Database,
  Webhook,
  Globe,
  Mail,
  Search,
  RefreshCw,
  Cpu,
  Radio,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import SectionTabBar from "./SectionTabBar";
import ComplianceDashboard from "./ComplianceDashboard";
import LinkedInFilterSettings from "./LinkedInFilterSettings";
import LinkedInConversationList from "./LinkedInConversationList";
import LinkedInAuditLog from "./LinkedInAuditLog";
import AgentHubSection from "./AgentHubSection";
import IntegrationCard from "./IntegrationCard";
import type { IntegrationStat } from "./IntegrationCard";
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

// ─── Types for integration status API ─────────────────────────────

interface IntegrationStatusData {
  name: string;
  displayName: string;
  connected: boolean;
  enabled: boolean;
  sandboxMode: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: "success" | "error" | "pending";
  lastSyncError?: string;
  capabilities: string[];
}

interface IntegrationStatusResponse {
  integrations: IntegrationStatusData[];
  summary: {
    total: number;
    connected: number;
    enabled: number;
  };
}

interface GmailMetrics {
  totalThreads: number;
  totalMessages: number;
  sent: number;
  received: number;
  matchedThreads: number;
  unmatchedThreads: number;
  messagesToday: number;
  unreadCount: number;
  responseRate: number;
}

interface GmailStatus {
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
}

interface TestResult {
  platform: string;
  success: boolean;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────

function getBaseUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return "https://balboa-xi.vercel.app";
}

function webhookUrl(path: string): string {
  return `${getBaseUrl()}${path}`;
}

// ─── Component ────────────────────────────────────────────────────

export default function SettingsSection({
  leads,
  selectedLead,
  language,
  initialTab,
}: SettingsSectionProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || "integrations");
  const [showLinkedInAuditLog, setShowLinkedInAuditLog] = useState(false);

  // Integration data state
  const [statusData, setStatusData] = useState<IntegrationStatusResponse | null>(null);
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [gmailMetrics, setGmailMetrics] = useState<GmailMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Per-integration action states
  const [syncingPlatform, setSyncingPlatform] = useState<string | null>(null);
  const [testingPlatform, setTestingPlatform] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  // ─── Data fetching ─────────────────────────────────────────────

  const fetchAllStatuses = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [statusRes, gmailStatusRes, gmailMetricsRes] = await Promise.all([
        fetch("/api/integrations/status").then(r => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/gmail/status").then(r => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/gmail/metrics").then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      if (statusRes) setStatusData(statusRes);
      if (gmailStatusRes) setGmailStatus(gmailStatusRes);
      if (gmailMetricsRes) setGmailMetrics(gmailMetricsRes);
    } catch (err) {
      console.error("[SettingsSection] Failed to fetch integration statuses:", err);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (activeTab === "integrations") {
      fetchAllStatuses();
    }
  }, [activeTab, fetchAllStatuses]);

  // ─── Helpers to get status for a platform ──────────────────────

  function getPlatformStatus(name: string): IntegrationStatusData | null {
    if (!statusData?.integrations) return null;
    return statusData.integrations.find(i => i.name === name) || null;
  }

  function resolveStatus(name: string): "connected" | "error" | "available" {
    const platform = getPlatformStatus(name);
    if (!platform) return "available";
    if (platform.connected) return "connected";
    if (platform.lastSyncStatus === "error") return "error";
    return "available";
  }

  // ─── Actions ───────────────────────────────────────────────────

  async function handleHubSpotConnect() {
    window.location.href = "/api/hubspot/auth";
  }

  async function handleGmailConnect() {
    try {
      const res = await fetch("/api/gmail/auth");
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error("Gmail auth failed:", err);
    }
  }

  async function handleDisconnect(platform: string) {
    setDisconnecting(platform);
    try {
      if (platform === "gmail") {
        await fetch("/api/gmail/disconnect", { method: "POST" });
      } else {
        // Generic disconnect via integration configs
        await fetch("/api/integrations/status", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform }),
        });
      }
      await fetchAllStatuses(true);
    } catch (err) {
      console.error(`Failed to disconnect ${platform}:`, err);
    }
    setDisconnecting(null);
  }

  async function handleSync(platform: string) {
    setSyncingPlatform(platform);
    try {
      if (platform === "gmail") {
        await fetch("/api/gmail/sync");
      } else if (platform === "hubspot") {
        await fetch("/api/hubspot/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ direction: "pull", syncType: "all" }),
        });
      }
      await fetchAllStatuses(true);
    } catch (err) {
      console.error(`Sync failed for ${platform}:`, err);
    }
    setSyncingPlatform(null);
  }

  async function handleTest(platform: string) {
    setTestingPlatform(platform);
    setTestResults(prev => ({ ...prev, [platform]: { platform, success: false } }));
    try {
      // Attempt to call the integrations status which will verify connectivity
      const res = await fetch("/api/integrations/status");
      const data = await res.json();
      const platformStatus = data?.integrations?.find((i: IntegrationStatusData) => i.name === platform);
      const success = platformStatus?.connected === true;
      setTestResults(prev => ({
        ...prev,
        [platform]: { platform, success, error: success ? undefined : "Not connected" },
      }));
    } catch (err) {
      setTestResults(prev => ({
        ...prev,
        [platform]: { platform, success: false, error: err instanceof Error ? err.message : "Test failed" },
      }));
    }
    setTestingPlatform(null);
  }

  async function handleApiKeySubmit(platform: string, apiKey: string) {
    try {
      await fetch("/api/integrations/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, apiKey }),
      });
      await fetchAllStatuses(true);
    } catch (err) {
      console.error(`Failed to save API key for ${platform}:`, err);
    }
  }

  // ─── Build stats for each platform ─────────────────────────────

  function getGmailStats(): IntegrationStat[] {
    if (!gmailMetrics) return [];
    return [
      { label: "Threads", value: gmailMetrics.totalThreads },
      { label: "Messages", value: gmailMetrics.totalMessages },
      { label: "Today", value: gmailMetrics.messagesToday },
      { label: "Response Rate", value: `${gmailMetrics.responseRate}%` },
    ];
  }

  function getHubSpotStats(): IntegrationStat[] {
    const platform = getPlatformStatus("hubspot");
    if (!platform?.connected) return [];
    return [
      { label: "Capabilities", value: platform.capabilities.length },
    ];
  }

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div>
      <SectionTabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "integrations" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 680 }}>
          {/* Summary bar */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            background: "var(--balboa-bg-alt)",
            borderRadius: 10,
            marginBottom: 4,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Plug size={16} style={{ color: "var(--balboa-blue)" }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--balboa-navy)" }}>
                Integration Hub
              </span>
              {statusData && (
                <span style={{
                  fontSize: 12,
                  color: "var(--balboa-text-muted)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}>
                  <CheckCircle size={12} style={{ color: "#2e7d32" }} />
                  {statusData.summary.connected} of {statusData.summary.total} connected
                </span>
              )}
            </div>
            <button
              onClick={() => fetchAllStatuses(true)}
              disabled={refreshing}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--balboa-text-muted)",
                background: "white",
                border: "1px solid var(--balboa-border)",
                borderRadius: 8,
                cursor: refreshing ? "not-allowed" : "pointer",
              }}
            >
              <RefreshCw size={12} style={refreshing ? { animation: "spin 1s linear infinite" } : undefined} />
              {refreshing ? "Refreshing..." : "Refresh All"}
            </button>
          </div>

          {/* Test result banner */}
          {Object.values(testResults).some(t => t.success !== undefined) && (
            <div style={{
              padding: "10px 16px",
              background: Object.values(testResults).every(t => t.success) ? "#e8f5e9" : "#fff3e0",
              borderRadius: 8,
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: Object.values(testResults).every(t => t.success) ? "#2e7d32" : "#e65100",
            }}>
              {Object.values(testResults).every(t => t.success) ? (
                <><CheckCircle size={14} /> All tested connections are healthy.</>
              ) : (
                <><AlertTriangle size={14} /> Some connections need attention.</>
              )}
              <button
                onClick={() => setTestResults({})}
                style={{
                  marginLeft: "auto",
                  fontSize: 11,
                  color: "inherit",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* ─── Gmail ──────────────────────────────────────────── */}
          <IntegrationCard
            name="Gmail"
            description={
              gmailStatus?.connected
                ? `Syncing emails from ${gmailStatus.email || "your account"}. Read-only access.`
                : "Connect your Gmail to see real email conversations, matched to leads automatically."
            }
            icon={Mail}
            iconGradient="linear-gradient(135deg, #ea4335, #c62828)"
            status={gmailStatus?.connected ? "connected" : "available"}
            connectMode="oauth"
            lastSync={gmailStatus?.lastSyncAt}
            stats={gmailStatus?.connected ? getGmailStats() : undefined}
            connectedLabel={gmailStatus?.email ? `${gmailStatus.email}` : "Connected"}
            loading={loading}
            syncing={syncingPlatform === "gmail"}
            testing={testingPlatform === "gmail"}
            webhookUrl={webhookUrl("/api/webhooks/gmail-push")}
            onConnect={handleGmailConnect}
            onDisconnect={() => handleDisconnect("gmail")}
            onSync={() => handleSync("gmail")}
            onTest={() => handleTest("email")}
          />

          {/* ─── Amplemarket ────────────────────────────────────── */}
          <IntegrationCard
            name="Amplemarket"
            description={
              resolveStatus("amplemarket") === "connected"
                ? "Import contacts from lead lists and enrich leads with email addresses and company data."
                : "Import prospecting lists and enrich lead data. Find email addresses for your LinkedIn contacts."
            }
            icon={Search}
            iconGradient="linear-gradient(135deg, #3B5BDB, #1e3a8a)"
            status={resolveStatus("amplemarket")}
            connectMode="api_key"
            lastSync={getPlatformStatus("amplemarket")?.lastSyncAt}
            lastSyncStatus={getPlatformStatus("amplemarket")?.lastSyncStatus}
            loading={loading}
            syncing={syncingPlatform === "amplemarket"}
            testing={testingPlatform === "amplemarket"}
            webhookUrl={webhookUrl("/api/webhooks/amplemarket")}
            onApiKeySubmit={(key) => handleApiKeySubmit("amplemarket", key)}
            onDisconnect={() => handleDisconnect("amplemarket")}
            onTest={() => handleTest("amplemarket")}
          />

          {/* ─── HubSpot ────────────────────────────────────────── */}
          <IntegrationCard
            name="HubSpot"
            description="Bi-directional CRM sync -- contacts, deals, sequences with open/click/reply tracking."
            icon={Building2}
            iconGradient="linear-gradient(135deg, #ff7a45, #ff4d4f)"
            status={resolveStatus("hubspot")}
            connectMode="oauth"
            lastSync={getPlatformStatus("hubspot")?.lastSyncAt}
            lastSyncStatus={getPlatformStatus("hubspot")?.lastSyncStatus}
            errorMessage={getPlatformStatus("hubspot")?.lastSyncError}
            stats={getHubSpotStats()}
            loading={loading}
            syncing={syncingPlatform === "hubspot"}
            testing={testingPlatform === "hubspot"}
            webhookUrl={webhookUrl("/api/webhooks/hubspot")}
            onConnect={handleHubSpotConnect}
            onDisconnect={() => handleDisconnect("hubspot")}
            onSync={() => handleSync("hubspot")}
            onTest={() => handleTest("hubspot")}
          />

          {/* ─── Aircall ────────────────────────────────────────── */}
          <IntegrationCard
            name="Aircall"
            description="Real-time call tracking via webhooks. Configure the webhook URL in your Aircall dashboard."
            icon={Phone}
            iconGradient="linear-gradient(135deg, #22c55e, #16a34a)"
            status={resolveStatus("aircall")}
            connectMode="webhook"
            lastSync={getPlatformStatus("aircall")?.lastSyncAt}
            loading={loading}
            syncing={syncingPlatform === "aircall"}
            testing={testingPlatform === "aircall"}
            webhookUrl={webhookUrl("/api/webhooks/aircall")}
            onTest={() => handleTest("aircall")}
            onDisconnect={resolveStatus("aircall") === "connected" ? () => handleDisconnect("aircall") : undefined}
          />

          {/* ─── Clay ───────────────────────────────────────────── */}
          <IntegrationCard
            name="Clay"
            description="Webhook-based lead enrichment. Push leads to Clay tables, receive enriched data back automatically."
            icon={Database}
            iconGradient="linear-gradient(135deg, #8b5cf6, #6d28d9)"
            status={resolveStatus("clay")}
            connectMode="webhook"
            lastSync={getPlatformStatus("clay")?.lastSyncAt}
            loading={loading}
            syncing={syncingPlatform === "clay"}
            testing={testingPlatform === "clay"}
            webhookUrl={webhookUrl("/api/webhooks/clay")}
            onTest={() => handleTest("clay")}
            onDisconnect={resolveStatus("clay") === "connected" ? () => handleDisconnect("clay") : undefined}
          />

          {/* ─── Fireflies ──────────────────────────────────────── */}
          <IntegrationCard
            name="Fireflies"
            description="Meeting transcript sync and AI summaries. Transcripts are processed automatically after calls."
            icon={Globe}
            iconGradient="linear-gradient(135deg, #f59e0b, #d97706)"
            status={resolveStatus("fireflies")}
            connectMode="api_key"
            lastSync={getPlatformStatus("fireflies")?.lastSyncAt}
            loading={loading}
            syncing={syncingPlatform === "fireflies"}
            testing={testingPlatform === "fireflies"}
            onApiKeySubmit={(key) => handleApiKeySubmit("fireflies", key)}
            onDisconnect={resolveStatus("fireflies") === "connected" ? () => handleDisconnect("fireflies") : undefined}
            onTest={() => handleTest("fireflies")}
          />

          {/* ─── Apify ──────────────────────────────────────────── */}
          <IntegrationCard
            name="Apify"
            description="LinkedIn activity scraping and lead enrichment. Configure scraping schedules and data pipelines."
            icon={Cpu}
            iconGradient="linear-gradient(135deg, #06b6d4, #0891b2)"
            status={resolveStatus("apify")}
            connectMode="api_key"
            lastSync={getPlatformStatus("apify")?.lastSyncAt}
            loading={loading}
            syncing={syncingPlatform === "apify"}
            testing={testingPlatform === "apify"}
            onApiKeySubmit={(key) => handleApiKeySubmit("apify", key)}
            onDisconnect={resolveStatus("apify") === "connected" ? () => handleDisconnect("apify") : undefined}
            onTest={() => handleTest("apify")}
          />

          {/* ─── LinkedIn Tracking (n8n) ────────────────────────── */}
          <IntegrationCard
            name="LinkedIn Tracking"
            description="Near real-time LinkedIn activity tracking via Apify scrapers and n8n automation workflows."
            icon={Linkedin}
            iconGradient="linear-gradient(135deg, #0077b5, #005885)"
            status={resolveStatus("linkedin")}
            connectMode="webhook"
            lastSync={getPlatformStatus("linkedin")?.lastSyncAt}
            loading={loading}
            webhookUrl={webhookUrl("/api/linkedin/track")}
            onTest={() => handleTest("linkedin")}
          />

          {/* ─── n8n Webhook Hub ─────────────────────────────────── */}
          <IntegrationCard
            name="n8n Automation"
            description="Central webhook hub for all n8n automation workflows. Copy URLs below into your n8n nodes."
            icon={Radio}
            iconGradient="linear-gradient(135deg, #ef4444, #b91c1c)"
            status={resolveStatus("n8n")}
            connectMode="webhook"
            loading={loading}
            onTest={() => handleTest("n8n")}
          >
            {/* Inline webhook URL directory */}
            <div style={{
              marginTop: 14,
              padding: 14,
              background: "var(--balboa-bg-alt)",
              borderRadius: 8,
              border: "1px solid var(--balboa-border)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Webhook size={13} style={{ color: "var(--balboa-blue)" }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-navy)" }}>
                  Webhook Endpoints
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11 }}>
                {[
                  { label: "Amplemarket", path: "/api/webhooks/amplemarket" },
                  { label: "HubSpot", path: "/api/webhooks/hubspot" },
                  { label: "Aircall", path: "/api/webhooks/aircall" },
                  { label: "Clay", path: "/api/webhooks/clay" },
                  { label: "Gmail Push", path: "/api/webhooks/gmail-push" },
                  { label: "LinkedIn", path: "/api/linkedin/track" },
                ].map(({ label, path }) => (
                  <WebhookUrlRow key={path} label={label} url={webhookUrl(path)} />
                ))}
              </div>
            </div>
          </IntegrationCard>
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

// ─── Webhook URL Row sub-component ──────────────────────────────

function WebhookUrlRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "4px 0",
    }}>
      <span style={{ color: "var(--balboa-text-muted)", minWidth: 80 }}>{label}:</span>
      <code style={{ color: "var(--balboa-text-secondary)", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
        {url}
      </code>
      <button
        onClick={handleCopy}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: copied ? "#2e7d32" : "var(--balboa-text-muted)",
          padding: "2px 4px",
          fontSize: 10,
          marginLeft: 8,
          flexShrink: 0,
        }}
        title={`Copy ${label} webhook URL`}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
