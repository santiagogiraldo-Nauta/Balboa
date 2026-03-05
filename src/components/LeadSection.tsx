"use client";

import { useState } from "react";
import {
  Filter, RefreshCw, Users, MessageSquare, ChevronRight,
  Radar, Bell,
} from "lucide-react";
import type { Lead, SupportedLanguage, CommunicationThread, DraftMessage } from "@/lib/types";
import SectionTabBar, { type SectionTab } from "@/components/SectionTabBar";
import LeadContextPanel, {
  Avatar, ScoreRing, ChannelIndicator,
} from "@/components/LeadContextPanel";
import Prospecting from "@/components/Prospecting";
import SignalEngine from "@/components/SignalEngine";

// ─── Types ────────────────────────────────────────────────────────────

type LeadSectionTab = "my-leads" | "discover" | "signals";

interface LeadSectionProps {
  leads: Lead[];
  selectedLead: Lead | null;
  onSelectLead: (lead: Lead | null) => void;
  filteredLeads: Lead[];
  filterTier: string;
  setFilterTier: (v: string) => void;
  filterStatus: string;
  setFilterStatus: (v: string) => void;
  loading: boolean;
  loadingMessage: string;
  processedCount: number;
  totalCount: number;
  remainingConnections: any[];
  loadingMore: boolean;
  onLoadMore: (count: number) => void;
  communications: Record<string, CommunicationThread[]>;
  contentLanguage: SupportedLanguage;
  onLanguageChange: (lang: SupportedLanguage) => void;
  // LeadContextPanel callbacks
  onAskVasco: (prompt: string) => void;
  onUpdateLeadStatus: (leadId: string, status: Lead["status"]) => void;
  onAddNote: (leadId: string, note: string) => void;
  onAnalyzeLead: (lead: Lead) => void;
  onGenerateMessage: (lead: Lead, type: string, channel?: "email" | "linkedin") => void;
  onUpdateDraftStatus: (leadId: string, draftId: string, status: DraftMessage["status"]) => void;
  onBattleCardGenerate: (leadId: string, competitor: string) => void;
  battleCardGenerating?: string | null;
  onCopyMessage: (text: string) => void;
  onOpenEmailPopup: (prefill?: { subject?: string; body?: string; draftId?: string }) => void;
  onOpenLinkedInPopup: (prefill?: { body?: string; draftId?: string }) => void;
  onOpenProposalPopup: () => void;
  onOpenVideoPrep: () => void;
  onOpenPrepKit: () => void;
  onOpenMeetingScheduler: () => void;
  onOpenDeepResearch: () => void;
  generatingAction: string | null;
  leadAnalysis?: any;
  analyzingLead?: boolean;
  // Prospecting callbacks
  onAddToLeads: (prospect: any) => void;
  onProspectGenerateMessage: (prospect: any) => Promise<string>;
  // Signal engine
  onNavigateToLead: (leadId: string) => void;
  userId: string | null;
}

// ─── Tab definitions ──────────────────────────────────────────────────

const TABS: SectionTab<LeadSectionTab>[] = [
  { key: "my-leads", label: "My Leads", icon: <Users className="w-3.5 h-3.5" /> },
  { key: "discover", label: "Discover", icon: <Radar className="w-3.5 h-3.5" /> },
  { key: "signals", label: "Signals", icon: <Bell className="w-3.5 h-3.5" /> },
];

// ─── Component ────────────────────────────────────────────────────────

export default function LeadSection(props: LeadSectionProps) {
  const {
    leads,
    selectedLead,
    onSelectLead,
    filteredLeads,
    filterTier,
    setFilterTier,
    filterStatus,
    setFilterStatus,
    loading,
    loadingMessage,
    processedCount,
    totalCount,
    remainingConnections,
    loadingMore,
    onLoadMore,
    communications,
    contentLanguage,
    onLanguageChange,
    onAskVasco,
    onUpdateLeadStatus,
    onAddNote,
    onAnalyzeLead,
    onGenerateMessage,
    onUpdateDraftStatus,
    onBattleCardGenerate,
    battleCardGenerating,
    onCopyMessage,
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
    onAddToLeads,
    onProspectGenerateMessage,
    onNavigateToLead,
  } = props;

  const [activeTab, setActiveTab] = useState<LeadSectionTab>("my-leads");

  // Badge: lead count for My Leads tab
  const tabsWithBadges: SectionTab<LeadSectionTab>[] = TABS.map((t) => {
    if (t.key === "my-leads") return { ...t, badge: filteredLeads.length };
    return t;
  });

  // ─── My Leads tab ─────────────────────────────────────────────────

  const renderMyLeads = () => (
    <div className="p-6">
      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="card p-10 text-center max-w-md">
            <div
              className="w-10 h-10 border-3 rounded-full animate-spin mx-auto mb-4"
              style={{ borderColor: "var(--balboa-border)", borderTopColor: "var(--balboa-navy)" }}
            />
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--balboa-navy)" }}>
              {loadingMessage}
            </h2>
            {totalCount > 0 && (
              <div className="mt-3">
                <div className="rate-bar-track">
                  <div
                    className="rate-bar-fill"
                    style={{ width: `${(processedCount / totalCount) * 100}%`, background: "var(--balboa-navy)" }}
                  />
                </div>
                <p className="text-xs mt-2" style={{ color: "var(--balboa-text-muted)" }}>
                  {processedCount} / {totalCount}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lead list + detail panel */}
      {!loading && (
        <div style={{ display: "flex", gap: 20 }}>
          {/* Lead list */}
          <div style={{ width: selectedLead ? "45%" : "100%", transition: "width 0.3s ease", flexShrink: 0 }}>
            {/* Filter bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <Filter className="w-4 h-4" style={{ color: "var(--balboa-text-muted)" }} />
              <select value={filterTier} onChange={(e) => setFilterTier(e.target.value)}>
                <option value="all">All Tiers</option>
                <option value="hot">Hot</option>
                <option value="warm">Warm</option>
                <option value="cold">Cold</option>
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">All Status</option>
                <option value="new">New</option>
                <option value="researched">Researched</option>
                <option value="engaged">Engaged</option>
                <option value="opportunity">Opportunity</option>
                <option value="nurture">Nurture</option>
              </select>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--balboa-text-muted)", fontWeight: 500 }}>
                {filteredLeads.length} leads
              </span>
              {remainingConnections.length > 0 && (
                <button onClick={() => onLoadMore(50)} disabled={loadingMore} className="btn-ghost">
                  {loadingMore ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
                  {loadingMore ? "Loading..." : `+${Math.min(50, remainingConnections.length)} more`}
                </button>
              )}
            </div>

            {/* Lead cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "calc(100vh - 240px)", overflowY: "auto", paddingRight: 4 }}>
              {filteredLeads.map((lead) => (
                <div
                  key={lead.id}
                  onClick={() => onSelectLead(lead)}
                  className={`card card-hover fade-in
                    ${lead.icpScore?.tier === "hot" ? "priority-urgent" : lead.icpScore?.tier === "warm" ? "priority-medium" : "priority-low"}`}
                  style={{
                    padding: "12px 14px",
                    borderColor: selectedLead?.id === lead.id ? "var(--balboa-blue)" : undefined,
                    boxShadow: selectedLead?.id === lead.id ? "0 0 0 2px rgba(59, 91, 219, 0.15)" : undefined,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ position: "relative" }}>
                      <Avatar name={`${lead.firstName} ${lead.lastName}`} size={40} />
                      <div style={{
                        position: "absolute", bottom: -2, right: -2,
                        width: 18, height: 18, borderRadius: "50%",
                        background: (lead.icpScore?.overall || 0) >= 70 ? "#dc2626" : (lead.icpScore?.overall || 0) >= 40 ? "#f59f00" : "#3b5bdb",
                        color: "white", fontSize: 8, fontWeight: 800,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: "2px solid white",
                      }}>
                        {lead.icpScore?.overall || 0}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <h3 style={{ fontWeight: 600, fontSize: 13, color: "var(--balboa-navy)", letterSpacing: "-0.01em" }}>
                          {lead.firstName} {lead.lastName}
                        </h3>
                        <span className={`badge badge-${lead.icpScore?.tier}`}>{lead.icpScore?.tier?.toUpperCase()}</span>
                        <ChannelIndicator lead={lead} />
                      </div>
                      <p style={{ fontSize: 12, color: "var(--balboa-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                        {lead.position}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--balboa-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {lead.company}
                      </p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      {lead.draftMessages.length > 0 && (
                        <span style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3, color: "var(--balboa-blue)", fontWeight: 500 }}>
                          <MessageSquare className="w-3 h-3" /> {lead.draftMessages.length}
                        </span>
                      )}
                      <ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--balboa-text-light)" }} />
                    </div>
                  </div>
                  {lead.icpScore?.signals && lead.icpScore.signals.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {lead.icpScore.signals.slice(0, 3).map((s, i) => (
                        <span key={i} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "rgba(30,42,94,0.05)", color: "var(--balboa-navy)", fontWeight: 500 }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Lead detail panel */}
          {selectedLead && (
            <div className="card fade-in" style={{ width: "55%", padding: "22px 24px", maxHeight: "calc(100vh - 240px)", overflowY: "auto" }}>
              <LeadContextPanel
                lead={selectedLead}
                communications={communications[selectedLead.id] || []}
                language={contentLanguage}
                mode="full"
                onClose={() => onSelectLead(null)}
                onAskVasco={onAskVasco}
                onUpdateLeadStatus={onUpdateLeadStatus}
                onAddNote={onAddNote}
                onAnalyzeLead={onAnalyzeLead}
                onGenerateMessage={onGenerateMessage}
                onUpdateDraftStatus={onUpdateDraftStatus}
                onBattleCardGenerate={onBattleCardGenerate}
                battleCardGenerating={battleCardGenerating}
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
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ─── Discover tab ─────────────────────────────────────────────────

  const renderDiscover = () => (
    <div className="p-6">
      <Prospecting
        onAddToLeads={onAddToLeads}
        onGenerateMessage={onProspectGenerateMessage}
        onCopyMessage={onCopyMessage}
      />
    </div>
  );

  // ─── Signals tab ──────────────────────────────────────────────────

  const renderSignals = () => (
    <div className="p-6">
      <SignalEngine
        leads={leads}
        onNavigateToLead={onNavigateToLead}
        onGenerateMessage={onGenerateMessage}
      />
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div>
      <div className="px-6 pt-6">
        <SectionTabBar<LeadSectionTab>
          tabs={tabsWithBadges}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>

      {activeTab === "my-leads" && renderMyLeads()}
      {activeTab === "discover" && renderDiscover()}
      {activeTab === "signals" && renderSignals()}
    </div>
  );
}
