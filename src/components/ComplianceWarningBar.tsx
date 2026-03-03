"use client";

import { Shield, AlertTriangle, Info, XCircle } from "lucide-react";
import type { ComplianceCheckResult } from "@/lib/compliance";

interface ComplianceWarningBarProps {
  results: ComplianceCheckResult[];
  channel: string;
  className?: string;
}

const severityConfig = {
  block: {
    bg: "rgba(224, 49, 49, 0.08)",
    border: "var(--balboa-red)",
    color: "var(--balboa-red)",
    icon: XCircle,
    prefix: "BLOCKED",
  },
  warn: {
    bg: "rgba(245, 159, 0, 0.08)",
    border: "var(--balboa-yellow)",
    color: "#b45309",
    icon: AlertTriangle,
    prefix: "",
  },
  info: {
    bg: "rgba(59, 91, 219, 0.06)",
    border: "var(--balboa-border-light)",
    color: "var(--balboa-text-muted)",
    icon: Info,
    prefix: "",
  },
} as const;

export default function ComplianceWarningBar({
  results,
  channel,
  className,
}: ComplianceWarningBarProps) {
  if (!results || results.length === 0) return null;

  const blockers = results.filter((r) => r.severity === "block" && !r.passed);
  const warnings = results.filter((r) => r.severity === "warn");
  const infos = results.filter((r) => r.severity === "info");

  const grouped = [
    ...blockers.map((r) => ({ ...r, severity: "block" as const })),
    ...warnings.map((r) => ({ ...r, severity: "warn" as const })),
    ...infos.map((r) => ({ ...r, severity: "info" as const })),
  ];

  if (grouped.length === 0) return null;

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        marginBottom: 8,
      }}
    >
      {grouped.map((result) => {
        const config = severityConfig[result.severity];
        const Icon = result.severity === "block" ? Shield : config.icon;

        return (
          <div
            key={result.ruleId}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              background: config.bg,
              borderLeft: `3px solid ${config.border}`,
              borderRadius: "var(--balboa-radius)",
              fontSize: 12,
              lineHeight: 1.4,
              color: config.color,
              minHeight: 32,
              maxHeight: 40,
            }}
          >
            <Icon
              style={{ width: 14, height: 14, flexShrink: 0 }}
            />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {result.severity === "block" ? (
                <strong>BLOCKED: {result.message}</strong>
              ) : (
                result.message
              )}
            </span>
            {result.suggestion && (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--balboa-text-muted)",
                  flexShrink: 0,
                  maxWidth: 200,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={result.suggestion}
              >
                {result.suggestion}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
