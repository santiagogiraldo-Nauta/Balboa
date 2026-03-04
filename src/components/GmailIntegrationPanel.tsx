"use client";

import { useState, useEffect, useCallback } from "react";
import { Mail, CheckCircle, XCircle, RefreshCw, Unplug, ExternalLink, Clock } from "lucide-react";

interface GmailStatus {
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
}

export default function GmailIntegrationPanel() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/gmail/status");
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ connected: false, email: null, connectedAt: null, lastSyncAt: null });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await fetch("/api/gmail/auth");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("No auth URL returned:", data);
        setConnecting(false);
      }
    } catch (err) {
      console.error("Failed to start Gmail auth:", err);
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/gmail/disconnect", { method: "POST" });
      await fetchStatus();
    } catch (err) {
      console.error("Failed to disconnect Gmail:", err);
    }
    setDisconnecting(false);
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/gmail/sync");
      const data = await res.json();
      if (data.connected) {
        setStatus((prev) => prev ? { ...prev, lastSyncAt: data.lastSyncAt } : prev);
      }
    } catch (err) {
      console.error("Gmail sync failed:", err);
    }
    setSyncing(false);
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "Never";
    try {
      return new Date(dateStr).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Unknown";
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <div style={{
          width: 24, height: 24, borderRadius: "50%",
          border: "2px solid var(--balboa-border)",
          borderTopColor: "var(--balboa-blue)",
          animation: "spin 1s linear infinite",
          margin: "0 auto 12px",
        }} />
        <div style={{ fontSize: 13, color: "var(--balboa-text-muted)" }}>Loading integrations...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <h3 style={{
        fontSize: 15,
        fontWeight: 700,
        color: "var(--balboa-navy)",
        marginBottom: 16,
      }}>
        Integrations
      </h3>

      {/* Gmail Integration Card */}
      <div style={{
        border: "1px solid var(--balboa-border)",
        borderRadius: 12,
        padding: 24,
        background: "white",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          {/* Gmail Icon */}
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: status?.connected
              ? "linear-gradient(135deg, #e8f5e9, #c8e6c9)"
              : "linear-gradient(135deg, var(--balboa-bg-alt), var(--balboa-bg-hover))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <Mail size={22} style={{
              color: status?.connected ? "#2e7d32" : "var(--balboa-text-muted)",
            }} />
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--balboa-navy)" }}>
                Gmail
              </span>
              {status?.connected ? (
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#2e7d32",
                  background: "#e8f5e9",
                  padding: "2px 8px",
                  borderRadius: 10,
                }}>
                  <CheckCircle size={11} />
                  Connected
                </span>
              ) : (
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--balboa-text-muted)",
                  background: "var(--balboa-bg-alt)",
                  padding: "2px 8px",
                  borderRadius: 10,
                }}>
                  <XCircle size={11} />
                  Not connected
                </span>
              )}
            </div>

            {status?.connected ? (
              <>
                <div style={{ fontSize: 13, color: "var(--balboa-text-secondary)", marginBottom: 12 }}>
                  Syncing emails from <strong>{status.email}</strong>
                </div>

                {/* Connection details */}
                <div style={{
                  display: "flex",
                  gap: 24,
                  marginBottom: 16,
                  fontSize: 12,
                  color: "var(--balboa-text-muted)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Clock size={12} />
                    Connected {formatDate(status.connectedAt)}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <RefreshCw size={12} />
                    Last sync {formatDate(status.lastSyncAt)}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "white",
                      background: "var(--balboa-blue)",
                      border: "none",
                      borderRadius: 8,
                      cursor: syncing ? "not-allowed" : "pointer",
                      opacity: syncing ? 0.7 : 1,
                    }}
                  >
                    <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
                    {syncing ? "Syncing..." : "Sync Now"}
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--balboa-text-muted)",
                      background: "var(--balboa-bg-alt)",
                      border: "1px solid var(--balboa-border)",
                      borderRadius: 8,
                      cursor: disconnecting ? "not-allowed" : "pointer",
                      opacity: disconnecting ? 0.7 : 1,
                    }}
                  >
                    <Unplug size={13} />
                    {disconnecting ? "Disconnecting..." : "Disconnect"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{
                  fontSize: 13,
                  color: "var(--balboa-text-secondary)",
                  marginBottom: 4,
                  lineHeight: 1.5,
                }}>
                  Connect your Gmail account to see real email conversations in your Inbox,
                  matched to your leads automatically.
                </p>
                <p style={{
                  fontSize: 12,
                  color: "var(--balboa-text-muted)",
                  marginBottom: 16,
                  lineHeight: 1.5,
                }}>
                  Read-only access — Balboa will never send emails without your explicit action.
                </p>

                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "9px 20px",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "white",
                    background: "var(--balboa-blue)",
                    border: "none",
                    borderRadius: 8,
                    cursor: connecting ? "not-allowed" : "pointer",
                    opacity: connecting ? 0.7 : 1,
                  }}
                >
                  <ExternalLink size={14} />
                  {connecting ? "Redirecting to Google..." : "Connect Gmail"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Info note */}
      <div style={{
        marginTop: 16,
        padding: "12px 16px",
        background: "var(--balboa-bg-alt)",
        borderRadius: 8,
        fontSize: 12,
        color: "var(--balboa-text-muted)",
        lineHeight: 1.5,
      }}>
        <strong>Privacy:</strong> Email data is fetched on-demand and not stored on our servers.
        Only email headers (sender, subject, date) are used for lead matching.
        You can disconnect at any time.
      </div>
    </div>
  );
}
