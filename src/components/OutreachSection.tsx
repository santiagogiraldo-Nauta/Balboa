"use client";

import { useState } from "react";
import { Send, Layers, Calendar } from "lucide-react";
import SectionTabBar from "./SectionTabBar";
import UnifiedOutreach from "./UnifiedOutreach";
import SequenceBuilder from "./SequenceBuilder";
import EventCommandCenter from "./EventCommandCenter";
import LeadContextPanel from "./LeadContextPanel";
import type { Lead, CommunicationThread, DraftMessage, SupportedLanguage, SalesEvent } from "@/lib/types";

type OutreachTab = "compose" | "sequences" | "events";

interface OutreachSectionProps {
  leads: Lead[];
  selectedLead: Lead | null;
  communications: Record<string, CommunicationThread[]>;
  contentLanguage: SupportedLanguage;
  events: SalesEvent[];
  // UnifiedOutreach callbacks
  onGenerateMessageInline: (lead: Lead, type: string) => Promise<void>;
  onCopyMessage: (text: string) => void;
  onNavigateToLead: (leadId: string) => void;
  generatingForLeadId: string | null;
  // LeadContextPanel callbacks
  onAskVasco: (prompt: string) => void;
  onUpdateLeadStatus: (leadId: string, status: Lead["status"]) => void;
  onAddNote: (leadId: string, note: string) => void;
  onAnalyzeLead: (lead: Lead) => void;
  onGenerateMessage: (lead: Lead, type: string, channel?: "email" | "linkedin") => void;
  onUpdateDraftStatus: (leadId: string, draftId: string, status: DraftMessage["status"]) => void;
  onBattleCardGenerate: (leadId: string, competitor: string) => void;
  onOpenEmailPopup: (prefill?: { subject?: string; body?: string; draftId?: string }) => void;
  onOpenLinkedInPopup: (prefill?: { body?: string; draftId?: string }) => void;
  onOpenProposalPopup: () => void;
  onOpenVideoPrep: () => void;
  onOpenPrepKit: () => void;
  onOpenMeetingScheduler: () => void;
  onOpenDeepResearch: () => void;
  generatingAction: string | null;
  leadAnalysis?: unknown;
  analyzingLead?: boolean;
  onLanguageChange: (lang: SupportedLanguage) => void;
}

const TABS = [
  { key: "compose" as const, label: "Compose", icon: <Send size={14} /> },
  { key: "sequences" as const, label: "Sequences", icon: <Layers size={14} /> },
  { key: "events" as const, label: "Events", icon: <Calendar size={14} /> },
];

export default function OutreachSection({
  leads,
  selectedLead,
  communications,
  contentLanguage,
  events,
  onGenerateMessageInline,
  onCopyMessage,
  onNavigateToLead,
  generatingForLeadId,
  onAskVasco,
  onUpdateLeadStatus,
  onAddNote,
  onAnalyzeLead,
  onGenerateMessage,
  onUpdateDraftStatus,
  onBattleCardGenerate,
  onOpenEmailPopup,
  onOpenLinkedInPopup,
  onOpenProposalPopup,
  onOpenVideoPrep,
  onOpenPrepKit,
  onOpenMeetingScheduler,
  onOpenDeepResearch,
  generatingAction,
  leadAnalysis,
  analyzingLead,
  onLanguageChange,
}: OutreachSectionProps) {
  const [activeTab, setActiveTab] = useState<OutreachTab>("compose");

  return (
    <div>
      <SectionTabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "compose" && (
        <UnifiedOutreach
          leads={leads}
          onGenerateMessage={onGenerateMessageInline}
          onCopyMessage={onCopyMessage}
          onNavigateToLead={onNavigateToLead}
          generatingForLeadId={generatingForLeadId}
          contentLanguage={contentLanguage}
          renderLeadContext={(lead) => (
            <LeadContextPanel
              lead={lead}
              communications={communications[lead.id] || []}
              language={contentLanguage}
              mode="outreach-sidebar"
              onAskVasco={onAskVasco}
              onUpdateLeadStatus={onUpdateLeadStatus}
              onAddNote={onAddNote}
              onAnalyzeLead={onAnalyzeLead}
              onGenerateMessage={onGenerateMessage}
              onUpdateDraftStatus={onUpdateDraftStatus}
              onBattleCardGenerate={onBattleCardGenerate}
              onCopyMessage={onCopyMessage}
              onOpenEmailPopup={onOpenEmailPopup}
              onOpenLinkedInPopup={onOpenLinkedInPopup}
              onOpenProposalPopup={onOpenProposalPopup}
              onOpenVideoPrep={onOpenVideoPrep}
              onOpenPrepKit={onOpenPrepKit}
              onOpenMeetingScheduler={onOpenMeetingScheduler}
              onOpenDeepResearch={onOpenDeepResearch}
              generatingAction={generatingAction}
              leadAnalysis={leadAnalysis}
              analyzingLead={analyzingLead}
              contentLanguage={contentLanguage}
              onLanguageChange={onLanguageChange}
            />
          )}
        />
      )}

      {activeTab === "sequences" && (
        <SequenceBuilder
          leads={leads}
          onNavigateToLead={onNavigateToLead}
        />
      )}

      {activeTab === "events" && (
        <EventCommandCenter
          events={events}
          leads={leads}
          onNavigateToLead={onNavigateToLead}
          language={contentLanguage}
        />
      )}
    </div>
  );
}
