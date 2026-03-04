"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import Papa from "papaparse";
import JSZip from "jszip";
import {
  Upload, Users, CheckCircle, Clock,
  Target, Send, Sparkles,
  LogOut, Mail, Bell, BarChart3, Settings,
} from "lucide-react";
import type { Lead, Deal, Account, DraftMessage, CallLog, CallOutcome, VideoPrep, PrepKit, BattleCard, SupportedLanguage, SidebarSection } from "@/lib/types";
import { MOCK_LEADS } from "@/lib/mock-data";
import { createClient } from "@/lib/supabase/client";
import { getLeads, upsertLead, upsertLeads } from "@/lib/db";
import { trackEventClient } from "@/lib/tracking";
import VideoPrepModal from "@/components/VideoPrepModal";
import SalesPrepModal from "@/components/SalesPrepModal";
import AnalyzerPanel from "@/components/AnalyzerPanel";
import MeetingSchedulerModal from "@/components/MeetingSchedulerModal";
import EmailPopup from "@/components/EmailPopup";
import LinkedInPopup from "@/components/LinkedInPopup";
import ProposalCreatorPopup from "@/components/ProposalCreatorPopup";
import DeepResearchPanel from "@/components/DeepResearchPanel";
import BalboaAssistant from "@/components/BalboaAssistant";
import HomeSection from "@/components/HomeSection";
import LeadSection from "@/components/LeadSection";
import InboxWrapper from "@/components/InboxWrapper";
import OutreachSection from "@/components/OutreachSection";
import DealsSection from "@/components/DealsSection";
import InsightsSection from "@/components/InsightsSection";
import SettingsSection from "@/components/SettingsSection";
import { getClientConfig } from "@/lib/config-client";
import { mockDeals, mockAccounts } from "@/lib/mock-phase2";
import { mockEvents } from "@/lib/mock-events";
import { mockCommunications } from "@/lib/mock-communications";
import type { SalesEvent, CommunicationThread } from "@/lib/types";

export default function Dashboard() {
  // Mode detection — must be before useState calls
  const supabase = createClient();
  const { isSandbox } = getClientConfig();

  // Core data — production starts empty, sandbox starts with demo data
  const [leads, setLeads] = useState<Lead[]>(isSandbox ? MOCK_LEADS : []);
  const [sidebarSection, setSidebarSection] = useState<SidebarSection>("home");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [filterTier, setFilterTier] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showVideoPrep, setShowVideoPrep] = useState(false);
  const [showPrepKit, setShowPrepKit] = useState(false);
  const [contentLanguage, setContentLanguage] = useState<SupportedLanguage>("english");
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [remainingConnections, setRemainingConnections] = useState<any[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [generatingForLeadId, setGeneratingForLeadId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [dbReady, setDbReady] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showAnalyzer, setShowAnalyzer] = useState(false);
  const [showMeetingScheduler, setShowMeetingScheduler] = useState(false);
  const [generatingAction, setGeneratingAction] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [leadAnalysis, setLeadAnalysis] = useState<any>(null);
  const [analyzingLead, setAnalyzingLead] = useState(false);
  const [deals] = useState(isSandbox ? mockDeals : []);
  const [accounts] = useState(isSandbox ? mockAccounts : []);
  const [showEmailPopup, setShowEmailPopup] = useState(false);
  const [showLinkedInPopup, setShowLinkedInPopup] = useState(false);
  const [showProposalPopup, setShowProposalPopup] = useState(false);
  const [popupPrefill, setPopupPrefill] = useState<{ subject?: string; body?: string; draftId?: string } | null>(null);
  // Phase 6 state — Vasco
  const [vascoPrompt, setVascoPrompt] = useState<string | null>(null);
  const [vascoOpen, setVascoOpen] = useState(false);
  const [showDeepResearch, setShowDeepResearch] = useState(false);
  const [events] = useState<SalesEvent[]>(isSandbox ? mockEvents : []);
  const [communications, setCommunications] = useState<Record<string, CommunicationThread[]>>(isSandbox ? mockCommunications : {});
  // Gmail integration state
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [unmatchedThreads, setUnmatchedThreads] = useState<CommunicationThread[]>([]);

  // Adapt PipelineDeal[] to Deal[] for components that expect the canonical Deal type
  const typedDeals: Deal[] = useMemo(() => deals.map((d) => ({
    id: d.id,
    userId: "",
    accountId: "",
    dealName: d.deal_name,
    amount: d.amount,
    dealStage: (d.deal_stage === "closed_won" ? "closed_won" : d.deal_stage === "closed_lost" ? "closed_lost" : d.deal_stage === "contracting" || d.deal_stage === "go" ? "negotiation" : d.deal_stage === "proposal_review" ? "proposal" : "qualification") as Deal["dealStage"],
    probability: d.probability,
    dealHealth: d.deal_health,
    leadId: d.lead_id,
    createdAt: d.create_date,
    updatedAt: d.create_date,
  })), [deals]);

  // Adapt mockAccounts to Account[] for components that expect the canonical Account type
  const typedAccounts: Account[] = useMemo(() => accounts.map((a) => ({
    id: a.id,
    userId: "",
    companyName: a.companyName,
    industry: a.industry,
    estimatedRevenue: a.estimatedRevenue,
    employeeCount: a.employeeCount,
    website: a.website,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })), [accounts]);

  // ⌘K / Ctrl+K keyboard shortcut to toggle Vasco
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setVascoOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Load user + leads from Supabase on mount (with timeout guard)
  useEffect(() => {
    // Sandbox mode: skip Supabase, use mock data immediately
    if (isSandbox) {
      console.log("[Balboa] Sandbox mode — loading mock data");
      setDbReady(true);
      setInitialLoading(false);
      return;
    }

    let didTimeout = false;
    const timeout = setTimeout(() => {
      didTimeout = true;
      console.warn("Supabase auth timed out — loading with current data");
      setDbReady(true);
      setInitialLoading(false);
    }, 6000); // 6s max wait

    const loadUserAndLeads = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (didTimeout) return; // timeout already fired
        if (!user) {
          clearTimeout(timeout);
          setDbReady(true);
          setInitialLoading(false);
          return;
        }
        setUserId(user.id);
        setUserName(user.user_metadata?.full_name || user.email || "");

        try {
          const dbLeads = await getLeads(supabase, user.id);
          if (!didTimeout && dbLeads.length > 0) {
            setLeads(dbLeads);
          }
        } catch (dbErr) {
          console.error("Failed to load leads from DB:", dbErr);
        }
        if (!didTimeout) {
          setDbReady(true);
        }
      } catch (err) {
        console.error("Failed to load user/leads:", err);
        // Fallback to current state (empty in production, mock in sandbox)
      }
      if (!didTimeout) {
        clearTimeout(timeout);
        setInitialLoading(false);
      }
    };
    loadUserAndLeads();
    return () => clearTimeout(timeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Gmail sync — fetch real email threads silently in the background
  // Uses localStorage to avoid redundant syncs (5-minute cooldown)
  const [gmailSyncDone, setGmailSyncDone] = useState(false);

  useEffect(() => {
    if (isSandbox) return; // Skip in sandbox mode

    const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
    const LS_KEY = "balboa_gmail_last_sync";

    async function syncGmailSilently() {
      // Check localStorage for last sync time
      const lastSyncStr = localStorage.getItem(LS_KEY);
      const lastSyncTime = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;
      const timeSinceSync = Date.now() - lastSyncTime;

      // Skip sync if within cooldown (but still mark connected if we synced before)
      if (lastSyncTime > 0 && timeSinceSync < SYNC_COOLDOWN_MS) {
        console.log("[Balboa] Gmail sync skipped — last sync was", Math.round(timeSinceSync / 1000), "s ago");
        setGmailConnected(true); // Assume still connected
        setGmailSyncDone(true);
        return;
      }

      // Sync silently — no loading state, no spinner
      try {
        const res = await fetch("/api/gmail/sync");
        const data = await res.json();

        if (data.connected) {
          setGmailConnected(true);
          // Production: only show real Gmail data (no mock threads)
          const merged: Record<string, CommunicationThread[]> = {};

          // Add real Gmail email threads matched to leads
          for (const [leadId, threads] of Object.entries(data.matched as Record<string, CommunicationThread[]>)) {
            if (!merged[leadId]) merged[leadId] = [];
            merged[leadId].push(...threads);
          }

          setCommunications(merged);
          setUnmatchedThreads(data.unmatched || []);

          // Store sync timestamp in localStorage
          localStorage.setItem(LS_KEY, String(Date.now()));
        }
      } catch (err) {
        console.error("Gmail sync failed:", err);
      }
      setGmailSyncDone(true);
    }

    syncGmailSilently();
  }, [isSandbox]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-import Gmail contacts when sync completes with 0 leads
  useEffect(() => {
    if (isSandbox || !gmailSyncDone || !gmailConnected) return;
    if (leads.length > 0) return; // Already have leads, skip import

    const LS_IMPORT_KEY = "balboa_gmail_auto_imported";
    if (localStorage.getItem(LS_IMPORT_KEY)) return; // Already imported once

    async function autoImportContacts() {
      try {
        console.log("[Balboa] Auto-importing Gmail contacts (0 leads detected)");
        const res = await fetch("/api/gmail/import-contacts", { method: "POST" });
        const data = await res.json();

        if (data.imported > 0) {
          console.log(`[Balboa] Auto-imported ${data.imported} contacts from Gmail`);
          localStorage.setItem(LS_IMPORT_KEY, String(Date.now()));

          // Reload leads from database
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const dbLeads = await getLeads(supabase, user.id);
            if (dbLeads.length > 0) {
              setLeads(dbLeads);
            }
          }

          // Re-sync Gmail to re-match threads against newly imported leads
          console.log("[Balboa] Re-syncing Gmail to match against new leads...");
          try {
            const syncRes = await fetch("/api/gmail/sync");
            const syncData = await syncRes.json();
            if (syncData.connected) {
              const merged: Record<string, CommunicationThread[]> = {};
              for (const [leadId, threads] of Object.entries(syncData.matched as Record<string, CommunicationThread[]>)) {
                if (!merged[leadId]) merged[leadId] = [];
                merged[leadId].push(...threads);
              }
              setCommunications(merged);
              setUnmatchedThreads(syncData.unmatched || []);
              localStorage.setItem("balboa_gmail_last_sync", String(Date.now()));
              console.log(`[Balboa] Re-sync complete: ${syncData.matchedCount || 0} matched, ${syncData.unmatchedCount || 0} unmatched`);
            }
          } catch (syncErr) {
            console.error("[Balboa] Re-sync after import failed:", syncErr);
          }
        } else {
          // Mark as imported even if 0 to prevent retries
          localStorage.setItem(LS_IMPORT_KEY, String(Date.now()));
        }
      } catch (err) {
        console.error("[Balboa] Auto-import failed:", err);
      }
    }

    autoImportContacts();
  }, [isSandbox, gmailSyncDone, gmailConnected, leads.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle URL params from Gmail OAuth callback redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailParam = params.get("gmail");
    const sectionParam = params.get("section");

    if (sectionParam === "settings") {
      setSidebarSection("settings");
    }

    if (gmailParam === "connected") {
      setGmailConnected(true);
      setToastMessage("Gmail connected successfully");
      setTimeout(() => setToastMessage(null), 3000);
      // Clean up URL params
      window.history.replaceState({}, "", "/");
    } else if (gmailParam === "error") {
      const reason = params.get("reason") || "unknown";
      setToastMessage(`Gmail connection failed: ${reason}`);
      setTimeout(() => setToastMessage(null), 3000);
      window.history.replaceState({}, "", "/");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist lead changes to Supabase (debounced single lead updates)
  const persistLead = useCallback(async (lead: Lead) => {
    if (!userId || !dbReady) return;
    try {
      await upsertLead(supabase, userId, lead);
    } catch (err) {
      console.error("Failed to persist lead:", err);
    }
  }, [userId, dbReady, supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  // Navigation handler
  const navigateTo = (section: SidebarSection) => {
    setSidebarSection(section);
    setSelectedLead(null);
    trackEventClient({ eventCategory: "navigation", eventAction: "section_viewed", metadata: { section } });
  };

  // Navigate to a specific lead from other components
  const handleNavigateToLead = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (lead) {
      setSidebarSection("leads");
      setSelectedLead(lead);
      setLeadAnalysis(null); // Clear previous analysis
      trackEventClient({ eventCategory: "lead", eventAction: "lead_viewed", leadId, leadTier: lead.icpScore?.tier });
    }
  };

  // Analyze a specific lead using AI + playbook intelligence
  const analyzeLead = async (lead: Lead) => {
    setAnalyzingLead(true);
    setLeadAnalysis(null);
    try {
      const resp = await fetch("/api/analyze/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const data = await resp.json();
      if (data.error) {
        // Fallback: generate local analysis from lead data
        const tier = lead.icpScore?.tier || "cold";
        const hasEmail = lead.channels?.email || lead.email;
        setLeadAnalysis({
          leadName: `${lead.firstName} ${lead.lastName}`,
          urgency: tier === "hot" ? "immediate" : tier === "warm" ? "high" : "medium",
          recommendedChannel: hasEmail ? "email" : "linkedin",
          recommendedTiming: "Tuesday at 10:00 AM",
          reasoning: `${lead.firstName} is a ${tier} lead at ${lead.company}. ${hasEmail ? "Email has higher reply rates for this lead tier." : "LinkedIn is the primary channel available."}`,
          recommendedAction: tier === "hot" ? "Send personalized outreach immediately" : "Research and prepare targeted message",
          expectedOutcomes: {
            replyRate: tier === "hot" ? 0.55 : tier === "warm" ? 0.35 : 0.15,
            meetingRate: tier === "hot" ? 0.38 : tier === "warm" ? 0.20 : 0.08,
            closeRate: tier === "hot" ? 0.22 : tier === "warm" ? 0.12 : 0.04,
          },
        });
      } else {
        setLeadAnalysis(data);
      }
    } catch {
      // Fallback analysis
      const tier = lead.icpScore?.tier || "cold";
      setLeadAnalysis({
        leadName: `${lead.firstName} ${lead.lastName}`,
        urgency: tier === "hot" ? "immediate" : "high",
        recommendedChannel: lead.email ? "email" : "linkedin",
        recommendedTiming: "Tuesday at 10:00 AM",
        reasoning: `Based on ${lead.firstName}'s profile at ${lead.company} and ${tier} tier classification.`,
        recommendedAction: "Send personalized outreach",
        expectedOutcomes: {
          replyRate: tier === "hot" ? 0.55 : 0.30,
          meetingRate: tier === "hot" ? 0.38 : 0.18,
          closeRate: tier === "hot" ? 0.22 : 0.10,
        },
      });
    }
    setAnalyzingLead(false);
  };

  // Handle call log submission
  const handleCallLogSubmit = (data: {
    callLog: CallLog;
    leadId: string;
    generatedDrafts: { type: CallOutcome["type"]; subject: string; body: string }[];
  }) => {
    setLeads(prev => prev.map(l => {
      if (l.id !== data.leadId) return l;
      const newDrafts = data.generatedDrafts.map((d, i) => ({
        id: `draft-gen-${Date.now()}-${i}`,
        type: "call_followup" as const,
        channel: "email" as const,
        subject: d.subject,
        body: d.body,
        status: "draft" as const,
        createdAt: new Date().toISOString(),
        personalization: [`Generated from call on ${new Date(data.callLog.date).toLocaleDateString()}`],
      }));
      const newTimeline = {
        id: `tp-call-${Date.now()}`,
        channel: "call" as const,
        type: "call_completed",
        description: `${data.callLog.duration || ""} call via ${data.callLog.platform.replace("_", " ")} — ${data.callLog.outcomes.length} outcome${data.callLog.outcomes.length !== 1 ? "s" : ""} logged`,
        date: data.callLog.date,
      };
      return {
        ...l,
        callLogs: [...(l.callLogs || []), data.callLog],
        draftMessages: [...l.draftMessages, ...newDrafts],
        touchpointTimeline: [...l.touchpointTimeline, newTimeline],
      };
    }));
    // Call modal removed — calls auto-logged via integration

    // Track call events
    trackEventClient({
      eventCategory: "call",
      eventAction: "call_logged",
      leadId: data.leadId,
      channel: "call",
      metadata: { platform: data.callLog.platform, duration: data.callLog.duration },
    });
    if (data.callLog.outcomes.length > 0) {
      trackEventClient({
        eventCategory: "call",
        eventAction: "call_outcome_detected",
        leadId: data.leadId,
        metadata: { outcomes: data.callLog.outcomes.map((o: CallOutcome) => o.type) },
      });
    }
    if (data.generatedDrafts.length > 0) {
      trackEventClient({
        eventCategory: "call",
        eventAction: "call_drafts_generated",
        leadId: data.leadId,
        numericValue: data.generatedDrafts.length,
      });
    }

    handleNavigateToLead(data.leadId);
  };

  // Handle video prep save
  const handleVideoPrepSave = (prep: VideoPrep) => {
    setLeads(prev => prev.map(l => {
      if (l.id !== prep.leadId) return l;
      return { ...l, videoPreps: [...(l.videoPreps || []), prep] };
    }));
    if (selectedLead?.id === prep.leadId) {
      setSelectedLead(prev => prev ? { ...prev, videoPreps: [...(prev.videoPreps || []), prep] } : prev);
    }
    trackEventClient({ eventCategory: "enablement", eventAction: "video_prep_created", leadId: prep.leadId });
  };

  const handlePrepKitSave = (kit: PrepKit) => {
    setLeads(prev => prev.map(l => {
      if (l.id !== kit.leadId) return l;
      return { ...l, prepKits: [...(l.prepKits || []), kit] };
    }));
    if (selectedLead?.id === kit.leadId) {
      setSelectedLead(prev => prev ? { ...prev, prepKits: [...(prev.prepKits || []), kit] } : prev);
    }
    trackEventClient({ eventCategory: "enablement", eventAction: "prep_kit_created", leadId: kit.leadId });
  };

  const handleBattleCardGenerate = (leadId: string, competitor: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    const detectedCompetitor = competitor === "auto"
      ? (lead.companyIntel?.techStack?.find(t =>
          ["sap", "oracle", "blue yonder", "e2open", "fourkites", "project44", "flexport", "descartes", "coupa"].some(c => t.toLowerCase().includes(c))
        ) || "other")
      : competitor;
    const displayName = detectedCompetitor.charAt(0).toUpperCase() + detectedCompetitor.slice(1);
    const newCard: BattleCard = {
      id: `bc-${Date.now()}`,
      leadId,
      competitor: "other",
      competitorDisplayName: displayName,
      strengths: ["Established market presence", "Existing customer integrations"],
      weaknesses: ["Slow implementation timelines", "Limited mid-market focus"],
      balboaDifferentiators: ["6-8 week deployment vs 6+ months", "Purpose-built for mid-market distributors", "Autonomous action on alerts, not just visibility"],
      killerQuestions: ["How long did implementation take, and what % of features are you using?", "When an alert fires, how quickly does someone act on it?"],
      landmines: ["Avoid direct attacks on existing investment — position Balboa as complementary"],
      autoDetectedFrom: "companyIntel.techStack",
      createdAt: new Date().toISOString(),
    };
    setLeads(prev => prev.map(l => {
      if (l.id !== leadId) return l;
      return { ...l, battleCards: [...(l.battleCards || []), newCard] };
    }));
    if (selectedLead?.id === leadId) {
      setSelectedLead(prev => prev ? { ...prev, battleCards: [...(prev.battleCards || []), newCard] } : prev);
    }
    trackEventClient({ eventCategory: "enablement", eventAction: "battle_card_created", leadId });
  };

  // Add quick note to lead timeline
  const handleAddNote = (leadId: string, note: string) => {
    if (!note.trim()) return;
    const newEvent = {
      id: `note-${Date.now()}`,
      channel: "linkedin" as const,
      type: "manual_note",
      description: note.trim(),
      date: new Date().toISOString(),
    };
    setLeads(prev => prev.map(l => {
      if (l.id !== leadId) return l;
      return { ...l, touchpointTimeline: [...l.touchpointTimeline, newEvent] };
    }));
    if (selectedLead?.id === leadId) {
      setSelectedLead(prev => prev ? { ...prev, touchpointTimeline: [...prev.touchpointTimeline, newEvent] } : prev);
    }
    trackEventClient({ eventCategory: "lead", eventAction: "note_added", leadId });
  };

  // Handle lead updates from components
  const handleUpdateLead = (leadId: string, updates: Partial<Lead>) => {
    setLeads(prev => {
      const updated = prev.map(l => l.id === leadId ? { ...l, ...updates } : l);
      const updatedLead = updated.find(l => l.id === leadId);
      if (updatedLead) persistLead(updatedLead);
      return updated;
    });
    if (selectedLead?.id === leadId) {
      setSelectedLead(prev => prev ? { ...prev, ...updates } : prev);
    }
  };

  const processCSVText = useCallback(async (csvText: string) => {
    const lines = csvText.split("\n");
    let headerIndex = 0;
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      if (lines[i].includes("First Name") && lines[i].includes("Last Name")) {
        headerIndex = i;
        break;
      }
    }
    const cleanedCSV = lines.slice(headerIndex).join("\n");

    const results = Papa.parse(cleanedCSV, { header: true, skipEmptyLines: true });
    const connections = (results.data as Record<string, string>[])
      .map((row) => ({
        firstName: row["First Name"] || row["firstName"] || "",
        lastName: row["Last Name"] || row["lastName"] || "",
        company: row["Company"] || row["company"] || "",
        position: row["Position"] || row["position"] || row["Title"] || "",
        connectedOn: row["Connected On"] || row["connectedOn"] || "",
        email: row["Email Address"] || row["email"] || "",
        url: row["URL"] || row["url"] || "",
      }))
      .filter((c) => c.firstName && c.company);

    const icpKeywords = [
      "supply chain", "procurement", "logistics", "import", "export", "operations",
      "warehouse", "distribution", "inventory", "sourcing", "freight", "shipping",
      "transportation", "customs", "trade", "purchasing", "demand planning",
      "coo", "cfo", "cio", "vp", "director", "head of", "chief", "manager",
      "wholesale", "distributor", "manufacturer", "retail"
    ];

    const scored = connections.map(c => {
      const text = `${c.position} ${c.company}`.toLowerCase();
      const matchCount = icpKeywords.filter(k => text.includes(k)).length;
      return { ...c, preScore: matchCount };
    });
    scored.sort((a, b) => b.preScore - a.preScore);

    // Convert ALL connections to lightweight leads immediately so they appear in the LinkedIn Queue
    const lightweightLeads: Lead[] = scored.map((c, idx) => ({
      id: `li-${c.firstName}-${c.lastName}-${idx}-${Date.now()}`.toLowerCase().replace(/\s/g, "-"),
      firstName: c.firstName,
      lastName: c.lastName,
      company: c.company,
      position: c.position,
      connectedOn: c.connectedOn || "",
      email: c.email || undefined,
      linkedinUrl: c.url || "",
      icpScore: {
        overall: c.preScore * 10, // rough score from keyword matching
        companyFit: 0,
        roleFit: 0,
        industryFit: 0,
        signals: c.preScore > 0 ? ["ICP keyword match"] : [],
        tier: (c.preScore >= 3 ? "hot" : c.preScore >= 1 ? "warm" : "cold") as "hot" | "warm" | "cold",
      },
      status: "new" as const,
      contactStatus: "not_contacted" as const,
      linkedinStage: "connected" as const,
      notes: "",
      draftMessages: [],
      engagementActions: [],
      channels: {
        linkedin: true,
        email: !!c.email,
        linkedinConnected: true,
        emailVerified: !!c.email,
      },
      emailCampaigns: [],
      touchpointTimeline: [{
        id: `tp-import-${idx}`,
        channel: "linkedin" as const,
        type: "connection_accepted",
        description: "Imported from LinkedIn export",
        date: c.connectedOn ? new Date(c.connectedOn).toISOString() : new Date().toISOString(),
      }],
    }));

    // Set all leads immediately — they show up in LinkedIn Queue right away
    setLeads(prev => {
      const existingIds = new Set(prev.filter(l => !l.id.startsWith("li-")).map(l => l.id));
      const existingLeads = prev.filter(l => existingIds.has(l.id));
      return [...existingLeads, ...lightweightLeads].sort((a, b) => (b.icpScore?.overall || 0) - (a.icpScore?.overall || 0));
    });
    // Persist lightweight leads to Supabase
    if (userId) {
      upsertLeads(supabase, userId, lightweightLeads).catch(err => console.error("Failed to persist imported leads:", err));
    }

    // Track CSV import event
    trackEventClient({
      eventCategory: "lead",
      eventAction: "csv_imported",
      numericValue: scored.length,
      metadata: { icpMatches: scored.filter(c => c.preScore > 0).length },
    });

    setLoadingMessage(`${scored.length} connections imported. AI-scoring top 50 ICP matches...`);

    // Now AI-score the top 50 for deeper analysis
    const INITIAL_BATCH = 50;
    const toProcess = scored.slice(0, INITIAL_BATCH);
    const remaining = scored.slice(INITIAL_BATCH);
    setRemainingConnections(remaining);
    setTotalCount(toProcess.length);

    const batchSize = 10;

    for (let i = 0; i < toProcess.length; i += batchSize) {
      const batch = toProcess.slice(i, i + batchSize);
      setProcessedCount(i);
      setLoadingMessage(`Deep-scoring ${i + 1}-${Math.min(i + batchSize, toProcess.length)} of ${toProcess.length}...`);

      try {
        const resp = await fetch("/api/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connections: batch }),
        });
        const data = await resp.json();
        if (data.leads) {
          // Replace the lightweight leads with the AI-scored versions
          const scoredIds = new Set((data.leads as Lead[]).map((l: Lead) => `${l.firstName}-${l.lastName}`.toLowerCase()));
          setLeads(prev => {
            const kept = prev.filter(l => {
              if (!l.id.startsWith("li-")) return true; // keep non-imported leads
              const key = `${l.firstName}-${l.lastName}`.toLowerCase();
              return !scoredIds.has(key); // remove lightweight if we have AI-scored version
            });
            return [...kept, ...data.leads].sort((a, b) => (b.icpScore?.overall || 0) - (a.icpScore?.overall || 0));
          });
          // Persist AI-scored leads to Supabase
          if (userId) {
            upsertLeads(supabase, userId, data.leads).catch(err => console.error("Failed to persist scored leads:", err));
          }
        }
      } catch (err) {
        console.error("Batch scoring error:", err);
      }
    }

    setLoading(false);
    setLoadingMessage("");
  }, []);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);

    if (file.name.endsWith(".zip")) {
      setLoadingMessage("Extracting Connections.csv from ZIP...");
      try {
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);

        let connectionsFile: JSZip.JSZipObject | null = null;
        zip.forEach((relativePath, zipEntry) => {
          if (relativePath.toLowerCase().includes("connections") && relativePath.endsWith(".csv")) {
            connectionsFile = zipEntry;
          }
        });

        if (!connectionsFile) {
          setLoading(false);
          setLoadingMessage("");
          alert("Could not find Connections.csv in the ZIP file.");
          return;
        }

        const csvText = await (connectionsFile as JSZip.JSZipObject).async("string");
        setLoadingMessage("Parsing connections...");
        await processCSVText(csvText);
      } catch (err) {
        console.error("ZIP extraction error:", err);
        setLoading(false);
        setLoadingMessage("");
        alert("Failed to read ZIP file.");
      }
    } else {
      setLoadingMessage("Parsing CSV...");
      const text = await file.text();
      await processCSVText(text);
    }
  }, [processCSVText]);

  const loadMoreConnections = async (count: number = 50) => {
    if (remainingConnections.length === 0) return;
    setLoadingMore(true);
    const nextBatch = remainingConnections.slice(0, count);
    const rest = remainingConnections.slice(count);
    setRemainingConnections(rest);
    setTotalCount(nextBatch.length);
    setProcessedCount(0);

    const batchSize = 10;
    const newLeads: Lead[] = [];

    for (let i = 0; i < nextBatch.length; i += batchSize) {
      const batch = nextBatch.slice(i, i + batchSize);
      setProcessedCount(i);
      try {
        const resp = await fetch("/api/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connections: batch }),
        });
        const data = await resp.json();
        if (data.leads) {
          newLeads.push(...data.leads);
          setLeads(prev => [...prev, ...newLeads].sort((a, b) => (b.icpScore?.overall || 0) - (a.icpScore?.overall || 0)));
        }
      } catch (err) {
        console.error("Batch scoring error:", err);
      }
    }
    setLoadingMore(false);
  };

  const generateMessage = async (lead: Lead, type: string, channel?: "email" | "linkedin") => {
    setGeneratingAction(type);
    try {
      const resp = await fetch("/api/generate-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead, messageType: type, language: contentLanguage, channel }),
      });
      const data = await resp.json();
      if (data.message) {
        const updatedLead = { ...lead, draftMessages: [...lead.draftMessages, data.message] };
        setLeads(prev => prev.map(l =>
          l.id === lead.id ? updatedLead : l
        ));
        if (selectedLead?.id === lead.id) {
          setSelectedLead(updatedLead);
        }
        persistLead(updatedLead);
        setToastMessage(`${channel === "email" ? "Email" : "LinkedIn"} draft generated!`);
        setTimeout(() => setToastMessage(null), 2500);
        trackEventClient({
          eventCategory: "outreach",
          eventAction: "draft_created",
          leadId: lead.id,
          templateType: type,
          leadTier: lead.icpScore?.tier,
        });
      }
    } catch (err) {
      console.error("Message generation error:", err);
      setToastMessage("Failed to generate message");
      setTimeout(() => setToastMessage(null), 2500);
    }
    setGeneratingAction(null);
  };

  // Inline message generation (used from Today / Follow-ups / LinkedIn Queue cards)
  const generateMessageInline = async (lead: Lead, type: string) => {
    setGeneratingForLeadId(lead.id);
    try {
      const resp = await fetch("/api/generate-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead, messageType: type, language: contentLanguage }),
      });
      const data = await resp.json();
      if (data.message) {
        const updatedLead = { ...lead, draftMessages: [...lead.draftMessages, data.message] };
        setLeads(prev => prev.map(l =>
          l.id === lead.id ? updatedLead : l
        ));
        if (selectedLead?.id === lead.id) {
          setSelectedLead(updatedLead);
        }
        persistLead(updatedLead);
      }
    } catch (err) {
      console.error("Inline message generation error:", err);
    }
    setGeneratingForLeadId(null);
  };

  const updateDraftStatus = (leadId: string, draftId: string, status: DraftMessage["status"]) => {
    setLeads(prev => prev.map(l =>
      l.id === leadId
        ? {
          ...l,
          draftMessages: l.draftMessages.map(d =>
            d.id === draftId ? { ...d, status, approvedAt: status === "approved" ? new Date().toISOString() : undefined } : d
          )
        }
        : l
    ));
    if (selectedLead?.id === leadId) {
      setSelectedLead(prev => prev ? {
        ...prev,
        draftMessages: prev.draftMessages.map(d =>
          d.id === draftId ? { ...d, status, approvedAt: status === "approved" ? new Date().toISOString() : undefined } : d
        )
      } : null);
    }
    // Track draft approval/rejection
    if (status === "approved") {
      trackEventClient({ eventCategory: "outreach", eventAction: "draft_approved", leadId });
    } else if (status === "rejected") {
      trackEventClient({ eventCategory: "outreach", eventAction: "draft_rejected", leadId });
    }
  };

  const updateLeadStatus = (leadId: string, status: Lead["status"]) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status } : l));
    if (selectedLead?.id === leadId) {
      setSelectedLead(prev => prev ? { ...prev, status } : null);
    }
    trackEventClient({ eventCategory: "lead", eventAction: "lead_status_changed", leadId, metadata: { newStatus: status } });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setToastMessage("Copied to clipboard!");
    setTimeout(() => setToastMessage(null), 2000);
    trackEventClient({ eventCategory: "outreach", eventAction: "message_copied" });
  };

  const handleSendFromPopup = async (channel: "email" | "linkedin", data: { subject?: string; body: string; draftId?: string }) => {
    if (!selectedLead) return;
    try {
      const resp = await fetch("/api/send-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: selectedLead.id,
          channel,
          message: data.body,
          subject: data.subject,
        }),
      });
      const result = await resp.json();

      // If draftId provided, mark it as sent
      if (data.draftId) updateDraftStatus(selectedLead.id, data.draftId, "sent");

      // Auto-advance lead status
      if (selectedLead.contactStatus === "not_contacted") {
        handleUpdateLead(selectedLead.id, { contactStatus: "neutral" });
      }
      if (selectedLead.status === "new") {
        updateLeadStatus(selectedLead.id, "engaged");
      }

      // Add touchpoint
      const updatedLead = {
        ...selectedLead,
        touchpointTimeline: [...selectedLead.touchpointTimeline, {
          id: `tp-send-${Date.now()}`,
          channel: channel as "email" | "linkedin",
          type: `${channel}_sent`,
          description: data.subject || data.body.substring(0, 80),
          date: new Date().toISOString(),
        }],
      };
      setLeads(prev => prev.map(l => l.id === selectedLead.id ? updatedLead : l));
      setSelectedLead(updatedLead);
      persistLead(updatedLead);

      trackEventClient({ eventCategory: "outreach", eventAction: "message_sent", leadId: selectedLead.id, channel });

      setToastMessage(result.queued ? "Outreach queued for approval!" : `${channel === "email" ? "Email" : "LinkedIn message"} sent!`);
      setTimeout(() => setToastMessage(null), 2500);
    } catch (err) {
      console.error("Send from popup error:", err);
      setToastMessage("Failed to send — try again");
      setTimeout(() => setToastMessage(null), 2500);
    }
    setShowEmailPopup(false);
    setShowLinkedInPopup(false);
    setPopupPrefill(null);
  };

  const stats = {
    totalConnections: leads.length,
    hotLeads: leads.filter(l => l.icpScore?.tier === "hot").length,
    warmLeads: leads.filter(l => l.icpScore?.tier === "warm").length,
    pendingDrafts: leads.reduce((acc, l) => acc + l.draftMessages.filter(d => d.status === "draft").length, 0),
    pendingActions: leads.filter(l => l.icpScore?.tier === "hot" && l.status === "new").length,
    weeklyEngagement: leads.filter(l => l.draftMessages.some(d => d.status === "approved")).length,
  };

  const filteredLeads = leads.filter(l => {
    if (filterTier !== "all" && l.icpScore?.tier !== filterTier) return false;
    if (filterStatus !== "all" && l.status !== filterStatus) return false;
    return true;
  });

  // Section titles / subtitles
  const sectionMeta: Record<SidebarSection, { title: string; subtitle: string }> = {
    home: { title: "Home", subtitle: "Your daily command center" },
    leads: { title: "Leads", subtitle: "All leads, prospecting, and intent signals" },
    inbox: { title: "Inbox", subtitle: "All conversations and pending approvals" },
    outreach: { title: "Outreach", subtitle: "Create, automate, and schedule outreach" },
    deals: { title: "Deals", subtitle: "Pipeline, buyer journeys, and stakeholder engagement" },
    insights: { title: "Insights", subtitle: "AI-detected patterns and deal outcome analysis" },
    settings: { title: "Settings", subtitle: "Compliance, privacy, and AI agents" },
  };

  // Show loading spinner while checking auth
  if (initialLoading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(135deg, #0a0f1c 0%, #1a1f3c 50%, #0a0f1c 100%)",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 40, height: 40, border: "3px solid rgba(255,255,255,0.1)",
            borderTopColor: "#60a5fa", borderRadius: "50%", animation: "spin 1s linear infinite",
            margin: "0 auto 16px",
          }} />
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Loading Balboa...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* === SIDEBAR === */}
      <div className="sidebar">
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="balboa-logo-mark">B</div>
        </div>

        <nav className="sidebar-nav">
          {/* Home */}
          <button onClick={() => navigateTo("home")}
            className={`sidebar-item ${sidebarSection === "home" ? "active" : ""}`}>
            <Clock className="w-5 h-5" />
            <span className="tooltip">Home</span>
          </button>

          {/* Leads */}
          <button onClick={() => navigateTo("leads")}
            className={`sidebar-item ${sidebarSection === "leads" ? "active" : ""}`}>
            <Users className="w-5 h-5" />
            <span className="tooltip">Leads</span>
          </button>

          {/* Inbox */}
          <button onClick={() => navigateTo("inbox")}
            className={`sidebar-item ${sidebarSection === "inbox" ? "active" : ""}`}>
            <Mail className="w-5 h-5" />
            <span className="tooltip">Inbox</span>
          </button>

          {/* Outreach */}
          <button onClick={() => navigateTo("outreach")}
            className={`sidebar-item ${sidebarSection === "outreach" ? "active" : ""}`}>
            <Send className="w-5 h-5" />
            <span className="tooltip">Outreach</span>
          </button>

          {/* Deals */}
          <button onClick={() => navigateTo("deals")}
            className={`sidebar-item ${sidebarSection === "deals" ? "active" : ""}`}>
            <Target className="w-5 h-5" />
            <span className="tooltip">Deals</span>
          </button>

          {/* Divider */}
          <div style={{ height: 1, background: "var(--balboa-border-light)", margin: "12px 8px" }} />

          {/* Insights */}
          <button onClick={() => navigateTo("insights")}
            className={`sidebar-item ${sidebarSection === "insights" ? "active" : ""}`}>
            <BarChart3 className="w-5 h-5" />
            <span className="tooltip">Insights</span>
          </button>

          {/* Settings */}
          <button onClick={() => navigateTo("settings")}
            className={`sidebar-item ${sidebarSection === "settings" ? "active" : ""}`}>
            <Settings className="w-5 h-5" />
            <span className="tooltip">Settings</span>
          </button>
        </nav>
      </div>

      {/* === MAIN CONTENT === */}
      <div className="main-content flex-1">
        {/* Top Header */}
        <header className="top-header">
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: "var(--balboa-navy)", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
              {sectionMeta[sidebarSection].title}
            </h1>
            <p style={{ fontSize: 12, color: "var(--balboa-text-muted)", marginTop: 2, letterSpacing: "-0.01em" }}>
              {sectionMeta[sidebarSection].subtitle}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowAnalyzer(true)} className="btn-primary" style={{ background: "var(--balboa-blue)", fontSize: 12, boxShadow: "0 1px 4px rgba(59, 91, 219, 0.25)" }}>
              <Sparkles className="w-3.5 h-3.5" /> Analyze
            </button>
            <label className="btn-secondary cursor-pointer" style={{ fontSize: 12 }}>
              <Upload className="w-3.5 h-3.5" /> Import CSV
              <input type="file" accept=".csv,.zip" onChange={handleFileUpload} className="hidden" />
            </label>
            {/* Notifications bell */}
            <button
              onClick={() => navigateTo("home")}
              className="btn-ghost"
              style={{ padding: 6, position: "relative" }}
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              {(() => {
                const unread = leads.filter(l =>
                  l.contactStatus === "positive" ||
                  (l.emailStatus === "opened" && l.emailsSentCount && l.emailsSentCount > 0)
                ).length;
                return unread > 0 ? (
                  <span style={{
                    position: "absolute", top: 2, right: 2,
                    width: 14, height: 14, borderRadius: "50%",
                    background: "var(--balboa-red)", color: "white",
                    fontSize: 8, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "2px solid white",
                  }}>
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null;
              })()}
            </button>
            {userName && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 8, borderLeft: "1px solid var(--balboa-border-light)", marginLeft: 4 }}>
                <span style={{ fontSize: 11, color: "var(--balboa-text-muted)", fontWeight: 500 }}>{userName.split(" ")[0]}</span>
                <button onClick={handleLogout} className="btn-ghost" style={{ padding: 4 }} title="Sign out">
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div style={{ display: "flex", gap: 16, paddingLeft: 8, borderLeft: "1px solid var(--balboa-border-light)", marginLeft: 4 }}>
              <div className="text-center">
                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--balboa-red)", letterSpacing: "-0.02em", lineHeight: 1 }}>{stats.hotLeads}</div>
                <div style={{ fontSize: 10, color: "var(--balboa-text-muted)", fontWeight: 500, marginTop: 2 }}>Hot</div>
              </div>
              <div className="text-center">
                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--balboa-blue)", letterSpacing: "-0.02em", lineHeight: 1 }}>{stats.pendingDrafts}</div>
                <div style={{ fontSize: 10, color: "var(--balboa-text-muted)", fontWeight: 500, marginTop: 2 }}>Drafts</div>
              </div>
            </div>
          </div>
        </header>

        {/* === HOME === */}
        {sidebarSection === "home" && (
          <HomeSection
            leads={leads}
            deals={typedDeals}
            events={events}
            selectedLead={selectedLead}
            onNavigateToLead={handleNavigateToLead}
            onUpdateLead={handleUpdateLead}
            onGenerateMessage={generateMessageInline}
            onCopyMessage={copyToClipboard}
            generatingForLeadId={generatingForLeadId}
            language={contentLanguage}
            onAskVasco={setVascoPrompt}
          />
        )}

        {/* === LEADS === */}
        {sidebarSection === "leads" && (
          <div className="p-6">
            <LeadSection
              leads={leads}
              selectedLead={selectedLead}
              onSelectLead={setSelectedLead}
              filteredLeads={filteredLeads}
              filterTier={filterTier}
              setFilterTier={setFilterTier}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              loading={loading}
              loadingMessage={loadingMessage}
              processedCount={processedCount}
              totalCount={totalCount}
              remainingConnections={remainingConnections}
              loadingMore={loadingMore}
              onLoadMore={loadMoreConnections}
              communications={communications}
              contentLanguage={contentLanguage}
              onLanguageChange={setContentLanguage}
              onAskVasco={setVascoPrompt}
              onUpdateLeadStatus={updateLeadStatus}
              onAddNote={handleAddNote}
              onAnalyzeLead={analyzeLead}
              onGenerateMessage={generateMessage}
              onUpdateDraftStatus={updateDraftStatus}
              onBattleCardGenerate={handleBattleCardGenerate}
              onCopyMessage={copyToClipboard}
              onOpenEmailPopup={(prefill) => { if (prefill) setPopupPrefill(prefill); setShowEmailPopup(true); }}
              onOpenLinkedInPopup={(prefill) => { if (prefill) setPopupPrefill(prefill as { body?: string; draftId?: string }); setShowLinkedInPopup(true); }}
              onOpenProposalPopup={() => setShowProposalPopup(true)}
              onOpenVideoPrep={() => setShowVideoPrep(true)}
              onOpenPrepKit={() => setShowPrepKit(true)}
              onOpenMeetingScheduler={() => setShowMeetingScheduler(true)}
              onOpenDeepResearch={() => setShowDeepResearch(true)}
              generatingAction={generatingAction}
              leadAnalysis={leadAnalysis}
              analyzingLead={analyzingLead}
              onAddToLeads={(prospect) => {
                const newLead: Lead = {
                  id: `prospect-${prospect.id}-${Date.now()}`,
                  firstName: prospect.firstName,
                  lastName: prospect.lastName,
                  company: prospect.company,
                  position: prospect.position,
                  connectedOn: "",
                  linkedinUrl: "",
                  icpScore: prospect.icpScore,
                  status: "new",
                  contactStatus: "not_contacted",
                  linkedinStage: "not_connected",
                  notes: `Source: ${prospect.source} — ${prospect.sourceDetail}`,
                  draftMessages: [],
                  engagementActions: [],
                  channels: { linkedin: true, email: false, linkedinConnected: false, emailVerified: false },
                  emailCampaigns: [],
                  touchpointTimeline: [{ id: `tp-prospect-${Date.now()}`, channel: "linkedin", type: "prospect_added", description: `Added from prospecting (${prospect.source})`, date: new Date().toISOString() }],
                };
                setLeads(prev => [...prev, newLead].sort((a, b) => (b.icpScore?.overall || 0) - (a.icpScore?.overall || 0)));
                if (userId) upsertLead(supabase, userId, newLead).catch(err => console.error("Failed to persist prospect:", err));
              }}
              onProspectGenerateMessage={async (prospect) => {
                const tempLead: Lead = {
                  id: `temp-prospect-${prospect.id}`,
                  firstName: prospect.firstName,
                  lastName: prospect.lastName,
                  company: prospect.company,
                  position: prospect.position,
                  connectedOn: "",
                  linkedinUrl: "",
                  icpScore: prospect.icpScore,
                  status: "new",
                  contactStatus: "not_contacted",
                  linkedinStage: "not_connected",
                  notes: "",
                  draftMessages: [],
                  engagementActions: [],
                  channels: { linkedin: true, email: false, linkedinConnected: false, emailVerified: false },
                  emailCampaigns: [],
                  touchpointTimeline: [],
                };
                try {
                  const resp = await fetch("/api/generate-message", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ lead: tempLead, messageType: "connection_followup", language: contentLanguage }),
                  });
                  const data = await resp.json();
                  return data.message?.body || "";
                } catch { return ""; }
              }}
              onNavigateToLead={handleNavigateToLead}
              userId={userId}
            />
          </div>
        )}

        {/* === INBOX === */}
        {sidebarSection === "inbox" && (
          <div className="p-6">
            <InboxWrapper
              leads={leads}
              communications={communications}
              onNavigateToLead={handleNavigateToLead}
              onAskVasco={setVascoPrompt}
              onCopyMessage={copyToClipboard}
              onGenerateMessage={generateMessage}
              generatingForLeadId={generatingForLeadId}
              contentLanguage={contentLanguage}
              gmailConnected={gmailConnected}
              gmailLoading={gmailLoading}
              unmatchedThreads={unmatchedThreads}
              onNavigateToSettings={() => setSidebarSection("settings")}
            />
          </div>
        )}

        {/* === OUTREACH === */}
        {sidebarSection === "outreach" && (
          <div className="p-6">
            <OutreachSection
              leads={leads}
              selectedLead={selectedLead}
              communications={communications}
              contentLanguage={contentLanguage}
              events={events}
              onGenerateMessageInline={generateMessageInline}
              onCopyMessage={copyToClipboard}
              onNavigateToLead={handleNavigateToLead}
              generatingForLeadId={generatingForLeadId}
              onAskVasco={setVascoPrompt}
              onUpdateLeadStatus={updateLeadStatus}
              onAddNote={handleAddNote}
              onAnalyzeLead={analyzeLead}
              onGenerateMessage={generateMessage}
              onUpdateDraftStatus={updateDraftStatus}
              onBattleCardGenerate={handleBattleCardGenerate}
              onOpenEmailPopup={(prefill) => { if (prefill) setPopupPrefill(prefill); setShowEmailPopup(true); }}
              onOpenLinkedInPopup={(prefill) => { if (prefill) setPopupPrefill(prefill as { body?: string; draftId?: string }); setShowLinkedInPopup(true); }}
              onOpenProposalPopup={() => setShowProposalPopup(true)}
              onOpenVideoPrep={() => setShowVideoPrep(true)}
              onOpenPrepKit={() => setShowPrepKit(true)}
              onOpenMeetingScheduler={() => setShowMeetingScheduler(true)}
              onOpenDeepResearch={() => setShowDeepResearch(true)}
              generatingAction={generatingAction}
              leadAnalysis={leadAnalysis}
              analyzingLead={analyzingLead}
              onLanguageChange={setContentLanguage}
            />
          </div>
        )}

        {/* === DEALS === */}
        {sidebarSection === "deals" && (
          <div className="p-6">
            <DealsSection
              deals={deals}
              typedDeals={typedDeals}
              accounts={typedAccounts}
              leads={leads}
              selectedLead={selectedLead}
              onNavigateToLead={handleNavigateToLead}
              onAskVasco={setVascoPrompt}
            />
          </div>
        )}

        {/* === INSIGHTS === */}
        {sidebarSection === "insights" && (
          <div className="p-6">
            <InsightsSection
              deals={typedDeals}
              leads={leads}
              onAskVasco={setVascoPrompt}
            />
          </div>
        )}

        {/* === SETTINGS === */}
        {sidebarSection === "settings" && (
          <div className="p-6">
            <SettingsSection
              leads={leads}
              selectedLead={selectedLead}
              language={contentLanguage}
            />
          </div>
        )}

      </div>

      {/* === ANALYZER PANEL (Phase 2) === */}
      {showAnalyzer && (
        <AnalyzerPanel onDismiss={() => setShowAnalyzer(false)} />
      )}

      {/* Call logging is now automatic via Aircall/Amplemarket integration */}

      {/* Video Prep Modal */}
      {showVideoPrep && selectedLead && (
        <VideoPrepModal
          lead={selectedLead}
          onClose={() => setShowVideoPrep(false)}
          onSave={handleVideoPrepSave}
        />
      )}

      {/* Sales Prep Kit Modal */}
      {showPrepKit && selectedLead && (
        <SalesPrepModal
          lead={selectedLead}
          onClose={() => setShowPrepKit(false)}
          onSave={handlePrepKitSave}
        />
      )}

      {/* Meeting Scheduler Modal */}
      {showMeetingScheduler && selectedLead && (
        <MeetingSchedulerModal
          lead={selectedLead}
          onClose={() => setShowMeetingScheduler(false)}
          onSchedule={(meeting) => {
            const draft: DraftMessage = {
              id: `draft-meeting-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              type: "meeting_request",
              channel: "email",
              subject: `Meeting Request: ${selectedLead.firstName} ${selectedLead.lastName}`,
              body: meeting.message,
              status: "draft",
              createdAt: new Date().toISOString(),
              personalization: [`Meeting: ${meeting.date} at ${meeting.time}`, `Platform: ${meeting.type}`],
            };
            const updatedLead = {
              ...selectedLead,
              meetingScheduled: true,
              draftMessages: [...selectedLead.draftMessages, draft],
              touchpointTimeline: [...selectedLead.touchpointTimeline, {
                id: `tp-meeting-${Date.now()}`,
                channel: "email" as const,
                type: "meeting_scheduled",
                description: `Meeting scheduled for ${meeting.date} at ${meeting.time} via ${meeting.type}`,
                date: new Date().toISOString(),
              }],
            };
            setLeads(prev => prev.map(l => l.id === selectedLead.id ? updatedLead : l));
            setSelectedLead(updatedLead);
            persistLead(updatedLead);
            setShowMeetingScheduler(false);
            setToastMessage("Meeting draft created! Review & approve to send.");
            setTimeout(() => setToastMessage(null), 3000);
            trackEventClient({
              eventCategory: "outreach",
              eventAction: "draft_created",
              leadId: selectedLead.id,
              templateType: "meeting_request",
              leadTier: selectedLead.icpScore?.tier,
              metadata: { meetingDate: meeting.date, meetingTime: meeting.time, meetingType: meeting.type },
            });
          }}
          language={contentLanguage}
        />
      )}

      {/* Email Popup */}
      {showEmailPopup && selectedLead && (
        <EmailPopup
          lead={selectedLead}
          onClose={() => { setShowEmailPopup(false); setPopupPrefill(null); }}
          onSend={(d) => handleSendFromPopup("email", { ...d, draftId: popupPrefill?.draftId })}
          language={contentLanguage}
          initialSubject={popupPrefill?.subject}
          initialBody={popupPrefill?.body}
          initialDraftId={popupPrefill?.draftId}
        />
      )}

      {/* LinkedIn Popup */}
      {showLinkedInPopup && selectedLead && (
        <LinkedInPopup
          lead={selectedLead}
          onClose={() => { setShowLinkedInPopup(false); setPopupPrefill(null); }}
          onSend={(d) => handleSendFromPopup("linkedin", d)}
          language={contentLanguage}
          initialBody={popupPrefill?.body}
          initialDraftId={popupPrefill?.draftId}
        />
      )}

      {/* Proposal Creator Popup */}
      {showProposalPopup && selectedLead && (
        <ProposalCreatorPopup
          lead={selectedLead}
          onClose={() => setShowProposalPopup(false)}
          onSend={(d) => {
            // Save proposal as a draft message on the lead
            const draft: DraftMessage = {
              id: `draft-proposal-${Date.now()}`,
              type: "value_share",
              channel: "email",
              subject: d.subject,
              body: d.body,
              status: "draft",
              createdAt: new Date().toISOString(),
              personalization: [`Document type: ${d.docType}`],
            };
            const updatedLead = {
              ...selectedLead,
              draftMessages: [...selectedLead.draftMessages, draft],
            };
            setLeads(prev => prev.map(l => l.id === selectedLead.id ? updatedLead : l));
            setSelectedLead(updatedLead);
            persistLead(updatedLead);
            setShowProposalPopup(false);
            setToastMessage("Proposal draft saved! Review & approve to send.");
            setTimeout(() => setToastMessage(null), 3000);
            trackEventClient({
              eventCategory: "outreach",
              eventAction: "draft_created",
              leadId: selectedLead.id,
              templateType: "value_share",
              leadTier: selectedLead.icpScore?.tier,
              metadata: { docType: d.docType },
            });
          }}
          language={contentLanguage}
        />
      )}

      {/* Deep Research Panel Modal (Phase 6) */}
      {showDeepResearch && selectedLead && (
        <DeepResearchPanel
          lead={selectedLead}
          onClose={() => setShowDeepResearch(false)}
          language={contentLanguage}
        />
      )}

      {/* AI Assistant (floating) — Vasco with context button support */}
      <BalboaAssistant
        leads={leads}
        deals={typedDeals}
        accounts={typedAccounts}
        selectedLead={selectedLead}
        currentSection={sidebarSection}
        onNavigateToLead={handleNavigateToLead}
        onGenerateMessage={generateMessage}
        language={contentLanguage}
        externalPrompt={vascoPrompt}
        onExternalPromptHandled={() => setVascoPrompt(null)}
        isOpen={vascoOpen}
        onOpenChange={setVascoOpen}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "var(--balboa-navy)", color: "white",
          padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
          zIndex: 200, animation: "fadeIn 0.15s ease-out",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <CheckCircle className="w-4 h-4" style={{ opacity: 0.8 }} />
          {toastMessage}
        </div>
      )}
    </div>
  );
}
