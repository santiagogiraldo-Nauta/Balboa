"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ExternalLink,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Unplug,
  Zap,
  Clock,
  Key,
  Copy,
  Check,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export type IntegrationStatus = "available" | "coming_soon" | "connected" | "error";
export type ConnectMode = "oauth" | "api_key" | "webhook" | "env" | "none";

export interface IntegrationStat {
  label: string;
  value: string | number;
}

export interface IntegrationCardProps {
  name: string;
  description: string;
  icon: LucideIcon;
  iconGradient: string;
  status: IntegrationStatus;
  connectMode?: ConnectMode;
  lastSync?: string | null;
  lastSyncStatus?: "success" | "error" | "pending";
  stats?: IntegrationStat[];
  webhookUrl?: string;
  connectedLabel?: string;
  errorMessage?: string;
  loading?: boolean;
  syncing?: boolean;
  testing?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onSync?: () => void;
  onTest?: () => void;
  onViewLogs?: () => void;
  onApiKeySubmit?: (key: string) => void;
  children?: React.ReactNode;
}

function formatSyncDate(dateStr: string | null | undefined): string {
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

export default function IntegrationCard({
  name,
  description,
  icon: Icon,
  iconGradient,
  status,
  connectMode = "none",
  lastSync,
  lastSyncStatus,
  stats,
  webhookUrl,
  connectedLabel,
  errorMessage,
  loading = false,
  syncing = false,
  testing = false,
  onConnect,
  onDisconnect,
  onSync,
  onTest,
  onViewLogs,
  onApiKeySubmit,
  children,
}: IntegrationCardProps) {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showApiKeyForm, setShowApiKeyForm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const isConnected = status === "connected";
  const isError = status === "error";
  const isComingSoon = status === "coming_soon";

  function handleCopyWebhook() {
    if (webhookUrl) {
      navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleApiKeySubmit() {
    if (apiKeyInput.trim() && onApiKeySubmit) {
      onApiKeySubmit(apiKeyInput.trim());
      setApiKeyInput("");
      setShowApiKeyForm(false);
    }
  }

  // Status badge
  function renderStatusBadge() {
    if (isConnected) {
      return (
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
          {connectedLabel || "Connected"}
        </span>
      );
    }
    if (isError) {
      return (
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 11,
          fontWeight: 600,
          color: "#e65100",
          background: "#fff3e0",
          padding: "2px 8px",
          borderRadius: 10,
        }}>
          <AlertTriangle size={11} />
          Error
        </span>
      );
    }
    if (isComingSoon) {
      return (
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
          Coming Soon
        </span>
      );
    }
    return (
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
    );
  }

  // Loading skeleton
  if (loading) {
    return (
      <div style={{
        border: "1px solid var(--balboa-border)",
        borderRadius: 12,
        padding: 24,
        background: "white",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "linear-gradient(135deg, var(--balboa-bg-alt), var(--balboa-bg-hover))",
            flexShrink: 0,
          }} />
          <div>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--balboa-navy)" }}>{name}</span>
            <div style={{ fontSize: 12, color: "var(--balboa-text-muted)", marginTop: 4 }}>
              Checking connection...
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      border: `1px solid ${isError ? "#ffcc80" : isConnected ? "#c8e6c9" : "var(--balboa-border)"}`,
      borderRadius: 12,
      padding: 24,
      background: "white",
      transition: "border-color 0.2s ease",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        {/* Platform Icon */}
        <div style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: isConnected
            ? "linear-gradient(135deg, #e8f5e9, #c8e6c9)"
            : isError
            ? "linear-gradient(135deg, #fff3e0, #ffcc80)"
            : iconGradient,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          <Icon size={22} style={{
            color: isConnected
              ? "#2e7d32"
              : isError
              ? "#e65100"
              : "var(--balboa-text-muted)",
          }} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--balboa-navy)" }}>
              {name}
            </span>
            {renderStatusBadge()}
          </div>

          <p style={{
            fontSize: 13,
            color: "var(--balboa-text-secondary)",
            marginBottom: isConnected || isError ? 12 : 16,
            lineHeight: 1.5,
          }}>
            {description}
          </p>

          {/* Error message */}
          {isError && errorMessage && (
            <div style={{
              padding: "8px 12px",
              background: "#fff3e0",
              borderRadius: 8,
              marginBottom: 12,
              fontSize: 12,
              color: "#e65100",
              lineHeight: 1.4,
            }}>
              {errorMessage}
            </div>
          )}

          {/* Stats row */}
          {isConnected && stats && stats.length > 0 && (
            <div style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              marginBottom: 12,
            }}>
              {stats.map((stat) => (
                <div key={stat.label} style={{
                  padding: "8px 14px",
                  background: "var(--balboa-bg-alt)",
                  borderRadius: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  minWidth: 80,
                }}>
                  <span style={{ fontSize: 11, color: "var(--balboa-text-muted)", fontWeight: 500 }}>
                    {stat.label}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)" }}>
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Last sync info */}
          {isConnected && lastSync !== undefined && (
            <div style={{
              display: "flex",
              gap: 16,
              marginBottom: 14,
              fontSize: 12,
              color: "var(--balboa-text-muted)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Clock size={12} />
                Last sync {formatSyncDate(lastSync)}
              </div>
              {lastSyncStatus === "error" && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#e65100" }}>
                  <AlertTriangle size={12} />
                  Sync had errors
                </div>
              )}
            </div>
          )}

          {/* Webhook URL display */}
          {webhookUrl && (isConnected || status === "available") && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              background: "var(--balboa-bg-alt)",
              borderRadius: 8,
              marginBottom: 14,
              fontSize: 11,
            }}>
              <span style={{ color: "var(--balboa-text-muted)", whiteSpace: "nowrap" }}>Webhook:</span>
              <code style={{
                color: "var(--balboa-text-secondary)",
                fontSize: 10,
                overflow: "hidden",
                textOverflow: "ellipsis",
                flex: 1,
              }}>
                {webhookUrl}
              </code>
              <button
                onClick={handleCopyWebhook}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: copied ? "#2e7d32" : "var(--balboa-text-muted)",
                  padding: 2,
                  flexShrink: 0,
                }}
                title="Copy webhook URL"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          )}

          {/* Actions for connected state */}
          {isConnected && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {onSync && (
                <button
                  onClick={onSync}
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
                  <RefreshCw size={13} style={syncing ? { animation: "spin 1s linear infinite" } : undefined} />
                  {syncing ? "Syncing..." : "Sync Now"}
                </button>
              )}
              {onTest && (
                <button
                  onClick={onTest}
                  disabled={testing}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--balboa-navy)",
                    background: "var(--balboa-bg-alt)",
                    border: "1px solid var(--balboa-border)",
                    borderRadius: 8,
                    cursor: testing ? "not-allowed" : "pointer",
                    opacity: testing ? 0.7 : 1,
                  }}
                >
                  <Zap size={13} />
                  {testing ? "Testing..." : "Test Connection"}
                </button>
              )}
              {onViewLogs && (
                <button
                  onClick={() => {
                    setShowLogs(!showLogs);
                    onViewLogs();
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--balboa-text-muted)",
                    background: "transparent",
                    border: "1px solid var(--balboa-border)",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  <FileText size={13} />
                  Logs
                  {showLogs ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              )}
              {onDisconnect && (
                <button
                  onClick={onDisconnect}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#e03131",
                    background: "transparent",
                    border: "1px solid var(--balboa-border)",
                    borderRadius: 8,
                    cursor: "pointer",
                    marginLeft: "auto",
                  }}
                >
                  <Unplug size={13} />
                  Disconnect
                </button>
              )}
            </div>
          )}

          {/* Actions for error state */}
          {isError && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {onConnect && (
                <button
                  onClick={onConnect}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "white",
                    background: "#e65100",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  <RefreshCw size={13} />
                  Reconnect
                </button>
              )}
              {onDisconnect && (
                <button
                  onClick={onDisconnect}
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
                    cursor: "pointer",
                  }}
                >
                  <Unplug size={13} />
                  Disconnect
                </button>
              )}
            </div>
          )}

          {/* Connect button for not-connected state */}
          {!isConnected && !isError && !isComingSoon && (
            <>
              {/* API Key connect mode */}
              {connectMode === "api_key" && (
                <>
                  {showApiKeyForm ? (
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <div style={{ flex: 1, position: "relative" }}>
                        <Key size={13} style={{
                          position: "absolute",
                          left: 10,
                          top: "50%",
                          transform: "translateY(-50%)",
                          color: "var(--balboa-text-muted)",
                        }} />
                        <input
                          type="password"
                          placeholder="Paste your API key"
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleApiKeySubmit(); }}
                          style={{
                            width: "100%",
                            padding: "9px 12px 9px 32px",
                            fontSize: 13,
                            border: "1px solid var(--balboa-border)",
                            borderRadius: 8,
                            outline: "none",
                            background: "var(--balboa-bg-alt)",
                            color: "var(--balboa-text-secondary)",
                          }}
                        />
                      </div>
                      <button
                        onClick={handleApiKeySubmit}
                        disabled={!apiKeyInput.trim()}
                        style={{
                          padding: "9px 16px",
                          fontSize: 13,
                          fontWeight: 700,
                          color: "white",
                          background: apiKeyInput.trim() ? "var(--balboa-blue)" : "var(--balboa-bg-hover)",
                          border: "none",
                          borderRadius: 8,
                          cursor: apiKeyInput.trim() ? "pointer" : "not-allowed",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setShowApiKeyForm(false); setApiKeyInput(""); }}
                        style={{
                          padding: "9px 12px",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--balboa-text-muted)",
                          background: "transparent",
                          border: "1px solid var(--balboa-border)",
                          borderRadius: 8,
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowApiKeyForm(true)}
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
                        cursor: "pointer",
                      }}
                    >
                      <Key size={14} />
                      Connect with API Key
                    </button>
                  )}
                </>
              )}

              {/* OAuth connect mode */}
              {connectMode === "oauth" && onConnect && (
                <button
                  onClick={onConnect}
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
                    cursor: "pointer",
                  }}
                >
                  <ExternalLink size={14} />
                  Connect {name}
                </button>
              )}

              {/* Webhook / env / default connect */}
              {(connectMode === "webhook" || connectMode === "env" || connectMode === "none") && onConnect && (
                <button
                  onClick={onConnect}
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
                    cursor: isComingSoon ? "not-allowed" : "pointer",
                    opacity: isComingSoon ? 0.4 : 1,
                  }}
                >
                  <ExternalLink size={14} />
                  Connect {name}
                </button>
              )}
            </>
          )}

          {/* Extra content (children slot) */}
          {children}
        </div>
      </div>
    </div>
  );
}
