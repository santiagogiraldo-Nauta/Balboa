"use client";

import { useState, useEffect, useCallback } from "react";
import { OutreachQueueItem } from "@/lib/db-outreach";
import { getClientConfig } from "@/lib/config-client";
import { Check, X, Clock, Send, Mail, Linkedin, AlertTriangle, RefreshCw } from "lucide-react";

interface OutreachApprovalQueueProps {
  visible: boolean;
}

export default function OutreachApprovalQueue({ visible }: OutreachApprovalQueueProps) {
  const [items, setItems] = useState<OutreachQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("pending_approval");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const { isSandbox } = getClientConfig();

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter ? `/api/outreach-queue?status=${filter}` : "/api/outreach-queue";
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error("Failed to fetch queue:", err);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    if (visible && !isSandbox) {
      fetchQueue();
    }
  }, [visible, isSandbox, fetchQueue]);

  const handleAction = async (queueId: string, action: "approve" | "reject") => {
    setProcessingId(queueId);
    try {
      const resp = await fetch("/api/outreach-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, queueId }),
      });
      if (resp.ok) {
        // Refresh list
        fetchQueue();
      }
    } catch (err) {
      console.error("Failed to process queue action:", err);
    }
    setProcessingId(null);
  };

  if (!visible) return null;

  if (isSandbox) {
    return (
      <div style={{ padding: 24 }}>
        <div
          style={{
            background: "rgba(245, 158, 11, 0.1)",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            borderRadius: 12,
            padding: 24,
            textAlign: "center",
          }}
        >
          <AlertTriangle style={{ width: 32, height: 32, color: "#f59e0b", margin: "0 auto 12px" }} />
          <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>Sandbox Mode</h3>
          <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>
            Outreach queue is only active in production mode. In sandbox, all outreach is simulated instantly.
          </p>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending_approval: "#f59e0b",
    approved: "#22c55e",
    rejected: "#ef4444",
    sent: "#3b82f6",
    cancelled: "#94a3b8",
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Outreach Queue</h3>
        <button
          onClick={fetchQueue}
          disabled={loading}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 4,
            opacity: loading ? 0.5 : 1,
          }}
        >
          <RefreshCw style={{ width: 16, height: 16 }} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {["pending_approval", "approved", "rejected", "sent"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              border: "1px solid",
              borderColor: filter === s ? statusColors[s] : "rgba(148,163,184,0.2)",
              background: filter === s ? `${statusColors[s]}15` : "transparent",
              color: filter === s ? statusColors[s] : "#94a3b8",
              cursor: "pointer",
            }}
          >
            {s.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
          </button>
        ))}
      </div>

      {/* Launch switch warning */}
      <div
        style={{
          background: "rgba(239, 68, 68, 0.08)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          borderRadius: 8,
          padding: "8px 12px",
          marginBottom: 16,
          fontSize: 11,
          color: "#94a3b8",
        }}
      >
        <strong style={{ color: "#ef4444" }}>Launch Switch OFF</strong> — Approved items will only send after the launch switch is activated via deployment settings.
      </div>

      {/* Queue items */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 24, color: "#94a3b8" }}>
          <RefreshCw style={{ width: 20, height: 20, margin: "0 auto 8px" }} className="animate-spin" />
          <p style={{ fontSize: 12 }}>Loading queue...</p>
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: 24, color: "#64748b", fontSize: 13 }}>
          No items in queue
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(148,163,184,0.1)",
                borderRadius: 10,
                padding: 14,
                borderLeft: `3px solid ${statusColors[item.status] || "#94a3b8"}`,
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                {item.channel === "email" ? (
                  <Mail style={{ width: 14, height: 14, color: "#3b82f6" }} />
                ) : (
                  <Linkedin style={{ width: 14, height: 14, color: "#0077b5" }} />
                )}
                <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>
                  {item.channel === "email" ? "Email" : "LinkedIn"} to Lead #{item.leadId.slice(0, 8)}...
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: `${statusColors[item.status]}20`,
                    color: statusColors[item.status],
                  }}
                >
                  {item.status.replace("_", " ")}
                </span>
              </div>

              {/* Subject */}
              {item.subject && (
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: "#e2e8f0" }}>
                  {item.subject}
                </div>
              )}

              {/* Body preview */}
              <div
                style={{
                  fontSize: 11,
                  color: "#94a3b8",
                  lineHeight: 1.5,
                  maxHeight: 60,
                  overflow: "hidden",
                  marginBottom: 8,
                }}
              >
                {item.body.slice(0, 200)}
                {item.body.length > 200 ? "..." : ""}
              </div>

              {/* Time */}
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 8 }}>
                <Clock style={{ width: 10, height: 10, display: "inline", marginRight: 4 }} />
                {new Date(item.createdAt).toLocaleString()}
              </div>

              {/* Actions for pending items */}
              {item.status === "pending_approval" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleAction(item.id, "approve")}
                    disabled={processingId === item.id}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      padding: "6px 12px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      background: "rgba(34, 197, 94, 0.15)",
                      color: "#22c55e",
                      border: "1px solid rgba(34, 197, 94, 0.3)",
                      cursor: "pointer",
                      opacity: processingId === item.id ? 0.5 : 1,
                    }}
                  >
                    <Check style={{ width: 12, height: 12 }} /> Approve
                  </button>
                  <button
                    onClick={() => handleAction(item.id, "reject")}
                    disabled={processingId === item.id}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      padding: "6px 12px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      background: "rgba(239, 68, 68, 0.1)",
                      color: "#ef4444",
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                      cursor: "pointer",
                      opacity: processingId === item.id ? 0.5 : 1,
                    }}
                  >
                    <X style={{ width: 12, height: 12 }} /> Reject
                  </button>
                </div>
              )}

              {/* Sent badge */}
              {item.status === "sent" && item.sentAt && (
                <div style={{ fontSize: 10, color: "#3b82f6" }}>
                  <Send style={{ width: 10, height: 10, display: "inline", marginRight: 4 }} />
                  Sent {new Date(item.sentAt).toLocaleString()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
