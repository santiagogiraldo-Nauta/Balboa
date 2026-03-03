"use client";

/**
 * AgentExecutionPanel — Power-user progress view
 *
 * A floating panel that shows agent execution progress:
 * - Agent name and status
 * - Step-by-step progress (for pipelines)
 * - Duration and token usage
 * - Minimizable to a small badge
 *
 * Follows the same styling patterns as existing components
 * (inline styles, var(--balboa-navy) colors, lucide-react icons).
 */

import { useState } from "react";
import { X, Minimize2, Maximize2, Clock, Zap, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import type { AgentExecutionState, AgentExecutionStatus } from "@/lib/types-agents";

interface AgentExecutionPanelProps {
  executions: AgentExecutionState[];
  onDismiss: (executionId: string) => void;
  onClearAll: () => void;
}

const statusIcon = (status: AgentExecutionStatus) => {
  switch (status) {
    case "running":
      return <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />;
    case "completed":
      return <CheckCircle2 size={14} color="#2b8a3e" />;
    case "failed":
      return <AlertCircle size={14} color="#e03131" />;
    case "pending":
      return <Clock size={14} color="#868e96" />;
    case "skipped":
      return <Clock size={14} color="#868e96" />;
    default:
      return null;
  }
};

const statusColor = (status: AgentExecutionStatus) => {
  switch (status) {
    case "running": return "#228be6";
    case "completed": return "#2b8a3e";
    case "failed": return "#e03131";
    default: return "#868e96";
  }
};

export default function AgentExecutionPanel({
  executions,
  onDismiss,
  onClearAll,
}: AgentExecutionPanelProps) {
  const [minimized, setMinimized] = useState(false);

  if (executions.length === 0) return null;

  const activeCount = executions.filter((e) => e.status === "running").length;
  const completedCount = executions.filter((e) => e.status === "completed").length;

  if (minimized) {
    return (
      <div
        onClick={() => setMinimized(false)}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          background: "linear-gradient(135deg, #1a1f36, #2d3250)",
          color: "#fff",
          padding: "8px 14px",
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          gap: 6,
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <Zap size={14} color="#f59f00" />
        {activeCount > 0
          ? `${activeCount} agent${activeCount > 1 ? "s" : ""} running`
          : `${completedCount} completed`}
        <Maximize2 size={12} />
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        width: 340,
        maxHeight: 400,
        background: "linear-gradient(135deg, #1a1f36, #2d3250)",
        color: "#fff",
        borderRadius: 12,
        zIndex: 9999,
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        border: "1px solid rgba(255,255,255,0.1)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Zap size={14} color="#f59f00" />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.5px" }}>
            AGENT HUB
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {executions.length > 1 && (
            <button
              onClick={onClearAll}
              style={{
                background: "none",
                border: "none",
                color: "#868e96",
                fontSize: 10,
                cursor: "pointer",
                padding: "2px 6px",
              }}
            >
              Clear all
            </button>
          )}
          <button
            onClick={() => setMinimized(true)}
            style={{
              background: "none",
              border: "none",
              color: "#868e96",
              cursor: "pointer",
              padding: 2,
              display: "flex",
            }}
          >
            <Minimize2 size={14} />
          </button>
        </div>
      </div>

      {/* Execution list */}
      <div style={{ overflowY: "auto", maxHeight: 340, padding: "6px 0" }}>
        {executions.map((exec) => (
          <div
            key={exec.executionId}
            style={{
              padding: "8px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            {/* Agent name + status */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {statusIcon(exec.status)}
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  {exec.agentName || exec.agentId || "Agent"}
                </span>
              </div>
              <button
                onClick={() => onDismiss(exec.executionId)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#868e96",
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                }}
              >
                <X size={12} />
              </button>
            </div>

            {/* Status badge */}
            <div
              style={{
                display: "inline-block",
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 10,
                background: `${statusColor(exec.status)}22`,
                color: statusColor(exec.status),
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: "0.3px",
              }}
            >
              {exec.status}
            </div>

            {/* Steps (for pipelines) */}
            {exec.steps.length > 1 && (
              <div style={{ marginTop: 4 }}>
                {exec.steps.map((step) => (
                  <div
                    key={step.stepId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "2px 0",
                      fontSize: 11,
                      color: "#ced4da",
                    }}
                  >
                    {statusIcon(step.status)}
                    <span>{step.agentName}</span>
                    {step.durationMs && (
                      <span style={{ color: "#868e96", marginLeft: "auto" }}>
                        {(step.durationMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Metrics */}
            {(exec.totalDurationMs || exec.totalTokensUsed) && (
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  marginTop: 6,
                  fontSize: 10,
                  color: "#868e96",
                }}
              >
                {exec.totalDurationMs && (
                  <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <Clock size={10} />
                    {(exec.totalDurationMs / 1000).toFixed(1)}s
                  </span>
                )}
                {exec.totalTokensUsed && (
                  <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <Zap size={10} />
                    {exec.totalTokensUsed} tokens
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Spin animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
