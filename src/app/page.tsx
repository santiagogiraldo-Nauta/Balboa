"use client";

import { useState, useCallback, useEffect } from "react";
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
} from "lucide-react";
import type { Lead, DraftMessage, CallLog, CallOutcome, VideoPrep, PrepKit, BattleCard, SupportedLanguage, SidebarSection } from "@/lib/types";
import { MOCK_LEADS } from "@/lib/mock-data";
import { createClient } from "@/lib/supabase/client";
import { getLeads, upsertLead, upsertLeads } from "@/lib/db";
import { trackEventClient } from "@/lib/tracking";
import OutreachCommandCenter from "@/components/OutreachCommandCenter";
import Prospecting from "@/components/Prospecting";
import ActivityTimeline from "@/components/ActivityTimeline";
import CrossChannelWarning from "@/components/CrossChannelWarning";
import LogCallModal from "@/components/LogCallModal";
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
import { getClientConfig } from "@/lib/config-client";
import { mockDeals, mockAccounts } from "@/lib/mock-phase2";

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>(MOCK_LEADS);
  const [sidebarSection, setSidebarSection] = useState<SidebarSection>("today");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [filterTier, setFilterTier] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showCallModal, setShowCallModal] = useState(false);
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

  const supabase = createClient();
  const { isSandbox } = getClientConfig();

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
    setShowCallModal(false);

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

  // Compute recommended next action for a lead
  const getRecommendedAction = (lead: Lead): { action: string; reason: string; icon: string; urgency: "urgent" | "high" | "medium" | "low" } => {
    const daysSinceContact = lead.touchpointTimeline?.length > 0
      ? Math.floor((Date.now() - new Date(lead.touchpointTimeline[lead.touchpointTimeline.length - 1].date).getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    const hasEmail = lead.channels?.email || lead.email;
    const hasLinkedIn = lead.channels?.linkedin || lead.linkedinUrl;
    const tier = lead.icpScore?.tier || "cold";
    const status = lead.status || "new";

    // New lead — first touch
    if (status === "new" && lead.contactStatus === "not_contacted") {
      if (hasLinkedIn) return { action: "Send LinkedIn Message", reason: "New lead — make your first connection", icon: "linkedin", urgency: tier === "hot" ? "urgent" : "high" };
      if (hasEmail) return { action: "Send Introduction Email", reason: "New lead — introduce yourself", icon: "email", urgency: tier === "hot" ? "urgent" : "high" };
      return { action: "Research Lead", reason: "New lead — gather contact info", icon: "research", urgency: "medium" };
    }

    // Positive reply — move fast
    if (lead.contactStatus === "positive") {
      return { action: "Schedule Meeting", reason: "Positive response — strike while hot", icon: "meeting", urgency: "urgent" };
    }

    // Opportunity stage — send proposal
    if (status === "opportunity") {
      return { action: "Send Proposal/Deck", reason: "Opportunity stage — advance the deal", icon: "proposal", urgency: "high" };
    }

    // Engaged but stalling
    if (status === "engaged" && daysSinceContact > 5) {
      return { action: "Send Follow-up Email", reason: `No contact in ${daysSinceContact} days — re-engage`, icon: "email", urgency: daysSinceContact > 14 ? "urgent" : "high" };
    }

    // Researched — ready for outreach
    if (status === "researched") {
      if (tier === "hot") return { action: "Send Personalized Email", reason: "Hot lead — ready for outreach", icon: "email", urgency: "high" };
      return { action: "Send LinkedIn Message", reason: "Researched — initiate contact", icon: "linkedin", urgency: "medium" };
    }

    // No reply after contact
    if (lead.contactStatus === "not_contacted" || lead.contactStatus === "neutral") {
      if (daysSinceContact > 7) return { action: "Send Follow-up", reason: `Last contact ${daysSinceContact}d ago — follow up`, icon: "email", urgency: daysSinceContact > 14 ? "high" : "medium" };
    }

    // Nurture leads — low touch
    if (status === "nurture") {
      return { action: "Share Content/Article", reason: "Nurture — stay top of mind", icon: "proposal", urgency: "low" };
    }

    // Default
    return { action: "Review & Plan Next Step", reason: "Assess current status", icon: "research", urgency: "low" };
  };

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

  // Avatar Initials
  const Avatar = ({ name, size = 36 }: { name: string; size?: number }) => {
    const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    const colors = [
      ["#e8f4fd", "#0077b5"], ["#fef2f2", "#dc2626"], ["#ecfdf5", "#059669"],
      ["#f5f3ff", "#7c3aed"], ["#fffbeb", "#d97706"], ["#eff6ff", "#2563eb"],
    ];
    const idx = name.charCodeAt(0) % colors.length;
    return (
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: colors[idx][0], color: colors[idx][1],
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.36, fontWeight: 700, letterSpacing: "-0.02em",
        flexShrink: 0,
      }}>
        {initials}
      </div>
    );
  };

  // Score Ring
  const ScoreRing = ({ score, size = 44 }: { score: number; size?: number }) => {
    const radius = (size - 6) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    const color = score >= 70 ? "#e03131" : score >= 40 ? "#f59f00" : "#3b5bdb";

    return (
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f3f5" strokeWidth="3" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="score-ring" />
        <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
          fill={color} fontSize={size * 0.28} fontWeight="700" className="transform rotate-90" style={{ transformOrigin: "center" }}>
          {score}
        </text>
      </svg>
    );
  };

  // Channel indicator for leads
  const ChannelIndicator = ({ lead }: { lead: Lead }) => {
    const hasLinkedIn = lead.channels?.linkedin;
    const hasEmail = lead.channels?.email;
    if (hasLinkedIn && hasEmail) {
      return <span className="channel-pill channel-both"><Linkedin className="w-3 h-3" /><AtSign className="w-3 h-3" /> Both</span>;
    }
    if (hasLinkedIn) {
      return <span className="channel-pill channel-linkedin"><Linkedin className="w-3 h-3" /> LinkedIn</span>;
    }
    if (hasEmail) {
      return <span className="channel-pill channel-email"><AtSign className="w-3 h-3" /> Email</span>;
    }
    return null;
  };

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
            <button onClick={() => setShowCallModal(true)} className="btn-primary" style={{ background: "var(--balboa-green)", fontSize: 12, boxShadow: "0 1px 4px rgba(43, 138, 62, 0.25)" }}>
              <Phone className="w-3.5 h-3.5" /> Log Call
            </button>
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

                {/* Lead detail */}
                {selectedLead && (
                  <div className="card fade-in" style={{ width: "55%", padding: "22px 24px", maxHeight: "calc(100vh - 240px)", overflowY: "auto" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
                      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                        <Avatar name={`${selectedLead.firstName} ${selectedLead.lastName}`} size={48} />
                        <div>
                          <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--balboa-navy)", letterSpacing: "-0.02em", lineHeight: 1.2 }}>{selectedLead.firstName} {selectedLead.lastName}</h2>
                          <p style={{ fontSize: 13, color: "var(--balboa-text-secondary)", marginTop: 2 }}>{selectedLead.position}</p>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-blue)", marginTop: 1 }}>{selectedLead.company}</p>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <ChannelIndicator lead={selectedLead} />
                        <button onClick={() => setSelectedLead(null)} className="btn-ghost" style={{ padding: 4 }}>
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Score + Pipeline merged row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, padding: "14px 16px", background: "var(--balboa-bg-alt)", borderRadius: 12, border: "1px solid var(--balboa-border-light)" }}>
                      <ScoreRing score={selectedLead.icpScore?.overall || 0} size={48} />
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", flex: 1 }}>
                        {(["new", "researched", "engaged", "opportunity", "nurture"] as const).map((s) => (
                          <button key={s} onClick={() => updateLeadStatus(selectedLead.id, s)}
                            style={{
                              padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer",
                              transition: "all 0.15s ease", letterSpacing: "-0.01em",
                              ...(selectedLead.status === s
                                ? { background: "var(--balboa-navy)", color: "white", boxShadow: "0 1px 3px rgba(30,42,94,0.2)" }
                                : { background: "white", color: "var(--balboa-text-muted)", border: "1px solid var(--balboa-border)" }),
                            }}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Key info — top 2 signals + expandable details */}
                    {selectedLead.icpScore?.signals && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {selectedLead.icpScore.signals.slice(0, 2).map((s, i) => (
                            <div key={i} style={{ fontSize: 12, display: "flex", alignItems: "flex-start", gap: 8, color: "var(--balboa-text-secondary)", lineHeight: 1.4 }}>
                              <CheckCircle className="w-3.5 h-3.5" style={{ color: "var(--balboa-green)", flexShrink: 0, marginTop: 1 }} /> {s}
                            </div>
                          ))}
                        </div>
                        {(selectedLead.icpScore.signals.length > 2 || selectedLead.companyIntel) && (
                          <button onClick={() => setDetailExpanded(!detailExpanded)}
                            className="btn-ghost" style={{ color: "var(--balboa-blue)", fontSize: 11, marginTop: 8 }}>
                            <ChevronDown className="w-3 h-3" style={{ transform: detailExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                            {detailExpanded ? "Hide details" : "Show company intel & all signals"}
                          </button>
                        )}

                        {/* Expanded section */}
                        {detailExpanded && (
                          <div className="fade-in" style={{ marginTop: 12 }}>
                            {/* Remaining signals */}
                            {selectedLead.icpScore.signals.length > 2 && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                                {selectedLead.icpScore.signals.slice(2).map((s, i) => (
                                  <div key={i} style={{ fontSize: 12, display: "flex", alignItems: "flex-start", gap: 8, color: "var(--balboa-text-secondary)", lineHeight: 1.4 }}>
                                    <CheckCircle className="w-3.5 h-3.5" style={{ color: "var(--balboa-green)", flexShrink: 0, marginTop: 1 }} /> {s}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Company Intel */}
                            {selectedLead.companyIntel && (
                              <div style={{ borderRadius: 10, padding: 14, background: "var(--balboa-bg-alt)", border: "1px solid var(--balboa-border-light)", display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                  <div><span style={{ color: "var(--balboa-text-muted)", fontWeight: 500 }}>Industry</span><br /><span style={{ fontWeight: 600 }}>{selectedLead.companyIntel.industry}</span></div>
                                  <div><span style={{ color: "var(--balboa-text-muted)", fontWeight: 500 }}>Revenue</span><br /><span style={{ fontWeight: 600 }}>{selectedLead.companyIntel.estimatedRevenue}</span></div>
                                  <div><span style={{ color: "var(--balboa-text-muted)", fontWeight: 500 }}>Employees</span><br /><span style={{ fontWeight: 600 }}>{selectedLead.companyIntel.employeeCount}</span></div>
                                </div>
                                {selectedLead.companyIntel.balboaFitReason && (
                                  <div style={{ paddingTop: 8, borderTop: "1px solid var(--balboa-border-light)" }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--balboa-navy)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Balboa Fit</span>
                                    <p style={{ marginTop: 4, lineHeight: 1.4 }}>{selectedLead.companyIntel.balboaFitReason}</p>
                                  </div>
                                )}
                                {selectedLead.companyIntel.painPoints?.length > 0 && (
                                  <div style={{ paddingTop: 8, borderTop: "1px solid var(--balboa-border-light)" }}>
                                    <span style={{ color: "var(--balboa-text-muted)", fontWeight: 500 }}>Pain Points</span>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                                      {selectedLead.companyIntel.painPoints.map((p, i) => (
                                        <span key={i} className="badge badge-hot" style={{ fontSize: 10 }}>{p}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Call Outcomes (if lead has recent calls) */}
                    {selectedLead.callLogs && selectedLead.callLogs.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <h4 style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          <Phone className="w-3.5 h-3.5" style={{ color: "#059669" }} /> Call Outcomes
                        </h4>
                        {selectedLead.callLogs.slice(-1).map(call => (
                          <div key={call.id} style={{ borderRadius: 10, padding: 12, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                            <div style={{ fontSize: 11, marginBottom: 8, color: "var(--balboa-text-muted)", fontWeight: 500 }}>
                              {call.platform.replace("_", " ")} &middot; {call.duration || "N/A"} &middot; {new Date(call.date).toLocaleDateString()}
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {call.outcomes.map((o, i) => (
                                <span key={i} className={`outcome-chip ${o.completed ? "" : "active"}`} style={{ fontSize: 11, cursor: "default" }}>
                                  {o.completed ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                  {o.description}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Cross-Channel Activity Timeline — capped at 5 */}
                    {selectedLead.touchpointTimeline && selectedLead.touchpointTimeline.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <h4 style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          <Clock className="w-3.5 h-3.5" style={{ color: "var(--balboa-navy)" }} /> Activity Timeline
                        </h4>
                        <div style={{ background: "var(--balboa-bg-alt)", borderRadius: 10, padding: 14, border: "1px solid var(--balboa-border-light)" }}>
                          <ActivityTimeline events={selectedLead.touchpointTimeline.slice(-5)} />
                          {selectedLead.touchpointTimeline.length > 5 && (
                            <button className="btn-ghost" style={{ color: "var(--balboa-blue)", fontSize: 11, marginTop: 8 }}
                              onClick={() => {/* Could expand to full timeline */}}>
                              Show all {selectedLead.touchpointTimeline.length} events
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Quick Note */}
                    <div style={{ marginBottom: 20 }}>
                      <h4 style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        <StickyNote className="w-3.5 h-3.5" style={{ color: "#d97706" }} /> Quick Note
                      </h4>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          type="text"
                          placeholder="Add a note about this lead..."
                          value={quickNote}
                          onChange={e => setQuickNote(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter" && quickNote.trim()) handleAddNote(selectedLead.id, quickNote); }}
                          style={{
                            flex: 1, fontSize: 12, padding: "8px 12px", borderRadius: 8,
                            border: "1px solid var(--balboa-border)", outline: "none",
                            background: "var(--balboa-bg-alt)", color: "var(--balboa-text-secondary)",
                          }}
                        />
                        <button
                          onClick={() => handleAddNote(selectedLead.id, quickNote)}
                          disabled={!quickNote.trim()}
                          className="btn-primary"
                          style={{ fontSize: 11, padding: "8px 14px", opacity: quickNote.trim() ? 1 : 0.4 }}
                        >
                          Save
                        </button>
                      </div>
                      {/* Existing notes from lead.notes field */}
                      {selectedLead.notes && (
                        <div style={{
                          marginTop: 8, padding: "8px 12px", borderRadius: 8,
                          background: "#fffbeb", border: "1px solid #fde68a", fontSize: 12,
                          color: "#92400e", lineHeight: 1.4, fontStyle: "italic",
                        }}>
                          <span style={{ fontWeight: 600, fontStyle: "normal" }}>Notes: </span>
                          {selectedLead.notes}
                        </div>
                      )}
                    </div>

                    {/* ⚡ Quick Actions — Recommended next step + action buttons */}
                    {(() => {
                      const rec = getRecommendedAction(selectedLead);
                      const urgencyColors: Record<string, { bg: string; border: string; text: string; dot: string }> = {
                        urgent: { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b", dot: "#dc2626" },
                        high: { bg: "#fff7ed", border: "#fdba74", text: "#9a3412", dot: "#f97316" },
                        medium: { bg: "#f0f4ff", border: "#93b4fd", text: "#1e3a8a", dot: "#3b82f6" },
                        low: { bg: "var(--balboa-bg-alt)", border: "var(--balboa-border)", text: "var(--balboa-text-secondary)", dot: "#94a3b8" },
                      };
                      const uc = urgencyColors[rec.urgency] || urgencyColors.medium;

                      return (
                        <div style={{ marginBottom: 20 }}>
                          <h4 style={{ fontSize: 11, fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            <Zap className="w-3.5 h-3.5" style={{ color: "var(--balboa-orange)" }} /> Quick Actions
                          </h4>

                          {/* Recommended action banner */}
                          <div style={{
                            padding: "12px 14px", borderRadius: 10, marginBottom: 12,
                            background: uc.bg, border: `1px solid ${uc.border}`,
                            display: "flex", alignItems: "center", gap: 10,
                          }}>
                            <div style={{
                              width: 8, height: 8, borderRadius: "50%",
                              background: uc.dot, flexShrink: 0,
                              boxShadow: rec.urgency === "urgent" ? `0 0 6px ${uc.dot}` : "none",
                              animation: rec.urgency === "urgent" ? "pulse 2s infinite" : "none",
                            }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 12, fontWeight: 700, color: uc.text, lineHeight: 1.3 }}>
                                {rec.urgency === "urgent" ? "🔴 " : rec.urgency === "high" ? "🟠 " : ""}{rec.action}
                              </p>
                              <p style={{ fontSize: 11, color: uc.text, opacity: 0.8, marginTop: 2, lineHeight: 1.3 }}>
                                {rec.reason}
                              </p>
                            </div>
                          </div>

                          {/* Action buttons grid */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                            {/* Send Email */}
                            <button onClick={() => generateMessage(selectedLead, "email_initial", "email")}
                              disabled={!!generatingAction}
                              style={{
                                display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10,
                                background: rec.icon === "email" ? "linear-gradient(135deg, var(--balboa-navy), var(--balboa-blue))" : "white",
                                color: rec.icon === "email" ? "white" : "var(--balboa-navy)",
                                border: rec.icon === "email" ? "none" : "1px solid var(--balboa-border)",
                                cursor: generatingAction ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, transition: "all 0.2s ease",
                                boxShadow: rec.icon === "email" ? "0 2px 8px rgba(30,42,94,0.25)" : "none",
                                opacity: generatingAction && generatingAction !== "email_initial" ? 0.5 : 1,
                              }}>
                              {generatingAction === "email_initial"
                                ? <RefreshCw className="w-4 h-4 animate-spin" style={{ flexShrink: 0 }} />
                                : <Mail className="w-4 h-4" style={{ flexShrink: 0, opacity: rec.icon === "email" ? 1 : 0.7 }} />}
                              <span>{generatingAction === "email_initial" ? "Generating..." : "Send Email"}</span>
                            </button>

                            {/* Send LinkedIn Message */}
                            <button onClick={() => generateMessage(selectedLead, "connection_followup", "linkedin")}
                              disabled={!!generatingAction}
                              style={{
                                display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10,
                                background: rec.icon === "linkedin" ? "linear-gradient(135deg, #0077b5, #00a0dc)" : "white",
                                color: rec.icon === "linkedin" ? "white" : "#0077b5",
                                border: rec.icon === "linkedin" ? "none" : "1px solid #b3d4fc",
                                cursor: generatingAction ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, transition: "all 0.2s ease",
                                boxShadow: rec.icon === "linkedin" ? "0 2px 8px rgba(0,119,181,0.25)" : "none",
                                opacity: generatingAction && generatingAction !== "connection_followup" ? 0.5 : 1,
                              }}>
                              {generatingAction === "connection_followup"
                                ? <RefreshCw className="w-4 h-4 animate-spin" style={{ flexShrink: 0 }} />
                                : <Linkedin className="w-4 h-4" style={{ flexShrink: 0, opacity: rec.icon === "linkedin" ? 1 : 0.7 }} />}
                              <span>{generatingAction === "connection_followup" ? "Generating..." : "LinkedIn Msg"}</span>
                            </button>

                            {/* Schedule Meeting */}
                            <button onClick={() => setShowMeetingScheduler(true)}
                              disabled={!!generatingAction}
                              style={{
                                display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10,
                                background: rec.icon === "meeting" ? "linear-gradient(135deg, #059669, #10b981)" : "white",
                                color: rec.icon === "meeting" ? "white" : "#059669",
                                border: rec.icon === "meeting" ? "none" : "1px solid #a7f3d0",
                                cursor: generatingAction ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, transition: "all 0.2s ease",
                                boxShadow: rec.icon === "meeting" ? "0 2px 8px rgba(5,150,105,0.25)" : "none",
                                opacity: generatingAction ? 0.5 : 1,
                              }}>
                              <Calendar className="w-4 h-4" style={{ flexShrink: 0, opacity: rec.icon === "meeting" ? 1 : 0.7 }} />
                              <span>Schedule Meeting</span>
                            </button>

                            {/* Send Proposal/Deck */}
                            <button onClick={() => generateMessage(selectedLead, "value_share", "email")}
                              disabled={!!generatingAction}
                              style={{
                                display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10,
                                background: rec.icon === "proposal" ? "linear-gradient(135deg, #7c3aed, #a855f7)" : "white",
                                color: rec.icon === "proposal" ? "white" : "#7c3aed",
                                border: rec.icon === "proposal" ? "none" : "1px solid #c4b5fd",
                                cursor: generatingAction ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, transition: "all 0.2s ease",
                                boxShadow: rec.icon === "proposal" ? "0 2px 8px rgba(124,58,237,0.25)" : "none",
                                opacity: generatingAction && generatingAction !== "value_share" ? 0.5 : 1,
                              }}>
                              {generatingAction === "value_share"
                                ? <RefreshCw className="w-4 h-4 animate-spin" style={{ flexShrink: 0 }} />
                                : <FileText className="w-4 h-4" style={{ flexShrink: 0, opacity: rec.icon === "proposal" ? 1 : 0.7 }} />}
                              <span>{generatingAction === "value_share" ? "Generating..." : "Send Proposal"}</span>
                            </button>
                          </div>

                          {/* Sales Tools row — Video + Prep Kit */}
                          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                            <button onClick={() => setShowVideoPrep(true)}
                              style={{
                                display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, flex: 1,
                                background: "var(--balboa-bg-alt)", color: "var(--balboa-navy)",
                                border: "1px solid var(--balboa-border)", cursor: "pointer",
                                fontSize: 11, fontWeight: 600, transition: "all 0.2s ease",
                              }}>
                              <Video className="w-3.5 h-3.5" style={{ opacity: 0.7 }} /> Create Video
                            </button>
                            <button onClick={() => setShowPrepKit(true)}
                              style={{
                                display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, flex: 1,
                                background: "var(--balboa-bg-alt)", color: "var(--balboa-navy)",
                                border: "1px solid var(--balboa-border)", cursor: "pointer",
                                fontSize: 11, fontWeight: 600, transition: "all 0.2s ease",
                              }}>
                              <BookOpen className="w-3.5 h-3.5" style={{ opacity: 0.7 }} /> Prep Kit
                            </button>
                            <button onClick={() => {
                              if (selectedLead.linkedinUrl) window.open(selectedLead.linkedinUrl, "_blank");
                              else if (selectedLead.firstName && selectedLead.lastName) window.open(`https://linkedin.com/search/results/people/?keywords=${encodeURIComponent(selectedLead.firstName + " " + selectedLead.lastName + " " + selectedLead.company)}`, "_blank");
                            }}
                              style={{
                                display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, flex: 1,
                                background: "var(--balboa-bg-alt)", color: "var(--balboa-navy)",
                                border: "1px solid var(--balboa-border)", cursor: "pointer",
                                fontSize: 11, fontWeight: 600, transition: "all 0.2s ease",
                              }}>
                              <ExternalLink className="w-3.5 h-3.5" style={{ opacity: 0.7 }} /> LinkedIn
                            </button>
                          </div>

                          {/* Video preps count + Prep Kit panel */}
                          {selectedLead.videoPreps && selectedLead.videoPreps.length > 0 && (
                            <p style={{ fontSize: 11, marginTop: 4, display: "flex", alignItems: "center", gap: 4, color: "var(--balboa-text-muted)" }}>
                              <CheckCircle className="w-3 h-3" style={{ color: "var(--balboa-green)" }} />
                              {selectedLead.videoPreps.length} video prep{selectedLead.videoPreps.length > 1 ? "s" : ""} saved
                            </p>
                          )}
                          <PrepKitPanel
                            kits={selectedLead.prepKits || []}
                            onGenerateNew={() => setShowPrepKit(true)}
                          />
                        </div>
                      );
                    })()}

                    {/* 🧠 Lead Intelligence — AI-Powered Analysis */}
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <h4 style={{ fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--balboa-blue)" }} /> Lead Intelligence
                        </h4>
                        <button
                          onClick={() => analyzeLead(selectedLead)}
                          disabled={analyzingLead}
                          style={{
                            display: "flex", alignItems: "center", gap: 5,
                            padding: "6px 14px", borderRadius: 8,
                            background: analyzingLead ? "var(--balboa-bg-alt)" : "linear-gradient(135deg, var(--balboa-navy), var(--balboa-blue))",
                            color: analyzingLead ? "var(--balboa-text-muted)" : "white",
                            border: "none", cursor: analyzingLead ? "not-allowed" : "pointer",
                            fontSize: 11, fontWeight: 700, transition: "all 0.2s ease",
                            boxShadow: analyzingLead ? "none" : "0 2px 8px rgba(30,42,94,0.20)",
                          }}
                        >
                          {analyzingLead ? (
                            <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Analyzing...</>
                          ) : (
                            <><Target className="w-3.5 h-3.5" /> {leadAnalysis ? "Re-analyze" : "Analyze Lead"}</>
                          )}
                        </button>
                      </div>

                      {!leadAnalysis && !analyzingLead && (
                        <div style={{
                          padding: "16px 18px", borderRadius: 12,
                          background: "linear-gradient(135deg, rgba(30,42,94,0.03), rgba(59,91,219,0.05))",
                          border: "1px dashed var(--balboa-border)",
                          textAlign: "center",
                        }}>
                          <Sparkles className="w-5 h-5" style={{ color: "var(--balboa-blue)", opacity: 0.5, margin: "0 auto 8px" }} />
                          <p style={{ fontSize: 12, color: "var(--balboa-text-muted)", lineHeight: 1.5 }}>
                            Click <strong>Analyze Lead</strong> to get AI-powered recommendations based on playbook intelligence — best channel, optimal timing, and expected outcomes.
                          </p>
                        </div>
                      )}

                      {analyzingLead && (
                        <div style={{
                          padding: "20px", borderRadius: 12,
                          background: "var(--balboa-bg-alt)", border: "1px solid var(--balboa-border-light)",
                          textAlign: "center",
                        }}>
                          <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-3"
                            style={{ borderColor: "var(--balboa-border)", borderTopColor: "var(--balboa-navy)" }} />
                          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-navy)" }}>Analyzing {selectedLead.firstName} with Playbook Intelligence...</p>
                          <p style={{ fontSize: 11, color: "var(--balboa-text-muted)", marginTop: 4 }}>Checking best channel, timing, and expected outcomes</p>
                        </div>
                      )}

                      {leadAnalysis && !analyzingLead && (
                        <div style={{
                          borderRadius: 12, overflow: "hidden",
                          border: "1px solid var(--balboa-border-light)",
                          background: "white",
                        }}>
                          {/* Strategy recommendation */}
                          <div style={{
                            padding: "14px 16px",
                            background: leadAnalysis.urgency === "immediate" ? "linear-gradient(135deg, #fef2f2, #fff1f2)"
                              : leadAnalysis.urgency === "high" ? "linear-gradient(135deg, #fff7ed, #fffbeb)"
                              : "linear-gradient(135deg, #f0f4ff, #eff6ff)",
                            borderBottom: "1px solid var(--balboa-border-light)",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                              <span style={{
                                fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em",
                                padding: "2px 8px", borderRadius: 4,
                                background: leadAnalysis.urgency === "immediate" ? "#dc2626" : leadAnalysis.urgency === "high" ? "#f97316" : "#3b82f6",
                                color: "white",
                              }}>
                                {leadAnalysis.urgency}
                              </span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--balboa-navy)" }}>
                                {leadAnalysis.recommendedAction}
                              </span>
                            </div>
                            <p style={{ fontSize: 12, color: "var(--balboa-text-secondary)", lineHeight: 1.5 }}>
                              {leadAnalysis.reasoning}
                            </p>
                          </div>

                          {/* Metrics grid */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
                            {/* Best Channel */}
                            <div style={{ padding: "12px 16px", borderRight: "1px solid var(--balboa-border-light)", borderBottom: "1px solid var(--balboa-border-light)" }}>
                              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Best Channel</p>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                {leadAnalysis.recommendedChannel === "email"
                                  ? <Mail className="w-4 h-4" style={{ color: "var(--balboa-navy)" }} />
                                  : <Linkedin className="w-4 h-4" style={{ color: "#0077b5" }} />}
                                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--balboa-navy)", textTransform: "capitalize" }}>
                                  {leadAnalysis.recommendedChannel}
                                </span>
                              </div>
                            </div>

                            {/* Best Timing */}
                            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--balboa-border-light)" }}>
                              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Best Timing</p>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <Clock className="w-4 h-4" style={{ color: "#059669" }} />
                                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--balboa-navy)" }}>
                                  {leadAnalysis.recommendedTiming}
                                </span>
                              </div>
                            </div>

                            {/* Expected Outcomes */}
                            <div style={{ padding: "12px 16px", gridColumn: "1 / -1" }}>
                              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Expected Outcomes</p>
                              <div style={{ display: "flex", gap: 16 }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                                    <span style={{ fontSize: 20, fontWeight: 800, color: "var(--balboa-navy)" }}>
                                      {Math.round((leadAnalysis.expectedOutcomes?.replyRate || 0) * 100)}%
                                    </span>
                                  </div>
                                  <p style={{ fontSize: 10, color: "var(--balboa-text-muted)", fontWeight: 600 }}>Reply Rate</p>
                                  <div className="rate-bar-track" style={{ marginTop: 4, height: 4 }}>
                                    <div className="rate-bar-fill" style={{ width: `${(leadAnalysis.expectedOutcomes?.replyRate || 0) * 100}%`, background: "#059669" }} />
                                  </div>
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                                    <span style={{ fontSize: 20, fontWeight: 800, color: "var(--balboa-navy)" }}>
                                      {Math.round((leadAnalysis.expectedOutcomes?.meetingRate || 0) * 100)}%
                                    </span>
                                  </div>
                                  <p style={{ fontSize: 10, color: "var(--balboa-text-muted)", fontWeight: 600 }}>Meeting Rate</p>
                                  <div className="rate-bar-track" style={{ marginTop: 4, height: 4 }}>
                                    <div className="rate-bar-fill" style={{ width: `${(leadAnalysis.expectedOutcomes?.meetingRate || 0) * 100}%`, background: "#3b82f6" }} />
                                  </div>
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                                    <span style={{ fontSize: 20, fontWeight: 800, color: "var(--balboa-navy)" }}>
                                      {Math.round((leadAnalysis.expectedOutcomes?.closeRate || 0) * 100)}%
                                    </span>
                                  </div>
                                  <p style={{ fontSize: 10, color: "var(--balboa-text-muted)", fontWeight: 600 }}>Close Rate</p>
                                  <div className="rate-bar-track" style={{ marginTop: 4, height: 4 }}>
                                    <div className="rate-bar-fill" style={{ width: `${(leadAnalysis.expectedOutcomes?.closeRate || 0) * 100}%`, background: "#7c3aed" }} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Quick action from analysis */}
                          <div style={{ padding: "10px 16px", borderTop: "1px solid var(--balboa-border-light)", background: "var(--balboa-bg-alt)", display: "flex", gap: 8 }}>
                            <button
                              onClick={() => generateMessage(selectedLead,
                                leadAnalysis.recommendedChannel === "email" ? "email_initial" : "connection_followup",
                                leadAnalysis.recommendedChannel)}
                              disabled={!!generatingAction}
                              style={{
                                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                padding: "8px 12px", borderRadius: 8,
                                background: "linear-gradient(135deg, var(--balboa-navy), var(--balboa-blue))",
                                color: "white", border: "none",
                                cursor: generatingAction ? "not-allowed" : "pointer",
                                fontSize: 12, fontWeight: 700, transition: "all 0.2s ease",
                                boxShadow: "0 2px 8px rgba(30,42,94,0.20)",
                                opacity: generatingAction ? 0.6 : 1,
                              }}
                            >
                              {generatingAction ? (
                                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating...</>
                              ) : (
                                <><Sparkles className="w-3.5 h-3.5" /> Generate {leadAnalysis.recommendedChannel === "email" ? "Email" : "LinkedIn"} Draft</>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Battle Cards */}
                    <BattleCardPanel
                      lead={selectedLead}
                      cards={selectedLead.battleCards || []}
                      onGenerate={(competitor) => handleBattleCardGenerate(selectedLead.id, competitor)}
                    />

                    {/* Cross-Channel Warning */}
                    <CrossChannelWarning lead={selectedLead} currentChannel="linkedin" />

                    {/* Draft Messages */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <h4 style={{ fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          <MessageSquare className="w-3.5 h-3.5" style={{ color: "var(--balboa-navy)" }} /> Draft Messages
                        </h4>
                        <div style={{ display: "flex", gap: 2 }}>
                          {([
                            { type: "connection_followup", channel: "linkedin" as const, label: "+ LinkedIn" },
                            { type: "email_initial", channel: "email" as const, label: "+ Email" },
                            { type: "value_share", channel: "email" as const, label: "+ Proposal" },
                          ]).map((item) => (
                            <button key={item.type} onClick={() => generateMessage(selectedLead, item.type, item.channel)}
                              disabled={!!generatingAction}
                              className="btn-ghost" style={{ fontSize: 10, opacity: generatingAction ? 0.5 : 1 }}>
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <LanguageSelector value={contentLanguage} onChange={setContentLanguage} />
                      </div>
                      {selectedLead.draftMessages.length === 0 ? (
                        <p style={{ fontSize: 12, fontStyle: "italic", color: "var(--balboa-text-muted)", padding: "12px 0" }}>No drafts yet. Generate one above.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {selectedLead.draftMessages.map((d) => (
                            <div key={d.id} style={{ borderRadius: 10, padding: 14, background: "var(--balboa-bg-alt)", border: "1px solid var(--balboa-border-light)" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--balboa-navy)", letterSpacing: "0.03em" }}>{d.type?.replace(/_/g, " ").toUpperCase()}</span>
                                  <span className={`channel-pill ${d.channel === "linkedin" ? "channel-linkedin" : "channel-email"}`}>
                                    {d.channel === "linkedin" ? <Linkedin className="w-3 h-3" /> : <AtSign className="w-3 h-3" />}
                                    {d.channel}
                                  </span>
                                </div>
                                <span className={`badge ${d.status === "approved" ? "badge-connected" : d.status === "rejected" ? "badge-hot" : "badge-warm"}`}>
                                  {d.status}
                                </span>
                              </div>
                              <p style={{ fontSize: 12, whiteSpace: "pre-wrap", marginBottom: 10, color: "var(--balboa-text-secondary)", lineHeight: 1.5 }}>{d.body}</p>
                              <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", borderTop: "1px solid var(--balboa-border-light)", paddingTop: 8 }}>
                                <button onClick={() => copyToClipboard(d.body)} className="btn-ghost" style={{ fontSize: 11 }}>
                                  <Copy className="w-3 h-3" /> Copy
                                </button>
                                {d.status === "draft" && (
                                  <>
                                    <button onClick={() => updateDraftStatus(selectedLead.id, d.id, "approved")}
                                      className="btn-ghost" style={{ fontSize: 11, color: "var(--balboa-green)" }}>
                                      <CheckCircle className="w-3 h-3" /> Approve
                                    </button>
                                    <button onClick={() => updateDraftStatus(selectedLead.id, d.id, "rejected")}
                                      className="btn-ghost" style={{ fontSize: 11, color: "var(--balboa-red)" }}>
                                      <XCircle className="w-3 h-3" /> Reject
                                    </button>
                                  </>
                                )}
                                {d.status === "approved" && (
                                  <>
                                    {d.channel === "linkedin" ? (
                                      <button onClick={() => {
                                        copyToClipboard(d.body);
                                        const url = selectedLead.linkedinUrl
                                          || `https://linkedin.com/search/results/people/?keywords=${encodeURIComponent(selectedLead.firstName + " " + selectedLead.lastName + " " + selectedLead.company)}`;
                                        window.open(url, "_blank");
                                        trackEventClient({ eventCategory: "outreach", eventAction: "message_sent", leadId: selectedLead.id, channel: "linkedin" });
                                      }} className="btn-ghost" style={{ fontSize: 11, color: "#0077b5", fontWeight: 700 }}>
                                        <ExternalLink className="w-3 h-3" /> Copy & Open LinkedIn
                                      </button>
                                    ) : (
                                      <button onClick={() => {
                                        const subject = encodeURIComponent(d.subject || "");
                                        const body = encodeURIComponent(d.body || "");
                                        const email = selectedLead.email || "";
                                        window.open(`mailto:${email}?subject=${subject}&body=${body}`, "_blank");
                                        updateDraftStatus(selectedLead.id, d.id, "sent");
                                        // Auto-advance lead status on send
                                        if (selectedLead.contactStatus === "not_contacted") {
                                          handleUpdateLead(selectedLead.id, { contactStatus: "neutral" });
                                        }
                                        if (selectedLead.status === "new") {
                                          updateLeadStatus(selectedLead.id, "engaged");
                                        }
                                        trackEventClient({ eventCategory: "outreach", eventAction: "message_sent", leadId: selectedLead.id, channel: "email" });
                                        setToastMessage("Email compose opened!");
                                        setTimeout(() => setToastMessage(null), 2000);
                                      }} className="btn-ghost" style={{ fontSize: 11, color: "var(--balboa-green)", fontWeight: 700 }}>
                                        <Send className="w-3 h-3" /> Compose Email
                                      </button>
                                    )}
                                  </>
                                )}
                                {d.status === "sent" && (
                                  <span style={{ fontSize: 10, color: "var(--balboa-green)", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                                    <CheckCircle className="w-3 h-3" /> Sent
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
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
            />
          </div>
        )}

        {/* === DEAL PIPELINE SECTION (Phase 2) === */}
        {sidebarSection === "deals" && (
          <div className="p-6">
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

      </div>

      {/* === ANALYZER PANEL (Phase 2) === */}
      {showAnalyzer && (
        <AnalyzerPanel onDismiss={() => setShowAnalyzer(false)} />
      )}

      {/* FAB — Log Call (always visible) */}
      <button className="fab" onClick={() => setShowCallModal(true)} title="Log a Call">
        <Phone className="w-5 h-5" />
      </button>

      {/* Log Call Modal */}
      {showCallModal && (
        <LogCallModal
          leads={leads}
          onClose={() => setShowCallModal(false)}
          onSubmit={handleCallLogSubmit}
        />
      )}

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
