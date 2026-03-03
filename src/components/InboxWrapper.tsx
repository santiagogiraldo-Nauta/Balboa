"use client";

import { useState } from "react";
import { Inbox, Send } from "lucide-react";
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
}: InboxWrapperProps) {
  const [activeTab, setActiveTab] = useState<InboxTab>("conversations");

  return (
    <div>
      <SectionTabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "conversations" && (
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
          />
        </div>
      )}

      {activeTab === "queue" && (
        <OutreachApprovalQueue visible={true} />
      )}
    </div>
  );
}
