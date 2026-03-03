"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import Papa from "papaparse";
import JSZip from "jszip";
import {
  Upload, Users, MessageSquare,
  ChevronRight, CheckCircle, XCircle, Clock,
  Target, AlertCircle, Copy, RefreshCw, Filter,
  Send, ThumbsUp, MessageCircle, Eye, Sparkles,
  Linkedin, AtSign,
  Phone, ChevronDown, Video, BookOpen, Shield, StickyNote,
  Radar, CalendarCheck, LogOut, Mail, FileText, Zap, ExternalLink, Calendar,
  Bell, GitBranch, Map, TrendingUp, Layers, Bot,
} from "lucide-react";
import type { Lead, Deal, Account, DraftMessage, CallLog, CallOutcome, VideoPrep, PrepKit, BattleCard, SupportedLanguage, SidebarSection } from "@/lib/types";
import { MOCK_LEADS } from "@/lib/mock-data";
import { createClient } from "@/lib/supabase/client";
import { getLeads, upsertLead, upsertLeads } from "@/lib/db";
import { trackEventClient } from "@/lib/tracking";
import OutreachCommandCenter from "@/components/OutreachCommandCenter";
import Prospecting from "@/components/Prospecting";
import ActivityTimeline from "@/components/ActivityTimeline";
import CrossChannelWarning from "@/components/CrossChannelWarning";
import VideoPrepModal from "@/components/VideoPrepModal";
import SalesPrepModal from "@/components/SalesPrepModal";
import PrepKitPanel from "@/components/PrepKitPanel";
import PlaybookIntelligence from "@/components/PlaybookIntelligence";
import BattleCardPanel from "@/components/BattleCardPanel";
import LanguageSelector from "@/components/LanguageSelector";
import LinkedInQueue from "@/components/LinkedInQueue";
import UnifiedOutreach from "@/components/UnifiedOutreach";
import DealPipeline from "@/components/DealPipeline";
import AnalyzerPanel from "@/components/AnalyzerPanel";
import MeetingSchedulerModal from "@/components/MeetingSchedulerModal";
import OutreachApprovalQueue from "@/components/OutreachApprovalQueue";
import LinkedInFilterSettings from "@/components/LinkedInFilterSettings";
import LinkedInConversationList from "@/components/LinkedInConversationList";
import LinkedInAuditLog from "@/components/LinkedInAuditLog";
import EmailPopup from "@/components/EmailPopup";
import LinkedInPopup from "@/components/LinkedInPopup";
import ProposalCreatorPopup from "@/components/ProposalCreatorPopup";
import DraftApprovalPanel from "@/components/DraftApprovalPanel";
import OutreachActivitySummary from "@/components/OutreachActivitySummary";
import LinkedInRedirectButton from "@/components/LinkedInRedirectButton";
import BalboaAssistant from "@/components/BalboaAssistant";
import SignalEngine from "@/components/SignalEngine";
import BuyerJourneyMap from "@/components/BuyerJourneyMap";
import WinLossIntelligence from "@/components/WinLossIntelligence";
import MultiThreadingIntelligence from "@/components/MultiThreadingIntelligence";
import SequenceBuilder from "@/components/SequenceBuilder";
import NotificationCenter from "@/components/NotificationCenter";
import DeepResearchPanel from "@/components/DeepResearchPanel";
import LeadSummarizer from "@/components/LeadSummarizer";
import CommunicationHub from "@/components/CommunicationHub";
import EventCommandCenter from "@/components/EventCommandCenter";
import ColdCallScript from "@/components/ColdCallScript";
import VascoContextButton from "@/components/VascoContextButton";
import AgentHubSection from "@/components/AgentHubSection";
import InboxSection from "@/components/InboxSection";
import ComplianceDashboard from "@/components/ComplianceDashboard";
import ComplianceWarningBar from "@/components/ComplianceWarningBar";
import LeadContextPanel, { Avatar, ScoreRing, ChannelIndicator, getRecommendedAction } from "@/components/LeadContextPanel";
import { getClientConfig } from "@/lib/config-client";
import { mockDeals, mockAccounts } from "@/lib/mock-phase2";
import { mockEvents } from "@/lib/mock-events";
import { mockCommunications } from "@/lib/mock-communications";
import type { SalesEvent, CommunicationThread } from "@/lib/types";

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>(MOCK_LEADS);
  const [sidebarSection, setSidebarSection] = useState<SidebarSection>("today");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [filterTier, setFilterTier] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showVideoPrep, setShowVideoPrep] = useState(false);
  const [showPrepKit, setShowPrepKit] = useState(false);
  const [contentLanguage, setContentLanguage] = useState<SupportedLanguage>("english");
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [remainingConnections, setRemainingConnections] = useState<any[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [quickNote, setQuickNote] = useState("");
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
  const [deals] = useState(mockDeals);
  const [accounts] = useState(mockAccounts);
  const [showLinkedInAuditLog, setShowLinkedInAuditLog] = useState(false);
  const [showEmailPopup, setShowEmailPopup] = useState(false);
  const [showLinkedInPopup, setShowLinkedInPopup] = useState(false);
  const [showProposalPopup, setShowProposalPopup] = useState(false);
  const [popupPrefill, setPopupPrefill] = useState<{ subject?: string; body?: string; draftId?: string } | null>(null);
  // Phase 6 state
  const [vascoPrompt, setVascoPrompt] = useState<string | null>(null);
  const [showDeepResearch, setShowDeepResearch] = useState(false);
  const [events] = useState<SalesEvent[]>(mockEvents);
  const [communications] = useState<Record<string, CommunicationThread[]>>(mockCommunications);

  const supabase = createClient();
  const { isSandbox } = getClientConfig();

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
      console.warn("Supabase auth timed out — loading with mock data");
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
        // Fallback to mock data
      }
      if (!didTimeout) {
        clearTimeout(timeout);
        setInitialLoading(false);
      }
    };
    loadUserAndLeads();
    return () => clearTimeout(timeout);
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
    setQuickNote("");
    trackEventClient({ eventCategory: "lead", eventAction: "note_added", leadId });
  };

  // getRecommendedAction is now imported from LeadContextPanel

  // Handle lead updates from OutreachCommandCenter
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

  // Avatar, ScoreRing, ChannelIndicator, getRecommendedAction are now imported from LeadContextPanel

  // Section titles / subtitles
  const sectionMeta: Record<SidebarSection, { title: string; subtitle: string }> = {
    today: { title: "Today", subtitle: "Your morning view — overdue and today's actions" },
    leads: { title: "Leads", subtitle: "All leads in one place — research, draft, and send" },
    followups: { title: "Follow-ups", subtitle: "Grouped by urgency — never miss a follow-up" },
    prospecting: { title: "Prospecting & Signals", subtitle: "Discover new prospects, events, and market signals" },
    playbook: { title: "Playbook Intelligence", subtitle: "Auto-detected patterns from messaging, calls, demos, and timing" },
    outreach: { title: "Unified Outreach", subtitle: "Email and LinkedIn replies in one place with channel recommendations" },
    deals: { title: "Deal Pipeline", subtitle: "Track and manage your deals with AI-powered strategy recommendations" },
    queue: { title: "Outreach Queue", subtitle: "Review and approve outreach messages before they are sent" },
    "linkedin-privacy": { title: "LinkedIn Privacy", subtitle: "Filter personal conversations from business workflows" },
    signals: { title: "Signal Engine", subtitle: "Real-time intent signals and recommended actions" },
    sequences: { title: "Sequence Automation", subtitle: "Build multi-step outreach sequences with auto-send and approval gates" },
    journey: { title: "Buyer Journey", subtitle: "Visualize where your leads are in the buying process" },
    threading: { title: "Multi-Threading", subtitle: "Track stakeholder engagement across accounts" },
    winloss: { title: "Win/Loss Intelligence", subtitle: "Analyze deal outcomes to improve your sales strategy" },
    notifications: { title: "Notifications", subtitle: "Stay on top of urgent signals and important updates" },
    events: { title: "Event Command Center", subtitle: "Manage tradeshow and conference outreach with territory tracking" },
    agents: { title: "Agent Hub", subtitle: "Browse, create, and run AI agents built by your team" },
    inbox: { title: "Inbox", subtitle: "All conversations across LinkedIn, Email, and SMS in one place" },
    compliance: { title: "Compliance & Safety", subtitle: "Platform regulation compliance, rate limits, and consent tracking" },
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
          {/* Today */}
          <button onClick={() => navigateTo("today")}
            className={`sidebar-item ${sidebarSection === "today" ? "active" : ""}`}>
            <Clock className="w-5 h-5" />
            <span className="tooltip">Today</span>
          </button>

          {/* Leads */}
          <button onClick={() => navigateTo("leads")}
            className={`sidebar-item ${sidebarSection === "leads" ? "active" : ""}`}>
            <Users className="w-5 h-5" />
            <span className="tooltip">Leads</span>
          </button>

          {/* Follow-ups */}
          <button onClick={() => navigateTo("followups")}
            className={`sidebar-item ${sidebarSection === "followups" ? "active" : ""}`}>
            <CalendarCheck className="w-5 h-5" />
            <span className="tooltip">Follow-ups</span>
          </button>

          {/* Prospecting */}
          <button onClick={() => navigateTo("prospecting")}
            className={`sidebar-item ${sidebarSection === "prospecting" ? "active" : ""}`}>
            <Radar className="w-5 h-5" />
            <span className="tooltip">Prospecting</span>
          </button>

          {/* Playbook */}
          <button onClick={() => navigateTo("playbook")}
            className={`sidebar-item ${sidebarSection === "playbook" ? "active" : ""}`}>
            <BookOpen className="w-5 h-5" />
            <span className="tooltip">Playbook</span>
          </button>

          {/* Divider */}
          <div style={{ height: 1, background: "var(--balboa-border-light)", margin: "12px 8px" }} />

          {/* Unified Outreach (Phase 2) */}
          <button onClick={() => navigateTo("outreach")}
            className={`sidebar-item ${sidebarSection === "outreach" ? "active" : ""}`}>
            <MessageSquare className="w-5 h-5" />
            <span className="tooltip">Outreach</span>
          </button>

          {/* Deal Pipeline (Phase 2) */}
          <button onClick={() => navigateTo("deals")}
            className={`sidebar-item ${sidebarSection === "deals" ? "active" : ""}`}>
            <Target className="w-5 h-5" />
            <span className="tooltip">Deals</span>
          </button>

          {/* Outreach Queue (Phase 3) */}
          <button onClick={() => navigateTo("queue")}
            className={`sidebar-item ${sidebarSection === "queue" ? "active" : ""}`}>
            <FileText className="w-5 h-5" />
            <span className="tooltip">Queue</span>
          </button>

          {/* LinkedIn Privacy (Phase 3) */}
          <button onClick={() => { navigateTo("linkedin-privacy"); setShowLinkedInAuditLog(false); }}
            className={`sidebar-item ${sidebarSection === "linkedin-privacy" ? "active" : ""}`}>
            <Shield className="w-5 h-5" />
            <span className="tooltip">Privacy</span>
          </button>

          {/* Divider */}
          <div style={{ height: 1, background: "var(--balboa-border-light)", margin: "12px 8px" }} />

          {/* Signal Engine */}
          <button onClick={() => navigateTo("signals")}
            className={`sidebar-item ${sidebarSection === "signals" ? "active" : ""}`}>
            <Zap className="w-5 h-5" />
            <span className="tooltip">Signals</span>
          </button>

          {/* Buyer Journey */}
          <button onClick={() => navigateTo("journey")}
            className={`sidebar-item ${sidebarSection === "journey" ? "active" : ""}`}>
            <Map className="w-5 h-5" />
            <span className="tooltip">Journey</span>
          </button>

          {/* Sequences */}
          <button onClick={() => navigateTo("sequences")}
            className={`sidebar-item ${sidebarSection === "sequences" ? "active" : ""}`}>
            <GitBranch className="w-5 h-5" />
            <span className="tooltip">Sequences</span>
          </button>

          {/* Multi-Threading */}
          <button onClick={() => navigateTo("threading")}
            className={`sidebar-item ${sidebarSection === "threading" ? "active" : ""}`}>
            <Layers className="w-5 h-5" />
            <span className="tooltip">Threading</span>
          </button>

          {/* Win/Loss */}
          <button onClick={() => navigateTo("winloss")}
            className={`sidebar-item ${sidebarSection === "winloss" ? "active" : ""}`}>
            <TrendingUp className="w-5 h-5" />
            <span className="tooltip">Win/Loss</span>
          </button>

          {/* Notifications */}
          <button onClick={() => navigateTo("notifications")}
            className={`sidebar-item ${sidebarSection === "notifications" ? "active" : ""}`}>
            <Bell className="w-5 h-5" />
            <span className="tooltip">Notifications</span>
          </button>

          {/* Divider */}
          <div style={{ height: 1, background: "var(--balboa-border-light)", margin: "12px 8px" }} />

          {/* Events */}
          <button onClick={() => navigateTo("events")}
            className={`sidebar-item ${sidebarSection === "events" ? "active" : ""}`}>
            <Calendar className="w-5 h-5" />
            <span className="tooltip">Events</span>
          </button>

          {/* Agent Hub */}
          <button onClick={() => navigateTo("agents")}
            className={`sidebar-item ${sidebarSection === "agents" ? "active" : ""}`}>
            <Bot className="w-5 h-5" />
            <span className="tooltip">Agent Hub</span>
          </button>

          {/* Divider */}
          <div style={{ height: 1, background: "var(--balboa-border-light)", margin: "12px 8px" }} />

          {/* Inbox */}
          <button onClick={() => navigateTo("inbox")}
            className={`sidebar-item ${sidebarSection === "inbox" ? "active" : ""}`}>
            <Mail className="w-5 h-5" />
            <span className="tooltip">Inbox</span>
          </button>

          {/* Compliance */}
          <button onClick={() => navigateTo("compliance")}
            className={`sidebar-item ${sidebarSection === "compliance" ? "active" : ""}`}>
            <Shield className="w-5 h-5" />
            <span className="tooltip">Compliance</span>
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
            {/* Call logging is automatic via Aircall/Amplemarket integration */}
            <label className="btn-secondary cursor-pointer" style={{ fontSize: 12 }}>
              <Upload className="w-3.5 h-3.5" /> Import CSV
              <input type="file" accept=".csv,.zip" onChange={handleFileUpload} className="hidden" />
            </label>
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

        {/* === TODAY SECTION === */}
        {sidebarSection === "today" && (
          <div className="p-6">
            {/* Morning routine greeting */}
            {(() => {
              const hour = new Date().getHours();
              const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
              const actionableCount = leads.filter(l => !l.disqualifyReason && (l.icpScore?.tier === "hot" || l.icpScore?.tier === "warm")).length;
              const readyDrafts = leads.reduce((acc, l) => acc + l.draftMessages.filter(d => d.status === "draft").length, 0);
              return (
                <div style={{ marginBottom: 20 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--balboa-navy)", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                    {greeting} 👋
                  </h2>
                  <p style={{ fontSize: 13, color: "var(--balboa-text-muted)", marginTop: 4, lineHeight: 1.5 }}>
                    You have <strong style={{ color: "var(--balboa-navy)" }}>{actionableCount}</strong> people to reach out to
                    {readyDrafts > 0 && <> and <strong style={{ color: "var(--balboa-blue)" }}>{readyDrafts}</strong> message{readyDrafts > 1 ? "s" : ""} ready to send</>}.
                    {" "}Let&apos;s go.
                  </p>
                </div>
              );
            })()}

            <OutreachCommandCenter
              leads={leads}
              onNavigateToLead={handleNavigateToLead}
              onUpdateLead={handleUpdateLead}
              onGenerateMessage={generateMessageInline}
              onCopyMessage={copyToClipboard}
              generatingForLeadId={generatingForLeadId}
              defaultTab="today"
              hideTabNav
            />

            {/* LinkedIn Queue — batch-process LinkedIn-only connections */}
            <div style={{ marginTop: 32 }}>
              <LinkedInQueue
                leads={leads}
                onNavigateToLead={handleNavigateToLead}
                onUpdateLead={handleUpdateLead}
                onGenerateMessage={generateMessageInline}
                onCopyMessage={copyToClipboard}
                generatingForLeadId={generatingForLeadId}
              />
            </div>
          </div>
        )}

        {/* === LEADS SECTION === */}
        {sidebarSection === "leads" && (
          <div className="p-6">
            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-16">
                <div className="card p-10 text-center max-w-md">
                  <div className="w-10 h-10 border-3 rounded-full animate-spin mx-auto mb-4"
                    style={{ borderColor: "var(--balboa-border)", borderTopColor: "var(--balboa-navy)" }} />
                  <h2 className="text-base font-bold mb-2" style={{ color: "var(--balboa-navy)" }}>{loadingMessage}</h2>
                  {totalCount > 0 && (
                    <div className="mt-3">
                      <div className="rate-bar-track">
                        <div className="rate-bar-fill" style={{ width: `${(processedCount / totalCount) * 100}%`, background: "var(--balboa-navy)" }} />
                      </div>
                      <p className="text-xs mt-2" style={{ color: "var(--balboa-text-muted)" }}>{processedCount} / {totalCount}</p>
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
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--balboa-text-muted)", fontWeight: 500 }}>{filteredLeads.length} leads</span>
                    {remainingConnections.length > 0 && (
                      <button onClick={() => loadMoreConnections(50)} disabled={loadingMore} className="btn-ghost">
                        {loadingMore ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
                        {loadingMore ? "Loading..." : `+${Math.min(50, remainingConnections.length)} more`}
                      </button>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "calc(100vh - 240px)", overflowY: "auto", paddingRight: 4 }}>
                    {filteredLeads.map((lead) => (
                      <div key={lead.id} onClick={() => setSelectedLead(lead)}
                        className={`card card-hover fade-in
                          ${lead.icpScore?.tier === "hot" ? "priority-urgent" : lead.icpScore?.tier === "warm" ? "priority-medium" : "priority-low"}`}
                        style={{
                          padding: "12px 14px",
                          borderColor: selectedLead?.id === lead.id ? "var(--balboa-blue)" : undefined,
                          boxShadow: selectedLead?.id === lead.id ? "0 0 0 2px rgba(59, 91, 219, 0.15)" : undefined,
                        }}>
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
                              <h3 style={{ fontWeight: 600, fontSize: 13, color: "var(--balboa-navy)", letterSpacing: "-0.01em" }}>{lead.firstName} {lead.lastName}</h3>
                              <span className={`badge badge-${lead.icpScore?.tier}`}>{lead.icpScore?.tier?.toUpperCase()}</span>
                              <ChannelIndicator lead={lead} />
                            </div>
                            <p style={{ fontSize: 12, color: "var(--balboa-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{lead.position}</p>
                            <p style={{ fontSize: 11, color: "var(--balboa-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.company}</p>
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
                              <span key={i} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "rgba(30,42,94,0.05)", color: "var(--balboa-navy)", fontWeight: 500 }}>{s}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Lead detail — now using LeadContextPanel */}
                {selectedLead && (
                  <div className="card fade-in" style={{ width: "55%", padding: "22px 24px", maxHeight: "calc(100vh - 240px)", overflowY: "auto" }}>
                    <LeadContextPanel
                      lead={selectedLead}
                      communications={communications[selectedLead.id] || []}
                      language={contentLanguage}
                      mode="full"
                      onClose={() => setSelectedLead(null)}
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
                      contentLanguage={contentLanguage}
                      onLanguageChange={setContentLanguage}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* === FOLLOW-UPS SECTION === */}
        {sidebarSection === "followups" && (
          <div className="p-6">
            <OutreachCommandCenter
              leads={leads}
              onNavigateToLead={handleNavigateToLead}
              onUpdateLead={handleUpdateLead}
              onGenerateMessage={generateMessageInline}
              onCopyMessage={copyToClipboard}
              generatingForLeadId={generatingForLeadId}
              defaultTab="followups"
              hideTabNav
            />
          </div>
        )}

        {/* === PROSPECTING SECTION === */}
        {sidebarSection === "prospecting" && (
          <div className="p-6">
            <Prospecting
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
              onGenerateMessage={async (prospect) => {
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
              onCopyMessage={copyToClipboard}
            />
          </div>
        )}

        {/* === PLAYBOOK SECTION === */}
        {sidebarSection === "playbook" && (
          <PlaybookIntelligence />
        )}

        {/* === UNIFIED OUTREACH SECTION (Phase 2) === */}
        {sidebarSection === "outreach" && (
          <div className="p-6">
            <UnifiedOutreach
              leads={leads}
              onGenerateMessage={generateMessageInline}
              onCopyMessage={copyToClipboard}
              onNavigateToLead={handleNavigateToLead}
              generatingForLeadId={generatingForLeadId}
              contentLanguage={contentLanguage}
              renderLeadContext={(lead) => (
                <LeadContextPanel
                  lead={lead}
                  communications={communications[lead.id] || []}
                  language={contentLanguage}
                  mode="outreach-sidebar"
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
                  contentLanguage={contentLanguage}
                  onLanguageChange={setContentLanguage}
                />
              )}
            />
          </div>
        )}

        {/* === DEAL PIPELINE SECTION (Phase 2) === */}
        {sidebarSection === "deals" && (
          <div className="p-6">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--balboa-navy)", margin: 0 }}>Deal Pipeline</h2>
              <VascoContextButton
                prompt={`Analyze my entire deal pipeline. I have ${deals.length} deals. Give me a health check: which deals are at risk? Which should I prioritize this week? What's my expected close rate? Are there any stalled deals I should re-engage? Provide a prioritized action plan.`}
                tooltip="Ask Vasco to analyze your pipeline"
                onClick={setVascoPrompt}
                size={16}
              />
            </div>
            <DealPipeline deals={deals} leads={leads} onNavigateToLead={handleNavigateToLead} />
          </div>
        )}

        {/* === OUTREACH QUEUE SECTION (Phase 3) === */}
        {sidebarSection === "queue" && (
          <div className="p-6">
            <OutreachApprovalQueue visible={sidebarSection === "queue"} />
          </div>
        )}

        {/* === LINKEDIN PRIVACY SECTION (Phase 3) === */}
        {sidebarSection === "linkedin-privacy" && (
          <div className="p-6">
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
          </div>
        )}

        {/* === SIGNAL ENGINE SECTION === */}
        {sidebarSection === "signals" && (
          <div className="p-6">
            <SignalEngine
              leads={leads}
              onNavigateToLead={handleNavigateToLead}
              onGenerateMessage={generateMessage}
            />
          </div>
        )}

        {/* === BUYER JOURNEY MAP SECTION === */}
        {sidebarSection === "journey" && (
          <div className="p-6">
            <BuyerJourneyMap
              leads={leads}
              deals={typedDeals}
              onNavigateToLead={handleNavigateToLead}
              selectedLead={selectedLead}
            />
          </div>
        )}

        {/* === SEQUENCE AUTOMATION SECTION === */}
        {sidebarSection === "sequences" && (
          <div className="p-6">
            <SequenceBuilder
              leads={leads}
              onNavigateToLead={handleNavigateToLead}
            />
          </div>
        )}

        {/* === MULTI-THREADING SECTION === */}
        {sidebarSection === "threading" && (
          <div className="p-6">
            <MultiThreadingIntelligence
              leads={leads}
              deals={typedDeals}
              accounts={typedAccounts}
              onNavigateToLead={handleNavigateToLead}
            />
          </div>
        )}

        {/* === WIN/LOSS INTELLIGENCE SECTION === */}
        {sidebarSection === "winloss" && (
          <div className="p-6">
            <WinLossIntelligence
              deals={typedDeals}
              leads={leads}
            />
          </div>
        )}

        {/* === NOTIFICATION CENTER SECTION === */}
        {sidebarSection === "notifications" && (
          <div className="p-6">
            <NotificationCenter leads={leads} />
          </div>
        )}

        {/* === EVENT COMMAND CENTER SECTION (Phase 6) === */}
        {sidebarSection === "events" && (
          <div className="p-6">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--balboa-navy)", margin: 0 }}>Event Command Center</h2>
              <VascoContextButton
                prompt={`Analyze my upcoming events and attendee lists. I have ${events.length} events tracked. Which events have the highest-value attendees? What's my outreach coverage — who haven't I contacted yet? Suggest the best pre-event and post-event outreach strategy for maximum ROI.`}
                tooltip="Ask Vasco about event strategy"
                onClick={setVascoPrompt}
                size={16}
              />
            </div>
            <EventCommandCenter
              events={events}
              leads={leads}
              onNavigateToLead={handleNavigateToLead}
              language={contentLanguage}
            />
          </div>
        )}

        {/* === AGENT HUB SECTION === */}
        {sidebarSection === "agents" && (
          <div className="p-6">
            <AgentHubSection
              leads={leads}
              selectedLead={selectedLead}
              language={contentLanguage}
            />
          </div>
        )}

        {/* === INBOX SECTION === */}
        {sidebarSection === "inbox" && (
          <div className="p-6" style={{ height: "calc(100vh - 80px)" }}>
            <InboxSection
              leads={leads}
              communications={communications}
              contentLanguage={contentLanguage}
              onNavigateToLead={handleNavigateToLead}
              onGenerateMessage={generateMessage}
              onAskVasco={setVascoPrompt}
              onCopyMessage={copyToClipboard}
              generatingForLeadId={generatingForLeadId}
            />
          </div>
        )}

        {/* === COMPLIANCE SECTION === */}
        {sidebarSection === "compliance" && (
          <div className="p-6">
            <ComplianceDashboard
              leads={leads}
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
