"use client";

import { useState, useMemo } from "react";
import {
  Target, ChevronRight, DollarSign, Clock, TrendingUp,
  AlertCircle, CheckCircle, XCircle, User, Building,
  Calendar, ArrowRight, Sparkles, Filter, Mail, Phone,
  Linkedin, Video, Users, BarChart3, ChevronDown,
} from "lucide-react";
import type { Lead } from "@/lib/types";
import type { PipelineDeal } from "@/lib/mock-phase2";
import { PIPELINE_CONFIG } from "@/lib/mock-phase2";
import { trackEventClient } from "@/lib/tracking";

const HEALTH_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  hot: { label: "Hot", color: "#dc2626", bg: "#fef2f2", dot: "#ef4444" },
  warm: { label: "Warm", color: "#d97706", bg: "#fffbeb", dot: "#f59e0b" },
  cold: { label: "Cold", color: "#2563eb", bg: "#eff6ff", dot: "#3b82f6" },
  stalled: { label: "Stalled", color: "#6b7280", bg: "#f3f4f6", dot: "#9ca3af" },
};

const ACTIVITY_ICONS: Record<string, { icon: typeof Mail; color: string }> = {
  email: { icon: Mail, color: "#3b82f6" },
  call: { icon: Phone, color: "#059669" },
  meeting: { icon: Video, color: "#7c3aed" },
  task: { icon: CheckCircle, color: "#d97706" },
  linkedin: { icon: Linkedin, color: "#0077b5" },
};

const formatCurrency = (amount: number) => {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
};

type PresetView = "open" | "stalled" | "recent" | "no_activity" | "all" | "won" | "lost" | "my_deals";

export default function DealPipeline({
  deals,
  leads,
  onNavigateToLead,
}: {
  deals: PipelineDeal[];
  leads?: Lead[];
  onNavigateToLead?: (leadId: string) => void;
}) {
  const [selectedDeal, setSelectedDeal] = useState<PipelineDeal | null>(null);
  const [activePipeline, setActivePipeline] = useState<"sales" | "busdev" | "all">("sales");
  const [presetView, setPresetView] = useState<PresetView>("open");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [showSidebar, setShowSidebar] = useState(true);

  // Get unique owners
  const owners = useMemo(() => {
    const ownerSet = new Set(deals.map(d => d.deal_owner));
    return Array.from(ownerSet).sort();
  }, [deals]);

  // Filter deals by pipeline + preset view + owner
  const filteredDeals = useMemo(() => {
    let filtered = deals;

    // Pipeline filter
    if (activePipeline !== "all") {
      filtered = filtered.filter(d => d.pipeline === activePipeline);
    }

    // Owner filter
    if (ownerFilter !== "all") {
      filtered = filtered.filter(d => d.deal_owner === ownerFilter);
    }

    // Preset view filter
    switch (presetView) {
      case "open":
        filtered = filtered.filter(d => !d.deal_stage.includes("closed") && d.deal_stage !== "disqualified");
        break;
      case "stalled":
        filtered = filtered.filter(d => d.deal_health === "stalled" || (d.last_activity_days && d.last_activity_days > 14));
        break;
      case "recent":
        filtered = filtered.filter(d => d.last_activity_days != null && d.last_activity_days <= 3);
        break;
      case "no_activity":
        filtered = filtered.filter(d => d.last_activity_days != null && d.last_activity_days > 7 && !d.deal_stage.includes("closed"));
        break;
      case "won":
        filtered = filtered.filter(d => d.deal_stage === "closed_won");
        break;
      case "lost":
        filtered = filtered.filter(d => d.deal_stage === "closed_lost" || d.deal_stage === "disqualified");
        break;
      case "my_deals":
        filtered = filtered.filter(d => d.deal_owner === "Santiago Giraldo");
        break;
      default:
        break;
    }

    return filtered;
  }, [deals, activePipeline, presetView, ownerFilter]);

  // Get stages for current pipeline view
  const currentStages = useMemo(() => {
    if (activePipeline === "all") {
      // Merged view: show a universal set of stages
      return [
        { id: "lead", label: "Lead / Discovery", probability: 10, color: "#6366f1", bg: "#eef2ff" },
        { id: "meeting", label: "Meeting / Scope", probability: 25, color: "#3b5bdb", bg: "#eff6ff" },
        { id: "proposal", label: "Proposal / Qualified", probability: 50, color: "#d97706", bg: "#fffbeb" },
        { id: "closing", label: "Go / Contracting", probability: 80, color: "#059669", bg: "#ecfdf5" },
        { id: "closed_won", label: "Closed Won", probability: 100, color: "#16a34a", bg: "#f0fdf4" },
        { id: "closed_lost", label: "Closed Lost", probability: 0, color: "#dc2626", bg: "#fef2f2" },
      ];
    }
    const config = PIPELINE_CONFIG[activePipeline];
    return config.stages;
  }, [activePipeline]);

  // Active (non-closed) stages for kanban
  const activeStages = currentStages.filter(s => !s.id.includes("closed") && s.id !== "disqualified");

  // Map deals to stages (for "all" view, map to universal stages)
  const getDealStageForView = (deal: PipelineDeal): string => {
    if (activePipeline !== "all") return deal.deal_stage;
    // Map to universal stages
    const stage = deal.deal_stage;
    if (["lead", "discovery"].includes(stage)) return "lead";
    if (["meeting_scheduled", "meeting_held", "scope"].includes(stage)) return "meeting";
    if (["qualified", "proposal_review"].includes(stage)) return "proposal";
    if (["go", "contracting"].includes(stage)) return "closing";
    if (stage === "closed_won") return "closed_won";
    return "closed_lost";
  };

  // Compute pipeline-level metrics
  const totalValue = filteredDeals.reduce((s, d) => s + (d.amount || 0), 0);
  const weightedValue = filteredDeals.reduce((s, d) => s + ((d.amount || 0) * (d.probability || 0) / 100), 0);
  const openDeals = filteredDeals.filter(d => !d.deal_stage.includes("closed") && d.deal_stage !== "disqualified");
  const wonDeals = filteredDeals.filter(d => d.deal_stage === "closed_won");
  const lostDeals = filteredDeals.filter(d => d.deal_stage === "closed_lost" || d.deal_stage === "disqualified");

  // Sidebar preset view counts (computed from full deals for selected pipeline)
  const pipelineDeals = activePipeline === "all" ? deals : deals.filter(d => d.pipeline === activePipeline);
  const presetCounts = {
    open: pipelineDeals.filter(d => !d.deal_stage.includes("closed") && d.deal_stage !== "disqualified").length,
    stalled: pipelineDeals.filter(d => d.deal_health === "stalled" || (d.last_activity_days && d.last_activity_days > 14)).length,
    recent: pipelineDeals.filter(d => d.last_activity_days != null && d.last_activity_days <= 3).length,
    no_activity: pipelineDeals.filter(d => d.last_activity_days != null && d.last_activity_days > 7 && !d.deal_stage.includes("closed")).length,
    all: pipelineDeals.length,
    won: pipelineDeals.filter(d => d.deal_stage === "closed_won").length,
    lost: pipelineDeals.filter(d => d.deal_stage === "closed_lost" || d.deal_stage === "disqualified").length,
    my_deals: pipelineDeals.filter(d => d.deal_owner === "Santiago Giraldo").length,
  };

  const presetTotalValue = (view: PresetView) => {
    const vDeals = view === "all" ? pipelineDeals :
      view === "open" ? pipelineDeals.filter(d => !d.deal_stage.includes("closed") && d.deal_stage !== "disqualified") :
      view === "won" ? pipelineDeals.filter(d => d.deal_stage === "closed_won") :
      view === "lost" ? pipelineDeals.filter(d => d.deal_stage === "closed_lost" || d.deal_stage === "disqualified") :
      view === "my_deals" ? pipelineDeals.filter(d => d.deal_owner === "Santiago Giraldo") : [];
    return vDeals.reduce((s, d) => s + (d.amount || 0), 0);
  };

  return (
    <div style={{ display: "flex", gap: 0 }}>
      {/* Left Sidebar — Preset Views */}
      {showSidebar && (
        <div style={{
          width: 200, flexShrink: 0, paddingRight: 16,
          borderRight: "1px solid var(--balboa-border-light)",
          marginRight: 16,
        }}>
          {/* Pipeline Selector */}
          <div style={{ marginBottom: 16 }}>
            <select
              value={activePipeline}
              onChange={(e) => { const v = e.target.value as "sales" | "busdev" | "all"; setActivePipeline(v); setPresetView("open"); setSelectedDeal(null); trackEventClient({ eventCategory: "navigation", eventAction: "filter_changed", metadata: { pipeline: v, preset: "open" } }); }}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: "1px solid var(--balboa-border)", background: "white",
                color: "var(--balboa-navy)", cursor: "pointer",
              }}
            >
              <option value="sales">Sales Pipeline</option>
              <option value="busdev">Bus Dev Pipeline</option>
              <option value="all">All Pipelines</option>
            </select>
          </div>

          {/* Preset Views */}
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
            Views
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {([
              { key: "open" as PresetView, label: "Open Deals", showValue: true },
              { key: "stalled" as PresetView, label: "Stalled Deals", showValue: false },
              { key: "recent" as PresetView, label: "Recent Activity", showValue: false },
              { key: "no_activity" as PresetView, label: "No Activity", showValue: false },
              { key: "all" as PresetView, label: "All Deals", showValue: true },
              { key: "won" as PresetView, label: "Closed Won", showValue: true },
              { key: "lost" as PresetView, label: "Closed Lost", showValue: true },
            ]).map(v => (
              <button key={v.key}
                onClick={() => { setPresetView(v.key); setSelectedDeal(null); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "7px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                  background: presetView === v.key ? "var(--balboa-navy)" : "transparent",
                  color: presetView === v.key ? "white" : "var(--balboa-text-secondary)",
                  border: "none", cursor: "pointer", textAlign: "left",
                  transition: "all 0.15s ease", width: "100%",
                }}>
                <span>{v.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.8 }}>{presetCounts[v.key]}</span>
              </button>
            ))}
          </div>

          {/* My Deals shortcut */}
          <div style={{ borderTop: "1px solid var(--balboa-border-light)", marginTop: 12, paddingTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
              Saved Views
            </div>
            <button
              onClick={() => { setPresetView("my_deals"); setSelectedDeal(null); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "7px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                background: presetView === "my_deals" ? "var(--balboa-navy)" : "transparent",
                color: presetView === "my_deals" ? "white" : "var(--balboa-text-secondary)",
                border: "none", cursor: "pointer", textAlign: "left", width: "100%",
              }}>
              <span>My Deals</span>
              <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.8 }}>{presetCounts.my_deals}</span>
            </button>
          </div>

          {/* Owner Filter */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
              Owner
            </div>
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              style={{
                width: "100%", padding: "6px 8px", borderRadius: 6, fontSize: 11,
                border: "1px solid var(--balboa-border)", background: "white",
                color: "var(--balboa-text-secondary)", cursor: "pointer",
              }}
            >
              <option value="all">All Owners</option>
              {owners.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Top metrics bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 20, marginBottom: 16,
          padding: "12px 16px", borderRadius: 10,
          background: "var(--balboa-bg-alt)", border: "1px solid var(--balboa-border-light)",
        }}>
          <button onClick={() => setShowSidebar(!showSidebar)} className="btn-ghost" style={{ padding: 4 }}>
            <BarChart3 className="w-4 h-4" />
          </button>
          <div>
            <div style={{ fontSize: 10, color: "var(--balboa-text-muted)", fontWeight: 500 }}>Total Amount</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--balboa-navy)", letterSpacing: "-0.02em" }}>
              {formatCurrency(totalValue)}
            </div>
          </div>
          <div style={{ width: 1, height: 30, background: "var(--balboa-border-light)" }} />
          <div>
            <div style={{ fontSize: 10, color: "var(--balboa-text-muted)", fontWeight: 500 }}>Weighted</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--balboa-blue)", letterSpacing: "-0.02em" }}>
              {formatCurrency(weightedValue)}
            </div>
          </div>
          <div style={{ width: 1, height: 30, background: "var(--balboa-border-light)" }} />
          <div>
            <div style={{ fontSize: 10, color: "var(--balboa-text-muted)", fontWeight: 500 }}>Open</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--balboa-navy)" }}>{openDeals.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--balboa-text-muted)", fontWeight: 500 }}>Won</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#059669" }}>{wonDeals.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--balboa-text-muted)", fontWeight: 500 }}>Lost</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#dc2626" }}>{lostDeals.length}</div>
          </div>
          <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--balboa-text-muted)", fontWeight: 500 }}>
            {filteredDeals.length} deals
            {totalValue > 0 && ` · Avg ${formatCurrency(Math.round(totalValue / Math.max(openDeals.length, 1)))}`}
          </div>
        </div>

        {/* Kanban Board */}
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
          {activeStages.map(stage => {
            const stageDeals = filteredDeals.filter(d => getDealStageForView(d) === stage.id);
            const stageTotal = stageDeals.reduce((s, d) => s + (d.amount || 0), 0);
            const stageWeighted = stageDeals.reduce((s, d) => s + ((d.amount || 0) * (stage.probability) / 100), 0);

            return (
              <div key={stage.id} style={{
                minWidth: selectedDeal ? 160 : 200, flex: 1,
                transition: "min-width 0.3s ease",
              }}>
                {/* Column Header */}
                <div style={{
                  padding: "10px 12px", borderRadius: "10px 10px 0 0",
                  background: stage.bg, borderBottom: `2px solid ${stage.color}`,
                  marginBottom: 8,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: stage.color, letterSpacing: "-0.01em" }}>
                      {stage.label}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
                      background: stage.color, color: "white",
                    }}>
                      {stageDeals.length}
                    </span>
                  </div>
                </div>

                {/* Deal Cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 80 }}>
                  {stageDeals.map(deal => {
                    const health = HEALTH_CONFIG[deal.deal_health || "warm"];
                    const isSelected = selectedDeal?.id === deal.id;
                    const actInfo = deal.last_activity_type ? ACTIVITY_ICONS[deal.last_activity_type] : null;
                    const isInactive = deal.last_activity_days != null && deal.last_activity_days > 7;

                    return (
                      <div key={deal.id}
                        onClick={() => { setSelectedDeal(isSelected ? null : deal); if (!isSelected) trackEventClient({ eventCategory: "deal", eventAction: "deal_viewed", dealId: deal.id, numericValue: deal.amount || 0 }); }}
                        className="card card-hover fade-in"
                        style={{
                          padding: "10px 12px", cursor: "pointer",
                          borderColor: isSelected ? stage.color : undefined,
                          boxShadow: isSelected ? `0 0 0 2px ${stage.color}22` : undefined,
                        }}>
                        {/* Deal name + health dot */}
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
                          <h4 style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-navy)", lineHeight: 1.3 }}>
                            {deal.deal_name}
                          </h4>
                          <span title={health.label} style={{
                            width: 7, height: 7, borderRadius: "50%", background: health.dot, flexShrink: 0, marginTop: 3,
                          }} />
                        </div>

                        {/* Amount */}
                        {deal.amount != null && deal.amount > 0 && (
                          <div style={{ fontSize: 13, fontWeight: 700, color: stage.color, marginBottom: 3 }}>
                            {formatCurrency(deal.amount)}
                          </div>
                        )}

                        {/* Company + Owner */}
                        {deal.company_name && (
                          <p style={{ fontSize: 10, color: "var(--balboa-text-muted)", marginBottom: 2, display: "flex", alignItems: "center", gap: 3 }}>
                            <Building className="w-2.5 h-2.5" /> {deal.company_name}
                          </p>
                        )}
                        <p style={{ fontSize: 10, color: "var(--balboa-text-muted)", marginBottom: 4 }}>
                          {deal.deal_owner}
                        </p>

                        {/* Activity indicator + contacts */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, paddingTop: 4, borderTop: "1px solid var(--balboa-border-light)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            {actInfo && (() => {
                              const ActIcon = actInfo.icon;
                              return (
                                <span style={{
                                  display: "inline-flex", alignItems: "center", gap: 3,
                                  fontSize: 10, color: isInactive ? "#d97706" : "var(--balboa-text-muted)",
                                  fontWeight: isInactive ? 600 : 400,
                                }}>
                                  <ActIcon style={{ width: 10, height: 10, color: isInactive ? "#d97706" : actInfo.color }} />
                                  {deal.last_activity_days === 0 ? "Today" : `${deal.last_activity_days}d ago`}
                                </span>
                              );
                            })()}
                            {isInactive && (
                              <AlertCircle style={{ width: 10, height: 10, color: "#d97706" }} />
                            )}
                          </div>
                          {deal.contacts_count != null && deal.contacts_count > 0 && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10, color: "var(--balboa-text-light)" }}>
                              <Users style={{ width: 10, height: 10 }} /> {deal.contacts_count}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {stageDeals.length === 0 && (
                    <div style={{ padding: 16, textAlign: "center", fontSize: 11, color: "var(--balboa-text-light)", fontStyle: "italic" }}>
                      No deals
                    </div>
                  )}
                </div>

                {/* Column Footer — Total + Weighted */}
                <div style={{
                  marginTop: 8, padding: "8px 12px", borderRadius: "0 0 8px 8px",
                  background: "var(--balboa-bg-alt)", borderTop: "1px solid var(--balboa-border-light)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--balboa-text-muted)" }}>
                    <span>{formatCurrency(stageTotal)}</span>
                    <span>Total</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--balboa-text-muted)", marginTop: 2 }}>
                    <span style={{ fontWeight: 600 }}>{formatCurrency(stageWeighted)}</span>
                    <span>Weighted ({stage.probability}%)</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Deal Detail Panel */}
      {selectedDeal && (
        <div className="card fade-in" style={{
          width: 320, flexShrink: 0, padding: "20px 22px",
          maxHeight: "calc(100vh - 320px)", overflowY: "auto",
          marginLeft: 14,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                {selectedDeal.deal_name}
              </h3>
              {selectedDeal.company_name && (
                <p style={{ fontSize: 13, color: "var(--balboa-blue)", fontWeight: 500, marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
                  <Building className="w-3.5 h-3.5" /> {selectedDeal.company_name}
                </p>
              )}
              <p style={{ fontSize: 11, color: "var(--balboa-text-muted)", marginTop: 2 }}>
                {selectedDeal.deal_owner} · {activePipeline === "all" ? (selectedDeal.pipeline === "sales" ? "Sales" : "Bus Dev") : PIPELINE_CONFIG[selectedDeal.pipeline].label}
              </p>
            </div>
            <button onClick={() => setSelectedDeal(null)} className="btn-ghost" style={{ padding: 4 }}>
              <XCircle className="w-4 h-4" />
            </button>
          </div>

          {/* Health + Value row */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <div style={{
              flex: 1, padding: "10px 12px", borderRadius: 10,
              background: HEALTH_CONFIG[selectedDeal.deal_health || "warm"].bg,
              border: `1px solid ${HEALTH_CONFIG[selectedDeal.deal_health || "warm"].color}22`,
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", marginBottom: 3 }}>Health</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: HEALTH_CONFIG[selectedDeal.deal_health || "warm"].color, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: HEALTH_CONFIG[selectedDeal.deal_health || "warm"].dot }} />
                {HEALTH_CONFIG[selectedDeal.deal_health || "warm"].label}
              </div>
            </div>
            <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: "var(--balboa-bg-alt)", border: "1px solid var(--balboa-border-light)" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", marginBottom: 3 }}>Value</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--balboa-navy)", letterSpacing: "-0.02em" }}>
                {selectedDeal.amount ? formatCurrency(selectedDeal.amount) : "TBD"}
              </div>
            </div>
          </div>

          {/* Stage progress bar */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Stage</div>
            <div style={{ display: "flex", gap: 3 }}>
              {activeStages.map((stage, idx) => {
                const dealStage = getDealStageForView(selectedDeal);
                const currentIdx = activeStages.findIndex(s => s.id === dealStage);
                const isPast = idx < currentIdx;
                const isCurrent = idx === currentIdx;
                return (
                  <div key={stage.id} style={{
                    flex: 1, height: 5, borderRadius: 3,
                    background: isCurrent ? stage.color : isPast ? `${stage.color}60` : "var(--balboa-border-light)",
                    transition: "background 0.3s ease",
                  }} />
                );
              })}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 5, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: currentStages.find(s => s.id === getDealStageForView(selectedDeal))?.color || "var(--balboa-navy)" }}>
                {currentStages.find(s => s.id === getDealStageForView(selectedDeal))?.label || selectedDeal.deal_stage}
              </span>
              {selectedDeal.days_in_stage != null && (
                <span style={{ fontSize: 10, color: selectedDeal.days_in_stage > 14 ? "#d97706" : "var(--balboa-text-muted)" }}>
                  {selectedDeal.days_in_stage}d in stage
                </span>
              )}
            </div>
          </div>

          {/* Details grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16, padding: "12px 14px", background: "var(--balboa-bg-alt)", borderRadius: 10, border: "1px solid var(--balboa-border-light)" }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--balboa-text-muted)", fontWeight: 500 }}>Probability</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--balboa-navy)", marginTop: 2 }}>{selectedDeal.probability ?? 0}%</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--balboa-text-muted)", fontWeight: 500 }}>Close Date</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-navy)", marginTop: 2 }}>
                {selectedDeal.close_date ? new Date(selectedDeal.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Not set"}
              </div>
            </div>
            {selectedDeal.contact_name && (
              <div>
                <div style={{ fontSize: 10, color: "var(--balboa-text-muted)", fontWeight: 500 }}>Contact</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-navy)", marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
                  <User className="w-3 h-3" /> {selectedDeal.contact_name}
                </div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 10, color: "var(--balboa-text-muted)", fontWeight: 500 }}>Last Activity</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: (selectedDeal.last_activity_days || 0) > 7 ? "#d97706" : "var(--balboa-navy)", marginTop: 2 }}>
                {selectedDeal.last_activity_days === 0 ? "Today" : `${selectedDeal.last_activity_days}d ago`}
              </div>
            </div>
          </div>

          {/* Next step */}
          {selectedDeal.next_step && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 5, display: "flex", alignItems: "center", gap: 4 }}>
                <ArrowRight className="w-3 h-3" /> Next Step
              </div>
              <div style={{ padding: "10px 12px", borderRadius: 8, background: "#f0f4ff", border: "1px solid #dbe4ff", fontSize: 12, color: "var(--balboa-navy)", lineHeight: 1.5 }}>
                {selectedDeal.next_step}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {selectedDeal.lead_id && onNavigateToLead && (
              <button onClick={() => onNavigateToLead(selectedDeal.lead_id!)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10,
                  background: "linear-gradient(135deg, var(--balboa-navy), var(--balboa-blue))", color: "white",
                  border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                  boxShadow: "0 2px 8px rgba(30,42,94,0.25)", transition: "all 0.2s ease",
                }}>
                <User className="w-4 h-4" /> View Lead Profile
                <ChevronRight className="w-4 h-4" style={{ marginLeft: "auto" }} />
              </button>
            )}
            <button onClick={() => {}}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10,
                background: "var(--balboa-bg-alt)", color: "var(--balboa-navy)",
                border: "1px solid var(--balboa-border)", cursor: "pointer", fontSize: 12, fontWeight: 600,
              }}>
              <Sparkles className="w-4 h-4" style={{ color: "var(--balboa-blue)" }} /> Get AI Strategy
              <ChevronRight className="w-4 h-4" style={{ marginLeft: "auto", color: "var(--balboa-text-light)" }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
