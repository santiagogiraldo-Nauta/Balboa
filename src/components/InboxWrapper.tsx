"use client";

import { useState } from "react";
import { Inbox, Send, Mail, ArrowRight } from "lucide-react";
import SectionTabBar from "./SectionTabBar";
import InboxSection from "./InboxSection";
import OutreachApprovalQueue from "./OutreachApprovalQueue";
import type { Lead, CommunicationThread, SupportedLanguage } from "@/lib/types";

type InboxTab = "conversations" | "queue";

interface InboxWrapperProps {
  leads: Lead[];
  communications: Record<string, CommunicationThread[]>;
  onNavigateToLead: (leadId: string) => void;
  onAskVasco: (prompt: string) => void;
  onCopyMessage: (text: string) => void;
  onGenerateMessage: (lead: Lead, type: string, channel?: "email" | "linkedin") => Promise<void>;
  generatingForLeadId: string | null;
  contentLanguage: SupportedLanguage;
  gmailConnected?: boolean;
  gmailLoading?: boolean;
  unmatchedThreads?: CommunicationThread[];
  onNavigateToSettings?: () => void;
}

const TABS = [
  { key: "conversations" as const, label: "Conversations", icon: <Inbox size={14} /> },
  { key: "queue" as const, label: "Queue", icon: <Send size={14} /> },
];

export default function InboxWrapper({
  leads,
  communications,
  onNavigateToLead,
  onAskVasco,
  onCopyMessage,
  onGenerateMessage,
  generatingForLeadId,
  contentLanguage,
  gmailConnected,
  gmailLoading,
  unmatchedThreads,
  onNavigateToSettings,
}: InboxWrapperProps) {
  const [activeTab, setActiveTab] = useState<InboxTab>("conversations");

  return (
    <div>
      <SectionTabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "conversations" && (
        <>
          {/* Gmail connection banner */}
          {!gmailConnected && !gmailLoading && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 16px",
              marginBottom: 12,
              background: "linear-gradient(135deg, var(--balboa-bg-alt), var(--balboa-bg-hover))",
              border: "1px solid var(--balboa-border)",
              borderRadius: 10,
              fontSize: 13,
              color: "var(--balboa-text-secondary)",
            }}>
              <Mail size={16} style={{ color: "var(--balboa-blue)", flexShrink: 0 }} />
              <span style={{ flex: 1 }}>
                Connect your Gmail to see real email conversations matched to your leads.
              </span>
              {onNavigateToSettings && (
                <button
                  onClick={onNavigateToSettings}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "5px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "white",
                    background: "var(--balboa-blue)",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Connect Gmail
                  <ArrowRight size={12} />
                </button>
              )}
            </div>
          )}

          {gmailLoading && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              marginBottom: 12,
              fontSize: 12,
              color: "var(--balboa-text-muted)",
            }}>
              <div style={{
                width: 14, height: 14, borderRadius: "50%",
                border: "2px solid var(--balboa-border)",
                borderTopColor: "var(--balboa-blue)",
                animation: "spin 1s linear infinite",
              }} />
              Syncing Gmail...
            </div>
          )}

          <div style={{ height: "calc(100vh - 130px)" }}>
            <InboxSection
              leads={leads}
              communications={communications}
              contentLanguage={contentLanguage}
              onNavigateToLead={onNavigateToLead}
              onGenerateMessage={onGenerateMessage}
              onAskVasco={onAskVasco}
              onCopyMessage={onCopyMessage}
              generatingForLeadId={generatingForLeadId}
              unmatchedThreads={unmatchedThreads}
            />
          </div>
        </>
      )}

      {activeTab === "queue" && (
        <OutreachApprovalQueue visible={true} />
      )}
    </div>
  );
}
