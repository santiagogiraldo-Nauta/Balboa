"use client";

import { useState, useEffect, useCallback } from "react";
import { LinkedInConversation, ConversationClassification } from "@/lib/types-linkedin";
import { getClientConfig } from "@/lib/config-client";
import {
  Linkedin, User, ShieldCheck, ShieldOff, Eye, EyeOff,
  RefreshCw, AlertTriangle, MessageCircle,
} from "lucide-react";

interface LinkedInConversationListProps {
  visible: boolean;
}

export default function LinkedInConversationList({ visible }: LinkedInConversationListProps) {
  const [conversations, setConversations] = useState<LinkedInConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const { isSandbox } = getClientConfig();

  const fetchConversations = useCallback(async () => {
    if (isSandbox) return;
    setLoading(true);
    try {
      const url = filter !== "all"
        ? `/api/linkedin/conversations?classification=${filter}`
        : "/api/linkedin/conversations";
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error("Failed to fetch conversations:", err);
    }
    setLoading(false);
  }, [filter, isSandbox]);

  useEffect(() => {
    if (visible && !isSandbox) fetchConversations();
  }, [visible, isSandbox, fetchConversations]);

  const handleReclassify = async (conversationId: string, newClassification: ConversationClassification) => {
    setProcessingId(conversationId);
    try {
      const resp = await fetch("/api/linkedin/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          action: "reclassify",
          classification: newClassification,
          reason: "Manual reclassification by user",
        }),
      });
      if (resp.ok) fetchConversations();
    } catch (err) {
      console.error("Failed to reclassify:", err);
    }
    setProcessingId(null);
  };

  const handleToggleExclusion = async (conversationId: string, currentlyExcluded: boolean) => {
    setProcessingId(conversationId);
    try {
      const resp = await fetch("/api/linkedin/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          action: currentlyExcluded ? "include" : "exclude",
        }),
      });
      if (resp.ok) fetchConversations();
    } catch (err) {
      console.error("Failed to toggle exclusion:", err);
    }
    setProcessingId(null);
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
            LinkedIn conversations are simulated in sandbox. Connect your LinkedIn in production to see real conversations.
          </p>
        </div>
      </div>
    );
  }

  const classificationStyles: Record<string, { color: string; bg: string; label: string }> = {
    professional: { color: "#22c55e", bg: "rgba(34, 197, 94, 0.15)", label: "Professional" },
    personal: { color: "#ef4444", bg: "rgba(239, 68, 68, 0.15)", label: "Personal" },
    unclassified: { color: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)", label: "Unclassified" },
  };

  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Linkedin style={{ width: 18, height: 18, color: "#0077b5" }} />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Conversations</h3>
        </div>
        <button onClick={fetchConversations} disabled={loading} style={{
          background: "none", border: "none", cursor: "pointer", padding: 4,
          opacity: loading ? 0.5 : 1,
        }}>
          <RefreshCw style={{ width: 16, height: 16 }} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { key: "all", label: "All" },
          { key: "unclassified", label: "Needs Review" },
          { key: "professional", label: "Professional" },
          { key: "personal", label: "Personal" },
        ].map(tab => (
          <button key={tab.key} onClick={() => setFilter(tab.key)} style={{
            padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
            border: "1px solid",
            borderColor: filter === tab.key ? "#3b82f6" : "rgba(148,163,184,0.2)",
            background: filter === tab.key ? "rgba(59,130,246,0.1)" : "transparent",
            color: filter === tab.key ? "#3b82f6" : "#94a3b8",
            cursor: "pointer",
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Conversation list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 24, color: "#94a3b8" }}>
          <RefreshCw style={{ width: 20, height: 20, margin: "0 auto 8px" }} className="animate-spin" />
          <p style={{ fontSize: 12 }}>Loading conversations...</p>
        </div>
      ) : conversations.length === 0 ? (
        <div style={{ textAlign: "center", padding: 24, color: "#64748b", fontSize: 13 }}>
          <MessageCircle style={{ width: 24, height: 24, margin: "0 auto 8px", opacity: 0.5 }} />
          <p>No conversations found</p>
          <p style={{ fontSize: 11, marginTop: 4 }}>
            Conversations will appear here when LinkedIn is connected in production.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {conversations.map(conv => {
            const style = classificationStyles[conv.classification] || classificationStyles.unclassified;
            return (
              <div key={conv.id} style={{
                background: conv.isExcluded ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.03)",
                border: "1px solid rgba(148,163,184,0.1)",
                borderRadius: 10, padding: 14,
                borderLeft: `3px solid ${style.color}`,
                opacity: conv.isExcluded ? 0.5 : 1,
              }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <User style={{ width: 14, height: 14, color: "#94a3b8" }} />
                  <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>
                    {conv.participantName}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                    background: style.bg, color: style.color,
                  }}>
                    {style.label}
                  </span>
                  {conv.isExcluded && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                      background: "rgba(148,163,184,0.15)", color: "#94a3b8",
                    }}>
                      Excluded
                    </span>
                  )}
                </div>

                {/* Message preview */}
                {conv.lastMessagePreview && (
                  <div style={{
                    fontSize: 11, color: "#94a3b8", lineHeight: 1.5,
                    maxHeight: 40, overflow: "hidden", marginBottom: 8,
                  }}>
                    {conv.lastMessagePreview.slice(0, 150)}{conv.lastMessagePreview.length > 150 ? "..." : ""}
                  </div>
                )}

                {/* Classification reason */}
                {conv.classificationReason && (
                  <div style={{ fontSize: 10, color: "#64748b", marginBottom: 8, fontStyle: "italic" }}>
                    {conv.classificationMethod === "rule" ? "📋" : conv.classificationMethod === "auto" ? "🤖" : "👤"}{" "}
                    {conv.classificationReason.slice(0, 100)}
                  </div>
                )}

                {/* Confidence */}
                {conv.classificationConfidence != null && (
                  <div style={{ fontSize: 10, color: "#64748b", marginBottom: 8 }}>
                    Confidence: {Math.round(conv.classificationConfidence * 100)}%
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {/* Reclassify buttons */}
                  {conv.classification !== "professional" && (
                    <button
                      onClick={() => handleReclassify(conv.id, "professional")}
                      disabled={processingId === conv.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "4px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600,
                        background: "rgba(34, 197, 94, 0.1)", color: "#22c55e",
                        border: "1px solid rgba(34, 197, 94, 0.2)", cursor: "pointer",
                        opacity: processingId === conv.id ? 0.5 : 1,
                      }}
                    >
                      <ShieldCheck style={{ width: 10, height: 10 }} /> Professional
                    </button>
                  )}
                  {conv.classification !== "personal" && (
                    <button
                      onClick={() => handleReclassify(conv.id, "personal")}
                      disabled={processingId === conv.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "4px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600,
                        background: "rgba(239, 68, 68, 0.1)", color: "#ef4444",
                        border: "1px solid rgba(239, 68, 68, 0.2)", cursor: "pointer",
                        opacity: processingId === conv.id ? 0.5 : 1,
                      }}
                    >
                      <ShieldOff style={{ width: 10, height: 10 }} /> Personal
                    </button>
                  )}
                  {/* Toggle exclusion */}
                  <button
                    onClick={() => handleToggleExclusion(conv.id, conv.isExcluded)}
                    disabled={processingId === conv.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "4px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600,
                      background: "rgba(148,163,184,0.08)", color: "#94a3b8",
                      border: "1px solid rgba(148,163,184,0.15)", cursor: "pointer",
                      opacity: processingId === conv.id ? 0.5 : 1,
                    }}
                  >
                    {conv.isExcluded ? (
                      <><Eye style={{ width: 10, height: 10 }} /> Include</>
                    ) : (
                      <><EyeOff style={{ width: 10, height: 10 }} /> Exclude</>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
