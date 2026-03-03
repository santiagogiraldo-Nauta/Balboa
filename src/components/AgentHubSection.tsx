"use client";

/**
 * AgentHubSection — Agent Hub sidebar section
 *
 * Lets users:
 * - Browse registered agents (own + shared + built-in)
 * - Create new agents
 * - Edit their own agents
 * - Run agents manually against a selected lead
 * - View execution history
 *
 * Follows the same styling patterns as existing sections
 * (EventCommandCenter, DeepResearchPanel, etc.)
 */

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Play, Edit3, Trash2, Search, ChevronDown, ChevronRight,
  Zap, Bot, User, Clock, CheckCircle2, AlertCircle, Loader2,
  Save, X, Eye, Settings,
} from "lucide-react";
import { trackEventClient } from "@/lib/tracking";
import type { Lead, SupportedLanguage } from "@/lib/types";
import type { AgentDefinition, AgentCategory } from "@/lib/types-agents";

interface AgentHubSectionProps {
  leads: Lead[];
  selectedLead: Lead | null;
  language: SupportedLanguage;
}

const CATEGORY_LABELS: Record<AgentCategory, string> = {
  research: "Research",
  outreach: "Outreach",
  analysis: "Analysis",
  enablement: "Enablement",
  strategy: "Strategy",
  custom: "Custom",
};

const CATEGORY_COLORS: Record<AgentCategory, string> = {
  research: "#228be6",
  outreach: "#2b8a3e",
  analysis: "#7048e8",
  enablement: "#e67700",
  strategy: "#d6336c",
  custom: "#868e96",
};

export default function AgentHubSection({
  leads,
  selectedLead,
  language,
}: AgentHubSectionProps) {
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentDefinition | null>(null);
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{ agentId: string; result: unknown; durationMs: number; tokensUsed: number } | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  // Fetch agents on mount
  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agents/list");
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
      }
    } catch (err) {
      console.error("Failed to fetch agents:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAgents();
    trackEventClient({
      eventCategory: "agent",
      eventAction: "agent_hub_opened",
    });
  }, [fetchAgents]);

  // Filter agents
  const filteredAgents = agents.filter((a) => {
    const matchesSearch =
      !searchQuery ||
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.authorName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      filterCategory === "all" || a.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Run agent
  const handleRunAgent = async (agent: AgentDefinition) => {
    if (!selectedLead) {
      alert("Please select a lead first to run this agent.");
      return;
    }
    setRunningAgentId(agent.agentId);
    setRunResult(null);
    try {
      const res = await fetch("/api/agents/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.agentId,
          lead: selectedLead,
          language,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRunResult({
          agentId: agent.agentId,
          result: data.result,
          durationMs: data.durationMs,
          tokensUsed: data.tokensUsed,
        });
        setExpandedAgent(agent.agentId);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error("Agent run error:", err);
      alert("Failed to run agent");
    }
    setRunningAgentId(null);
  };

  // Delete agent
  const handleDeleteAgent = async (agentId: string) => {
    if (!confirm("Are you sure you want to delete this agent?")) return;
    try {
      const res = await fetch("/api/agents/register", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
      if (res.ok) {
        setAgents((prev) => prev.filter((a) => a.agentId !== agentId));
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Bot size={20} color="var(--balboa-navy)" />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--balboa-navy)", margin: 0 }}>
            Agent Hub
          </h2>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
            background: "#228be622", color: "#228be6", textTransform: "uppercase",
          }}>
            {agents.length} agents
          </span>
        </div>
        <button
          onClick={() => { setShowCreateForm(true); setEditingAgent(null); }}
          style={{
            display: "flex", alignItems: "center", gap: 4, padding: "6px 12px",
            background: "var(--balboa-navy)", color: "#fff", border: "none",
            borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          <Plus size={14} /> Create Agent
        </button>
      </div>

      {/* Search & Filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{
          flex: 1, display: "flex", alignItems: "center", gap: 6,
          background: "#f8f9fa", borderRadius: 6, padding: "6px 10px",
          border: "1px solid var(--balboa-border-light)",
        }}>
          <Search size={14} color="#868e96" />
          <input
            type="text"
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1, border: "none", background: "transparent",
              fontSize: 12, outline: "none", color: "var(--balboa-navy)",
            }}
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{
            padding: "6px 10px", borderRadius: 6, fontSize: 12,
            border: "1px solid var(--balboa-border-light)", background: "#f8f9fa",
            color: "var(--balboa-navy)", cursor: "pointer",
          }}
        >
          <option value="all">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Agent Create/Edit Form */}
      {showCreateForm && (
        <AgentForm
          agent={editingAgent}
          onSave={async (data) => {
            try {
              const res = await fetch("/api/agents/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
              });
              if (res.ok) {
                setShowCreateForm(false);
                setEditingAgent(null);
                fetchAgents();
              } else {
                const err = await res.json();
                alert(`Error: ${err.error}`);
              }
            } catch (err) {
              console.error("Save error:", err);
            }
          }}
          onCancel={() => { setShowCreateForm(false); setEditingAgent(null); }}
        />
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "#868e96" }}>
          <Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} />
          <p style={{ fontSize: 12, marginTop: 8 }}>Loading agents...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredAgents.length === 0 && (
        <div style={{
          textAlign: "center", padding: 40, color: "#868e96",
          background: "#f8f9fa", borderRadius: 8, border: "1px dashed var(--balboa-border-light)",
        }}>
          <Bot size={32} />
          <p style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>No agents found</p>
          <p style={{ fontSize: 11 }}>
            {searchQuery ? "Try a different search term." : "Create your first agent to get started."}
          </p>
        </div>
      )}

      {/* Agent list */}
      {!loading && filteredAgents.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredAgents.map((agent) => (
            <div
              key={agent.agentId}
              style={{
                background: "#fff",
                borderRadius: 8,
                border: `1px solid ${expandedAgent === agent.agentId ? "#228be6" : "var(--balboa-border-light)"}`,
                overflow: "hidden",
                transition: "border-color 0.2s",
              }}
            >
              {/* Agent card header */}
              <div
                onClick={() => setExpandedAgent(expandedAgent === agent.agentId ? null : agent.agentId)}
                style={{
                  padding: "10px 12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                {expandedAgent === agent.agentId ? <ChevronDown size={14} color="#868e96" /> : <ChevronRight size={14} color="#868e96" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-navy)" }}>
                      {agent.name}
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 8,
                      background: `${CATEGORY_COLORS[agent.category as AgentCategory] || "#868e96"}18`,
                      color: CATEGORY_COLORS[agent.category as AgentCategory] || "#868e96",
                      textTransform: "uppercase",
                    }}>
                      {agent.category}
                    </span>
                    {agent.isBuiltin && (
                      <span style={{
                        fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 8,
                        background: "#f59f0018", color: "#e67700", textTransform: "uppercase",
                      }}>
                        built-in
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "#868e96", display: "flex", alignItems: "center", gap: 8 }}>
                    <span><User size={10} style={{ display: "inline", verticalAlign: "middle" }} /> {agent.authorName}</span>
                    <span>v{agent.version}</span>
                    {agent.replaces && <span style={{ color: "#228be6" }}>Replaces: {agent.replaces}</span>}
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleRunAgent(agent)}
                    disabled={runningAgentId === agent.agentId || !selectedLead}
                    title={selectedLead ? "Run agent on selected lead" : "Select a lead first"}
                    style={{
                      display: "flex", alignItems: "center", gap: 3, padding: "4px 8px",
                      background: runningAgentId === agent.agentId ? "#228be622" : "#2b8a3e",
                      color: runningAgentId === agent.agentId ? "#228be6" : "#fff",
                      border: "none", borderRadius: 4, fontSize: 10, fontWeight: 600,
                      cursor: runningAgentId === agent.agentId || !selectedLead ? "not-allowed" : "pointer",
                      opacity: !selectedLead ? 0.5 : 1,
                    }}
                  >
                    {runningAgentId === agent.agentId ? (
                      <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                    ) : (
                      <Play size={12} />
                    )}
                    Run
                  </button>
                  {agent.userRole === "owner" || agent.userRole === "editor" ? (
                    <button
                      onClick={() => { setEditingAgent(agent); setShowCreateForm(true); }}
                      style={{
                        display: "flex", alignItems: "center", padding: "4px 6px",
                        background: "#f8f9fa", color: "#868e96", border: "1px solid var(--balboa-border-light)",
                        borderRadius: 4, cursor: "pointer",
                      }}
                    >
                      <Edit3 size={12} />
                    </button>
                  ) : null}
                  {agent.userRole === "owner" && !agent.isBuiltin ? (
                    <button
                      onClick={() => handleDeleteAgent(agent.agentId)}
                      style={{
                        display: "flex", alignItems: "center", padding: "4px 6px",
                        background: "#f8f9fa", color: "#e03131", border: "1px solid var(--balboa-border-light)",
                        borderRadius: 4, cursor: "pointer",
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Expanded view */}
              {expandedAgent === agent.agentId && (
                <div style={{ padding: "0 12px 12px", borderTop: "1px solid var(--balboa-border-light)" }}>
                  {agent.description && (
                    <p style={{ fontSize: 11, color: "#495057", margin: "8px 0", lineHeight: 1.5 }}>
                      {agent.description}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#868e96", marginTop: 6 }}>
                    <span>Input: {agent.inputType}</span>
                    <span>Output: {agent.outputFormat}</span>
                    <span>Tokens: {agent.maxTokens || 2000}</span>
                    {agent.tags?.length > 0 && <span>Tags: {agent.tags.join(", ")}</span>}
                  </div>

                  {/* Run result */}
                  {runResult && runResult.agentId === agent.agentId && (
                    <div style={{
                      marginTop: 10, padding: 10, background: "#f8f9fa",
                      borderRadius: 6, border: "1px solid var(--balboa-border-light)",
                    }}>
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        marginBottom: 6,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#2b8a3e" }}>
                          <CheckCircle2 size={12} /> Execution Complete
                        </div>
                        <div style={{ fontSize: 10, color: "#868e96", display: "flex", gap: 8 }}>
                          <span><Clock size={10} style={{ display: "inline", verticalAlign: "middle" }} /> {(runResult.durationMs / 1000).toFixed(1)}s</span>
                          <span><Zap size={10} style={{ display: "inline", verticalAlign: "middle" }} /> {runResult.tokensUsed} tokens</span>
                        </div>
                      </div>
                      <pre style={{
                        fontSize: 10, color: "#495057", background: "#fff",
                        padding: 8, borderRadius: 4, border: "1px solid var(--balboa-border-light)",
                        overflow: "auto", maxHeight: 200, whiteSpace: "pre-wrap",
                        fontFamily: "monospace",
                      }}>
                        {typeof runResult.result === "string"
                          ? runResult.result
                          : JSON.stringify(runResult.result, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Selected lead indicator */}
      {selectedLead && (
        <div style={{
          marginTop: 12, padding: "6px 10px", background: "#228be610",
          borderRadius: 6, fontSize: 11, color: "#228be6", display: "flex",
          alignItems: "center", gap: 4,
        }}>
          <User size={12} />
          Running agents on: <strong>{selectedLead.firstName} {selectedLead.lastName}</strong> at {selectedLead.company}
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ─── Agent Create/Edit Form ──────────────────────────────────────

interface AgentFormProps {
  agent: AgentDefinition | null;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}

function AgentForm({ agent, onSave, onCancel }: AgentFormProps) {
  const [name, setName] = useState(agent?.name || "");
  const [description, setDescription] = useState(agent?.description || "");
  const [category, setCategory] = useState(agent?.category || "custom");
  const [inputType, setInputType] = useState<string>(agent?.inputType || "lead");
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt || "");
  const [outputFormat, setOutputFormat] = useState<string>(agent?.outputFormat || "json");
  const [maxTokens, setMaxTokens] = useState(agent?.maxTokens || 2000);
  const [injectBalboaContext, setInjectBalboaContext] = useState(agent?.injectBalboaContext ?? true);
  const [supportsLanguage, setSupportsLanguage] = useState(agent?.supportsLanguage ?? true);
  const [tags, setTags] = useState(agent?.tags?.join(", ") || "");
  const [replaces, setReplaces] = useState(agent?.replaces || "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !systemPrompt.trim()) {
      alert("Name and System Prompt are required.");
      return;
    }
    setSaving(true);
    await onSave({
      agentId: agent?.agentId,
      name: name.trim(),
      description: description.trim(),
      category,
      inputType,
      systemPrompt: systemPrompt.trim(),
      outputFormat,
      maxTokens,
      injectBalboaContext,
      supportsLanguage,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      replaces: replaces.trim() || undefined,
    });
    setSaving(false);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "6px 10px", borderRadius: 4,
    border: "1px solid var(--balboa-border-light)", fontSize: 12,
    color: "var(--balboa-navy)", background: "#fff",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: "#495057", marginBottom: 4, display: "block",
  };

  return (
    <div style={{
      background: "#f8f9fa", borderRadius: 8, padding: 16, marginBottom: 12,
      border: "1px solid var(--balboa-border-light)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--balboa-navy)", margin: 0 }}>
          {agent ? "Edit Agent" : "Create New Agent"}
        </h3>
        <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "#868e96" }}>
          <X size={16} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Competitor Intel Agent" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as AgentCategory)} style={inputStyle}>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Description</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description of what this agent does" style={inputStyle} />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>System Prompt * <span style={{ fontWeight: 400, color: "#868e96" }}>Use {"{{LEAD_DATA}}"}, {"{{BALBOA_CONTEXT}}"}, {"{{LANGUAGE_MODIFIER}}"}, {"{{CUSTOM_CONTEXT}}"}</span></label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="You are a competitive intelligence analyst..."
          rows={8}
          style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 11 }}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>Input Type</label>
          <select value={inputType} onChange={(e) => setInputType(e.target.value)} style={inputStyle}>
            <option value="lead">Lead</option>
            <option value="deal">Deal</option>
            <option value="lead+deal">Lead + Deal</option>
            <option value="freeform">Freeform</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Output Format</label>
          <select value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)} style={inputStyle}>
            <option value="json">JSON</option>
            <option value="text">Text</option>
            <option value="markdown">Markdown</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Max Tokens</label>
          <input type="number" value={maxTokens} onChange={(e) => setMaxTokens(parseInt(e.target.value) || 2000)} style={inputStyle} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>Tags (comma-separated)</label>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="research, competition" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Replaces Route (optional)</label>
          <input value={replaces} onChange={(e) => setReplaces(e.target.value)} placeholder="/api/generate-call-script" style={inputStyle} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4, color: "#495057" }}>
          <input type="checkbox" checked={injectBalboaContext} onChange={(e) => setInjectBalboaContext(e.target.checked)} />
          Inject Balboa context
        </label>
        <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4, color: "#495057" }}>
          <input type="checkbox" checked={supportsLanguage} onChange={(e) => setSupportsLanguage(e.target.checked)} />
          Multi-language support
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{
          padding: "6px 14px", background: "#f8f9fa", color: "#495057",
          border: "1px solid var(--balboa-border-light)", borderRadius: 6,
          fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>
          Cancel
        </button>
        <button onClick={handleSubmit} disabled={saving} style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "6px 14px", background: "var(--balboa-navy)", color: "#fff",
          border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600,
          cursor: saving ? "not-allowed" : "pointer",
        }}>
          {saving ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={12} />}
          {agent ? "Update Agent" : "Create Agent"}
        </button>
      </div>
    </div>
  );
}
