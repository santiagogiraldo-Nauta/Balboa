"use client";

import { useState, useCallback } from "react";
import Papa from "papaparse";
import {
  Upload, Users, MessageSquare, Zap, PenTool, Search,
  ChevronRight, CheckCircle, XCircle, Clock, Star,
  TrendingUp, Target, AlertCircle, Copy, RefreshCw, Filter,
  BarChart3, Send, ThumbsUp, MessageCircle, Eye, Sparkles
} from "lucide-react";
import type { Lead, DraftMessage, TabType, ContentSuggestion } from "@/lib/types";

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tab, setTab] = useState<TabType>("pipeline");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [contentSuggestions, setContentSuggestions] = useState<ContentSuggestion[]>([]);
  const [researchQuery, setResearchQuery] = useState("");
  const [researchType, setResearchType] = useState("company_research");
  const [researchResult, setResearchResult] = useState<Record<string, unknown> | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [filterTier, setFilterTier] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const handleCSVUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setLoadingMessage("Parsing CSV...");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const connections = (results.data as Record<string, string>[])
          .map((row) => ({
            firstName: row["First Name"] || row["firstName"] || "",
            lastName: row["Last Name"] || row["lastName"] || "",
            company: row["Company"] || row["company"] || "",
            position: row["Position"] || row["position"] || row["Title"] || "",
            connectedOn: row["Connected On"] || row["connectedOn"] || "",
            email: row["Email Address"] || row["email"] || "",
          }))
          .filter((c) => c.firstName && c.company);

        setTotalCount(connections.length);
        setLoadingMessage(`Analyzing ${connections.length} connections with AI...`);

        const batchSize = 10;
        const allLeads: Lead[] = [];

        for (let i = 0; i < connections.length; i += batchSize) {
          const batch = connections.slice(i, i + batchSize);
          setProcessedCount(i);
          setLoadingMessage(`Scoring connections ${i + 1}-${Math.min(i + batchSize, connections.length)} of ${connections.length}...`);

          try {
            const resp = await fetch("/api/score", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ connections: batch }),
            });
            const data = await resp.json();
            if (data.leads) {
              allLeads.push(...data.leads);
              setLeads([...allLeads].sort((a, b) => (b.icpScore?.overall || 0) - (a.icpScore?.overall || 0)));
            }
          } catch (err) {
            console.error("Batch scoring error:", err);
          }
        }

        setLeads(allLeads.sort((a, b) => (b.icpScore?.overall || 0) - (a.icpScore?.overall || 0)));
        setLoading(false);
        setLoadingMessage("");
      },
    });
  }, []);

  const generateMessage = async (lead: Lead, type: string) => {
    setLoadingMessage("Generating message...");
    try {
      const resp = await fetch("/api/generate-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead, messageType: type }),
      });
      const data = await resp.json();
      if (data.message) {
        setLeads(prev => prev.map(l =>
          l.id === lead.id
            ? { ...l, draftMessages: [...l.draftMessages, data.message] }
            : l
        ));
        if (selectedLead?.id === lead.id) {
          setSelectedLead(prev => prev ? { ...prev, draftMessages: [...prev.draftMessages, data.message] } : null);
        }
      }
    } catch (err) {
      console.error("Message generation error:", err);
    }
    setLoadingMessage("");
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
  };

  const updateLeadStatus = (leadId: string, status: Lead["status"]) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status } : l));
    if (selectedLead?.id === leadId) {
      setSelectedLead(prev => prev ? { ...prev, status } : null);
    }
  };

  const loadContentSuggestions = async () => {
    setLoadingMessage("Generating content ideas...");
    setLoading(true);
    try {
      const resp = await fetch("/api/content-suggestions", { method: "POST" });
      const data = await resp.json();
      if (data.suggestions) setContentSuggestions(data.suggestions);
    } catch (err) {
      console.error("Content suggestion error:", err);
    }
    setLoading(false);
    setLoadingMessage("");
  };

  const runResearch = async () => {
    if (!researchQuery) return;
    setResearchLoading(true);
    try {
      const resp = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: researchQuery, type: researchType }),
      });
      const data = await resp.json();
      setResearchResult(data.result);
    } catch (err) {
      console.error("Research error:", err);
    }
    setResearchLoading(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
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

  const allDrafts = leads.flatMap(l =>
    l.draftMessages.map(d => ({ ...d, lead: l }))
  );

  // Render score ring
  const ScoreRing = ({ score, size = 48 }: { score: number; size?: number }) => {
    const radius = (size - 6) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    const color = score >= 70 ? "#ef4444" : score >= 40 ? "#f59e0b" : "#3b82f6";

    return (
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="score-ring" />
        <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
          fill={color} fontSize={size * 0.3} fontWeight="bold" className="transform rotate-90" style={{ transformOrigin: "center" }}>
          {score}
        </text>
      </svg>
    );
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="glass-card border-b border-t-0 border-l-0 border-r-0 rounded-none px-6 py-4">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#d4a843] to-[#f0d078] flex items-center justify-center">
              <Target className="w-6 h-6 text-[#1a2332]" />
            </div>
            <div>
              <h1 className="text-xl font-bold gold-gradient">Nauta Sales Agent</h1>
              <p className="text-xs text-gray-400">LinkedIn Intelligence Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {leads.length > 0 && (
              <div className="flex gap-4 text-sm">
                <div className="text-center">
                  <div className="text-red-400 font-bold text-lg">{stats.hotLeads}</div>
                  <div className="text-gray-500 text-xs">Hot</div>
                </div>
                <div className="text-center">
                  <div className="text-yellow-400 font-bold text-lg">{stats.warmLeads}</div>
                  <div className="text-gray-500 text-xs">Warm</div>
                </div>
                <div className="text-center">
                  <div className="text-blue-400 font-bold text-lg">{stats.pendingDrafts}</div>
                  <div className="text-gray-500 text-xs">Drafts</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6">
        {/* Upload State */}
        {leads.length === 0 && !loading && (
          <div className="flex items-center justify-center min-h-[70vh]">
            <div className="glass-card p-12 text-center max-w-lg">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#d4a843]/20 to-[#f0d078]/20 flex items-center justify-center mx-auto mb-6">
                <Upload className="w-10 h-10 text-[#d4a843]" />
              </div>
              <h2 className="text-2xl font-bold mb-3 gold-gradient">Upload LinkedIn Connections</h2>
              <p className="text-gray-400 mb-6">
                Export your connections from LinkedIn (Settings &gt; Data Privacy &gt; Get a copy of your data &gt; Connections)
                and upload the CSV here. AI will analyze each connection against Nauta&apos;s ICP.
              </p>
              <label className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#d4a843] to-[#f0d078] text-[#1a2332] font-bold rounded-lg cursor-pointer hover:opacity-90 transition">
                <Upload className="w-5 h-5" />
                Upload CSV
                <input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
              </label>
              <p className="text-xs text-gray-500 mt-4">100% safe - uses LinkedIn&apos;s official data export feature</p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="glass-card p-12 text-center max-w-lg">
              <div className="w-16 h-16 border-4 border-[#d4a843]/30 border-t-[#d4a843] rounded-full animate-spin mx-auto mb-6" />
              <h2 className="text-xl font-bold mb-2">{loadingMessage}</h2>
              {totalCount > 0 && (
                <div className="mt-4">
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div className="bg-gradient-to-r from-[#d4a843] to-[#f0d078] h-2 rounded-full transition-all duration-500"
                      style={{ width: `${(processedCount / totalCount) * 100}%` }} />
                  </div>
                  <p className="text-sm text-gray-400 mt-2">{processedCount} / {totalCount} connections analyzed</p>
                </div>
              )}
              {leads.length > 0 && (
                <p className="text-sm text-green-400 mt-2">{leads.filter(l => l.icpScore?.tier === "hot").length} hot leads found so far...</p>
              )}
            </div>
          </div>
        )}

        {/* Main Dashboard */}
        {leads.length > 0 && !loading && (
          <>
            {/* Stats Bar */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
              {[
                { label: "Total Analyzed", value: stats.totalConnections, icon: Users, color: "text-gray-300" },
                { label: "Hot Leads", value: stats.hotLeads, icon: TrendingUp, color: "text-red-400" },
                { label: "Warm Leads", value: stats.warmLeads, icon: Star, color: "text-yellow-400" },
                { label: "Pending Drafts", value: stats.pendingDrafts, icon: MessageSquare, color: "text-blue-400" },
                { label: "Need Action", value: stats.pendingActions, icon: AlertCircle, color: "text-orange-400" },
                { label: "Engaged", value: stats.weeklyEngagement, icon: Zap, color: "text-green-400" },
              ].map((s) => (
                <div key={s.label} className="glass-card p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <s.icon className={`w-4 h-4 ${s.color}`} />
                    <span className="text-xs text-gray-400">{s.label}</span>
                  </div>
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 border-b border-gray-700/50 overflow-x-auto">
              {[
                { id: "pipeline" as TabType, label: "Lead Pipeline", icon: Target },
                { id: "drafts" as TabType, label: "Message Drafts", icon: MessageSquare },
                { id: "actions" as TabType, label: "Action Queue", icon: Zap },
                { id: "content" as TabType, label: "Content Ideas", icon: PenTool },
                { id: "research" as TabType, label: "Research Lab", icon: Search },
              ].map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition
                    ${tab === t.id ? "tab-active" : "text-gray-400 hover:text-gray-200"}`}>
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
            </div>

            {/* TAB: Pipeline */}
            {tab === "pipeline" && (
              <div className="flex gap-6">
                {/* Lead List */}
                <div className={`${selectedLead ? "w-1/2" : "w-full"} transition-all`}>
                  {/* Filters */}
                  <div className="flex items-center gap-3 mb-4">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <select value={filterTier} onChange={(e) => setFilterTier(e.target.value)}
                      className="bg-[#1a2332] border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300">
                      <option value="all">All Tiers</option>
                      <option value="hot">Hot</option>
                      <option value="warm">Warm</option>
                      <option value="cold">Cold</option>
                    </select>
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                      className="bg-[#1a2332] border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300">
                      <option value="all">All Status</option>
                      <option value="new">New</option>
                      <option value="researched">Researched</option>
                      <option value="engaged">Engaged</option>
                      <option value="opportunity">Opportunity</option>
                      <option value="nurture">Nurture</option>
                    </select>
                    <span className="text-xs text-gray-500 ml-auto">{filteredLeads.length} leads</span>
                  </div>

                  <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto pr-2">
                    {filteredLeads.map((lead) => (
                      <div key={lead.id} onClick={() => setSelectedLead(lead)}
                        className={`glass-card glass-card-hover p-4 cursor-pointer transition slide-in
                          ${selectedLead?.id === lead.id ? "border-[#d4a843]/50" : ""}
                          ${lead.icpScore?.tier === "hot" ? "priority-high" : lead.icpScore?.tier === "warm" ? "priority-medium" : "priority-low"}`}>
                        <div className="flex items-center gap-3">
                          <ScoreRing score={lead.icpScore?.overall || 0} size={44} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-white truncate">{lead.firstName} {lead.lastName}</h3>
                              <span className={`badge badge-${lead.icpScore?.tier}`}>{lead.icpScore?.tier?.toUpperCase()}</span>
                            </div>
                            <p className="text-sm text-gray-400 truncate">{lead.position}</p>
                            <p className="text-xs text-gray-500 truncate">{lead.company}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {lead.draftMessages.length > 0 && (
                              <span className="text-xs text-blue-400 flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" /> {lead.draftMessages.length}
                              </span>
                            )}
                            <ChevronRight className="w-4 h-4 text-gray-600" />
                          </div>
                        </div>
                        {lead.icpScore?.signals && lead.icpScore.signals.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {lead.icpScore.signals.slice(0, 3).map((s, i) => (
                              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-[#d4a843]/10 text-[#d4a843]">{s}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Lead Detail */}
                {selectedLead && (
                  <div className="w-1/2 glass-card p-6 max-h-[calc(100vh-320px)] overflow-y-auto slide-in">
                    <div className="flex items-start justify-between mb-6">
                      <div>
                        <h2 className="text-xl font-bold text-white">{selectedLead.firstName} {selectedLead.lastName}</h2>
                        <p className="text-gray-400">{selectedLead.position}</p>
                        <p className="text-sm text-[#d4a843]">{selectedLead.company}</p>
                      </div>
                      <button onClick={() => setSelectedLead(null)} className="text-gray-500 hover:text-white">
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Score Breakdown */}
                    <div className="grid grid-cols-4 gap-3 mb-6">
                      {[
                        { label: "Overall", score: selectedLead.icpScore?.overall || 0 },
                        { label: "Company", score: selectedLead.icpScore?.companyFit || 0 },
                        { label: "Role", score: selectedLead.icpScore?.roleFit || 0 },
                        { label: "Industry", score: selectedLead.icpScore?.industryFit || 0 },
                      ].map((s) => (
                        <div key={s.label} className="text-center">
                          <ScoreRing score={s.score} size={56} />
                          <p className="text-xs text-gray-400 mt-1">{s.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Status */}
                    <div className="mb-6">
                      <label className="text-xs text-gray-400 mb-1 block">Pipeline Stage</label>
                      <div className="flex gap-2">
                        {(["new", "researched", "engaged", "opportunity", "nurture"] as const).map((s) => (
                          <button key={s} onClick={() => updateLeadStatus(selectedLead.id, s)}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition
                              ${selectedLead.status === s
                                ? "bg-[#d4a843] text-[#1a2332]"
                                : "bg-gray-700/50 text-gray-400 hover:bg-gray-700"}`}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Signals */}
                    {selectedLead.icpScore?.signals && (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-1">
                          <Sparkles className="w-4 h-4 text-[#d4a843]" /> ICP Signals
                        </h4>
                        <div className="space-y-1">
                          {selectedLead.icpScore.signals.map((s, i) => (
                            <div key={i} className="text-sm text-gray-400 flex items-start gap-2">
                              <CheckCircle className="w-3 h-3 text-green-400 mt-1 flex-shrink-0" />
                              {s}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Company Intel */}
                    {selectedLead.companyIntel && (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-1">
                          <BarChart3 className="w-4 h-4 text-[#d4a843]" /> Company Intelligence
                        </h4>
                        <div className="bg-[#0f1419]/60 rounded-lg p-3 space-y-2 text-sm">
                          <div><span className="text-gray-500">Industry:</span> <span className="text-gray-300">{selectedLead.companyIntel.industry}</span></div>
                          <div><span className="text-gray-500">Est. Revenue:</span> <span className="text-gray-300">{selectedLead.companyIntel.estimatedRevenue}</span></div>
                          <div><span className="text-gray-500">Employees:</span> <span className="text-gray-300">{selectedLead.companyIntel.employeeCount}</span></div>
                          {selectedLead.companyIntel.nautaFitReason && (
                            <div className="pt-2 border-t border-gray-700/50">
                              <span className="text-[#d4a843] text-xs font-medium">Nauta Fit:</span>
                              <p className="text-gray-300 mt-1">{selectedLead.companyIntel.nautaFitReason}</p>
                            </div>
                          )}
                          {selectedLead.companyIntel.painPoints?.length > 0 && (
                            <div className="pt-2 border-t border-gray-700/50">
                              <span className="text-xs text-gray-500">Likely Pain Points:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {selectedLead.companyIntel.painPoints.map((p, i) => (
                                  <span key={i} className="text-[10px] px-2 py-0.5 bg-red-400/10 text-red-300 rounded-full">{p}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Draft Messages */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-1">
                          <MessageSquare className="w-4 h-4 text-[#d4a843]" /> Draft Messages
                        </h4>
                        <div className="flex gap-1">
                          {["connection_followup", "warm_intro", "value_share"].map((type) => (
                            <button key={type} onClick={() => generateMessage(selectedLead, type)}
                              className="text-[10px] px-2 py-1 bg-[#d4a843]/10 text-[#d4a843] rounded hover:bg-[#d4a843]/20 transition">
                              + {type.replace("_", " ")}
                            </button>
                          ))}
                        </div>
                      </div>
                      {selectedLead.draftMessages.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">No drafts yet. Generate one above.</p>
                      ) : (
                        <div className="space-y-3">
                          {selectedLead.draftMessages.map((d) => (
                            <div key={d.id} className="bg-[#0f1419]/60 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-[#d4a843] font-medium">{d.type?.replace(/_/g, " ").toUpperCase()}</span>
                                <span className={`badge ${d.status === "approved" ? "badge-connected" : d.status === "rejected" ? "badge-hot" : "badge-warm"}`}>
                                  {d.status}
                                </span>
                              </div>
                              <p className="text-sm text-gray-300 whitespace-pre-wrap mb-3">{d.body}</p>
                              <div className="flex items-center gap-2">
                                <button onClick={() => copyToClipboard(d.body)}
                                  className="flex items-center gap-1 text-xs px-2 py-1 bg-gray-700/50 text-gray-300 rounded hover:bg-gray-700 transition">
                                  <Copy className="w-3 h-3" /> Copy
                                </button>
                                {d.status === "draft" && (
                                  <>
                                    <button onClick={() => updateDraftStatus(selectedLead.id, d.id, "approved")}
                                      className="flex items-center gap-1 text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition">
                                      <CheckCircle className="w-3 h-3" /> Approve
                                    </button>
                                    <button onClick={() => updateDraftStatus(selectedLead.id, d.id, "rejected")}
                                      className="flex items-center gap-1 text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition">
                                      <XCircle className="w-3 h-3" /> Reject
                                    </button>
                                    <button onClick={() => generateMessage(selectedLead, d.type)}
                                      className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition">
                                      <RefreshCw className="w-3 h-3" /> Regenerate
                                    </button>
                                  </>
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

            {/* TAB: Drafts */}
            {tab === "drafts" && (
              <div className="space-y-3">
                <div className="flex gap-4 mb-4">
                  {["all", "draft", "approved", "rejected"].map((f) => (
                    <button key={f} className={`text-sm px-3 py-1 rounded-full transition
                      ${f === "all" ? "bg-[#d4a843] text-[#1a2332]" : "bg-gray-700/50 text-gray-400 hover:bg-gray-700"}`}>
                      {f === "all" ? `All (${allDrafts.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${allDrafts.filter(d => d.status === f).length})`}
                    </button>
                  ))}
                </div>
                {allDrafts.filter(d => d.status === "draft").length === 0 ? (
                  <div className="glass-card p-8 text-center">
                    <MessageSquare className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400">No pending drafts. Go to the Pipeline tab and generate messages for your leads.</p>
                  </div>
                ) : (
                  allDrafts.filter(d => d.status === "draft").map((d) => (
                    <div key={d.id} className="glass-card p-4 slide-in">
                      <div className="flex items-start gap-4">
                        <ScoreRing score={d.lead.icpScore?.overall || 0} size={40} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-white">{d.lead.firstName} {d.lead.lastName}</h3>
                            <span className="text-xs text-gray-500">at {d.lead.company}</span>
                            <span className={`badge badge-${d.lead.icpScore?.tier}`}>{d.lead.icpScore?.tier}</span>
                          </div>
                          <span className="text-xs text-[#d4a843] font-medium">{d.type?.replace(/_/g, " ").toUpperCase()}</span>
                          <p className="text-sm text-gray-300 mt-2 whitespace-pre-wrap">{d.body}</p>
                          <div className="flex items-center gap-2 mt-3">
                            <button onClick={() => copyToClipboard(d.body)}
                              className="flex items-center gap-1 text-xs px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg hover:bg-gray-700 transition">
                              <Copy className="w-3 h-3" /> Copy to Clipboard
                            </button>
                            <button onClick={() => updateDraftStatus(d.lead.id, d.id, "approved")}
                              className="flex items-center gap-1 text-xs px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition">
                              <CheckCircle className="w-3 h-3" /> Approve
                            </button>
                            <button onClick={() => updateDraftStatus(d.lead.id, d.id, "rejected")}
                              className="flex items-center gap-1 text-xs px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition">
                              <XCircle className="w-3 h-3" /> Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB: Actions */}
            {tab === "actions" && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white mb-2">Priority Actions</h3>
                {/* Hot leads needing action */}
                {leads.filter(l => l.icpScore?.tier === "hot" && l.status === "new").length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm text-red-400 font-medium mb-2 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" /> Hot Leads - Immediate Action Required
                    </h4>
                    {leads.filter(l => l.icpScore?.tier === "hot" && l.status === "new").map((l) => (
                      <div key={l.id} className="glass-card p-4 mb-2 priority-high">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-semibold text-white">{l.firstName} {l.lastName}</h4>
                            <p className="text-sm text-gray-400">{l.position} at {l.company}</p>
                            <p className="text-xs text-gray-500 mt-1">Score: {l.icpScore?.overall}/100</p>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => { setSelectedLead(l); setTab("pipeline"); }}
                              className="text-xs px-3 py-1.5 bg-[#d4a843]/20 text-[#d4a843] rounded-lg hover:bg-[#d4a843]/30 transition flex items-center gap-1">
                              <Eye className="w-3 h-3" /> View
                            </button>
                            <button onClick={() => generateMessage(l, "connection_followup")}
                              className="text-xs px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition flex items-center gap-1">
                              <Send className="w-3 h-3" /> Draft Message
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Engagement suggestions */}
                <div>
                  <h4 className="text-sm text-yellow-400 font-medium mb-2 flex items-center gap-1">
                    <ThumbsUp className="w-4 h-4" /> Engagement Actions - Keep Warm
                  </h4>
                  {leads.filter(l => l.icpScore?.tier === "hot" || l.icpScore?.tier === "warm").slice(0, 10).map((l) => (
                    <div key={l.id} className="glass-card p-3 mb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <ScoreRing score={l.icpScore?.overall || 0} size={32} />
                          <div>
                            <p className="text-sm font-medium text-white">{l.firstName} {l.lastName}</p>
                            <p className="text-xs text-gray-500">{l.company}</p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button className="text-[10px] px-2 py-1 bg-blue-500/10 text-blue-400 rounded flex items-center gap-1">
                            <ThumbsUp className="w-3 h-3" /> Like Posts
                          </button>
                          <button className="text-[10px] px-2 py-1 bg-purple-500/10 text-purple-400 rounded flex items-center gap-1">
                            <MessageCircle className="w-3 h-3" /> Comment
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Follow-up reminders */}
                <div>
                  <h4 className="text-sm text-blue-400 font-medium mb-2 flex items-center gap-1">
                    <Clock className="w-4 h-4" /> Follow-up Reminders
                  </h4>
                  {leads.filter(l => l.draftMessages.some(d => d.status === "approved")).slice(0, 5).map((l) => (
                    <div key={l.id} className="glass-card p-3 mb-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-white">{l.firstName} {l.lastName}</p>
                          <p className="text-xs text-gray-500">Message approved - follow up in 3 days if no response</p>
                        </div>
                        <button onClick={() => generateMessage(l, "connection_followup")}
                          className="text-xs px-2 py-1 bg-[#d4a843]/10 text-[#d4a843] rounded flex items-center gap-1">
                          <RefreshCw className="w-3 h-3" /> New Follow-up
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: Content */}
            {tab === "content" && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-white">LinkedIn Content Suggestions</h3>
                  <button onClick={loadContentSuggestions}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#d4a843] to-[#f0d078] text-[#1a2332] font-bold rounded-lg hover:opacity-90 transition">
                    <Sparkles className="w-4 h-4" /> Generate Ideas
                  </button>
                </div>
                {contentSuggestions.length === 0 ? (
                  <div className="glass-card p-8 text-center">
                    <PenTool className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400">Click &ldquo;Generate Ideas&rdquo; to get AI-powered LinkedIn post suggestions tailored to attract Nauta&apos;s ICP.</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {contentSuggestions.map((s) => (
                      <div key={s.id} className="glass-card glass-card-hover p-5 slide-in">
                        <span className="text-xs text-[#d4a843] font-medium">{s.targetPersona}</span>
                        <h4 className="font-semibold text-white mt-1 mb-2">{s.topic}</h4>
                        <p className="text-sm text-yellow-300 font-medium mb-2">&ldquo;{s.hook}&rdquo;</p>
                        <p className="text-sm text-gray-400 mb-3 line-clamp-4">{s.body}</p>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {s.hashtags?.map((h, i) => (
                            <span key={i} className="text-[10px] text-blue-400">#{h}</span>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => copyToClipboard(`${s.hook}\n\n${s.body}\n\n${s.hashtags?.map(h => `#${h}`).join(" ")}`)}
                            className="flex items-center gap-1 text-xs px-3 py-1.5 bg-[#d4a843]/20 text-[#d4a843] rounded-lg hover:bg-[#d4a843]/30 transition">
                            <Copy className="w-3 h-3" /> Copy Post
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB: Research */}
            {tab === "research" && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Research Lab</h3>
                <div className="glass-card p-6 mb-6">
                  <div className="flex gap-3 mb-4">
                    <select value={researchType} onChange={(e) => setResearchType(e.target.value)}
                      className="bg-[#1a2332] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300">
                      <option value="company_research">Company Research</option>
                      <option value="industry_trends">Industry Trends</option>
                      <option value="general">General Query</option>
                    </select>
                    <input type="text" value={researchQuery} onChange={(e) => setResearchQuery(e.target.value)}
                      placeholder={researchType === "company_research" ? "Enter company name..." : "Enter your research query..."}
                      className="flex-1 bg-[#0f1419] border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#d4a843]/50"
                      onKeyDown={(e) => e.key === "Enter" && runResearch()} />
                    <button onClick={runResearch} disabled={researchLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#d4a843] to-[#f0d078] text-[#1a2332] font-bold rounded-lg hover:opacity-90 transition disabled:opacity-50">
                      {researchLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      Research
                    </button>
                  </div>
                </div>

                {researchResult && (
                  <div className="glass-card p-6 slide-in">
                    <pre className="text-sm text-gray-300 whitespace-pre-wrap overflow-x-auto">
                      {JSON.stringify(researchResult, null, 2)}
                    </pre>
                    <button onClick={() => copyToClipboard(JSON.stringify(researchResult, null, 2))}
                      className="mt-3 flex items-center gap-1 text-xs px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg hover:bg-gray-700 transition">
                      <Copy className="w-3 h-3" /> Copy Results
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
