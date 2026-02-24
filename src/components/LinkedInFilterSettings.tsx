"use client";

import { useState, useEffect, useCallback } from "react";
import { LinkedInFilterRule } from "@/lib/types-linkedin";
import { Plus, Trash2, ToggleLeft, ToggleRight, Shield, AlertTriangle } from "lucide-react";
import { getClientConfig } from "@/lib/config-client";

interface LinkedInFilterSettingsProps {
  visible: boolean;
  onShowAuditLog: () => void;
}

export default function LinkedInFilterSettings({ visible, onShowAuditLog }: LinkedInFilterSettingsProps) {
  const [rules, setRules] = useState<LinkedInFilterRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRuleType, setNewRuleType] = useState<string>("keyword");
  const [newRuleValue, setNewRuleValue] = useState("");
  const [newRuleClassification, setNewRuleClassification] = useState<string>("personal");
  const { isSandbox } = getClientConfig();

  const fetchRules = useCallback(async () => {
    if (isSandbox) return;
    setLoading(true);
    try {
      const resp = await fetch("/api/linkedin/filter-rules");
      if (resp.ok) {
        const data = await resp.json();
        setRules(data.rules || []);
      }
    } catch (err) {
      console.error("Failed to fetch rules:", err);
    }
    setLoading(false);
  }, [isSandbox]);

  useEffect(() => {
    if (visible) fetchRules();
  }, [visible, fetchRules]);

  const handleCreateRule = async () => {
    if (!newRuleValue.trim()) return;
    try {
      const resp = await fetch("/api/linkedin/filter-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruleType: newRuleType,
          ruleValue: newRuleValue.trim(),
          classification: newRuleClassification,
        }),
      });
      if (resp.ok) {
        setNewRuleValue("");
        setShowAddRule(false);
        fetchRules();
      }
    } catch (err) {
      console.error("Failed to create rule:", err);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      const resp = await fetch("/api/linkedin/filter-rules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId }),
      });
      if (resp.ok) fetchRules();
    } catch (err) {
      console.error("Failed to delete rule:", err);
    }
  };

  const handleToggleRule = async (ruleId: string, currentActive: boolean) => {
    try {
      const resp = await fetch("/api/linkedin/filter-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId, isActive: !currentActive }),
      });
      if (resp.ok) fetchRules();
    } catch (err) {
      console.error("Failed to toggle rule:", err);
    }
  };

  if (!visible) return null;

  if (isSandbox) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{
          background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)",
          borderRadius: 12, padding: 24, textAlign: "center",
        }}>
          <AlertTriangle style={{ width: 32, height: 32, color: "#f59e0b", margin: "0 auto 12px" }} />
          <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>Sandbox Mode</h3>
          <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>
            LinkedIn privacy filters are only active in production mode. In sandbox, all conversations are simulated.
          </p>
        </div>
      </div>
    );
  }

  const ruleTypeLabels: Record<string, string> = {
    keyword: "Keyword",
    participant: "Participant Name",
    relationship: "LinkedIn URL",
    pattern: "Regex Pattern",
  };

  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Shield style={{ width: 18, height: 18, color: "#3b82f6" }} />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Privacy Filter Rules</h3>
        </div>
        <button onClick={onShowAuditLog} style={{
          background: "none", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 6,
          padding: "4px 10px", fontSize: 11, color: "#94a3b8", cursor: "pointer",
        }}>
          Audit Log
        </button>
      </div>

      {/* Description */}
      <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16, lineHeight: 1.5 }}>
        Define rules to automatically classify LinkedIn conversations as personal or professional.
        Personal conversations are excluded from business workflows.
      </p>

      {/* Add Rule Button */}
      {!showAddRule ? (
        <button onClick={() => setShowAddRule(true)} style={{
          display: "flex", alignItems: "center", gap: 6, width: "100%",
          padding: "10px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: "rgba(59, 130, 246, 0.1)", color: "#3b82f6",
          border: "1px dashed rgba(59, 130, 246, 0.3)", cursor: "pointer",
          marginBottom: 16,
        }}>
          <Plus style={{ width: 14, height: 14 }} /> Add Classification Rule
        </button>
      ) : (
        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(148,163,184,0.15)",
          borderRadius: 10, padding: 14, marginBottom: 16,
        }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <select value={newRuleType} onChange={e => setNewRuleType(e.target.value)} style={{
              padding: "6px 10px", borderRadius: 6, fontSize: 11, background: "rgba(15,23,42,0.6)",
              border: "1px solid rgba(148,163,184,0.2)", color: "#e2e8f0", flex: "0 0 auto",
            }}>
              <option value="keyword">Keyword</option>
              <option value="participant">Participant</option>
              <option value="relationship">LinkedIn URL</option>
              <option value="pattern">Regex Pattern</option>
            </select>
            <select value={newRuleClassification} onChange={e => setNewRuleClassification(e.target.value)} style={{
              padding: "6px 10px", borderRadius: 6, fontSize: 11, background: "rgba(15,23,42,0.6)",
              border: "1px solid rgba(148,163,184,0.2)", color: "#e2e8f0", flex: "0 0 auto",
            }}>
              <option value="personal">→ Personal</option>
              <option value="professional">→ Professional</option>
            </select>
          </div>
          <input
            value={newRuleValue}
            onChange={e => setNewRuleValue(e.target.value)}
            placeholder={newRuleType === "keyword" ? 'e.g. "birthday party"' : 'e.g. "John Smith"'}
            style={{
              width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 12,
              background: "rgba(15,23,42,0.6)", border: "1px solid rgba(148,163,184,0.2)",
              color: "#e2e8f0", marginBottom: 10, boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleCreateRule} style={{
              flex: 1, padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
              background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6",
              border: "1px solid rgba(59, 130, 246, 0.3)", cursor: "pointer",
            }}>
              Create Rule
            </button>
            <button onClick={() => setShowAddRule(false)} style={{
              padding: "6px 12px", borderRadius: 6, fontSize: 11,
              background: "none", color: "#94a3b8",
              border: "1px solid rgba(148,163,184,0.2)", cursor: "pointer",
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Rules List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 24, color: "#94a3b8", fontSize: 12 }}>Loading rules...</div>
      ) : rules.length === 0 ? (
        <div style={{ textAlign: "center", padding: 24, color: "#64748b", fontSize: 13 }}>
          No classification rules yet. Add rules to auto-classify conversations.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rules.map(rule => (
            <div key={rule.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: 8,
              background: rule.isActive ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.01)",
              border: "1px solid rgba(148,163,184,0.1)",
              opacity: rule.isActive ? 1 : 0.5,
            }}>
              <button onClick={() => handleToggleRule(rule.id, rule.isActive)} style={{
                background: "none", border: "none", cursor: "pointer", padding: 0,
                color: rule.isActive ? "#22c55e" : "#94a3b8",
              }}>
                {rule.isActive ? <ToggleRight style={{ width: 18, height: 18 }} /> : <ToggleLeft style={{ width: 18, height: 18 }} />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>
                  {ruleTypeLabels[rule.ruleType]}: &quot;{rule.ruleValue}&quot;
                </div>
                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                  → {rule.classification === "personal" ? "🔴 Personal" : "🟢 Professional"}
                </div>
              </div>
              <button onClick={() => handleDeleteRule(rule.id)} style={{
                background: "none", border: "none", cursor: "pointer", padding: 4,
                color: "#ef4444", opacity: 0.6,
              }}>
                <Trash2 style={{ width: 14, height: 14 }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
