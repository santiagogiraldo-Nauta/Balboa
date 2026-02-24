"use client";

import { useState, useEffect, useCallback } from "react";
import { LinkedInFilterAuditEntry } from "@/lib/types-linkedin";
import { getClientConfig } from "@/lib/config-client";
import { FileText, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";

interface LinkedInAuditLogProps {
  visible: boolean;
  onBack: () => void;
}

export default function LinkedInAuditLog({ visible, onBack }: LinkedInAuditLogProps) {
  const [entries, setEntries] = useState<LinkedInFilterAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 20;
  const { isSandbox } = getClientConfig();

  const fetchAuditLog = useCallback(async () => {
    if (isSandbox) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/linkedin/audit-log?limit=${limit}&offset=${offset}`);
      if (resp.ok) {
        const data = await resp.json();
        setEntries(data.entries || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error("Failed to fetch audit log:", err);
    }
    setLoading(false);
  }, [offset, isSandbox]);

  useEffect(() => {
    if (visible) fetchAuditLog();
  }, [visible, fetchAuditLog]);

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
            Audit log is only available in production mode.
          </p>
        </div>
      </div>
    );
  }

  const actionLabels: Record<string, { label: string; color: string }> = {
    classified: { label: "Classified", color: "#3b82f6" },
    reclassified: { label: "Reclassified", color: "#f59e0b" },
    excluded: { label: "Excluded", color: "#ef4444" },
    included: { label: "Included", color: "#22c55e" },
    rule_created: { label: "Rule Created", color: "#8b5cf6" },
    rule_deleted: { label: "Rule Deleted", color: "#94a3b8" },
  };

  const methodLabels: Record<string, string> = {
    auto: "🤖 Auto",
    manual: "👤 Manual",
    rule: "📋 Rule",
  };

  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <button onClick={onBack} style={{
          background: "none", border: "none", cursor: "pointer", padding: 4, color: "#94a3b8",
        }}>
          <ChevronLeft style={{ width: 18, height: 18 }} />
        </button>
        <FileText style={{ width: 18, height: 18, color: "#8b5cf6" }} />
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Audit Log</h3>
        <span style={{ fontSize: 11, color: "#64748b", marginLeft: "auto" }}>
          {total} total entries
        </span>
      </div>

      {/* Entries */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 24, color: "#94a3b8", fontSize: 12 }}>Loading audit log...</div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: "center", padding: 24, color: "#64748b", fontSize: 13 }}>
          No audit entries yet. Classification actions will be logged here.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {entries.map(entry => {
              const actionStyle = actionLabels[entry.action] || { label: entry.action, color: "#94a3b8" };
              return (
                <div key={entry.id} style={{
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(148,163,184,0.08)",
                  borderRadius: 8, padding: "10px 12px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                      background: `${actionStyle.color}15`, color: actionStyle.color,
                    }}>
                      {actionStyle.label}
                    </span>
                    <span style={{ fontSize: 10, color: "#64748b" }}>
                      {methodLabels[entry.method] || entry.method}
                    </span>
                    <span style={{ fontSize: 10, color: "#475569", marginLeft: "auto" }}>
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>

                  {/* Classification change */}
                  {entry.previousClassification && entry.newClassification && (
                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>
                      {entry.previousClassification} → {entry.newClassification}
                    </div>
                  )}
                  {!entry.previousClassification && entry.newClassification && (
                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>
                      → {entry.newClassification}
                    </div>
                  )}

                  {/* Reason */}
                  {entry.reason && (
                    <div style={{ fontSize: 10, color: "#64748b", fontStyle: "italic" }}>
                      {entry.reason.slice(0, 150)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {total > limit && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 }}>
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                style={{
                  background: "none", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 6,
                  padding: "4px 8px", cursor: offset === 0 ? "default" : "pointer",
                  opacity: offset === 0 ? 0.3 : 1, color: "#94a3b8",
                }}
              >
                <ChevronLeft style={{ width: 14, height: 14 }} />
              </button>
              <span style={{ fontSize: 11, color: "#64748b" }}>
                {offset + 1}–{Math.min(offset + limit, total)} of {total}
              </span>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
                style={{
                  background: "none", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 6,
                  padding: "4px 8px", cursor: offset + limit >= total ? "default" : "pointer",
                  opacity: offset + limit >= total ? 0.3 : 1, color: "#94a3b8",
                }}
              >
                <ChevronRight style={{ width: 14, height: 14 }} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
