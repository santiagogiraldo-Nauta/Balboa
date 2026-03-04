"use client";

import type { LucideIcon } from "lucide-react";
import { ExternalLink } from "lucide-react";

type IntegrationStatus = "available" | "coming_soon" | "connected";

interface IntegrationCardProps {
  name: string;
  description: string;
  icon: LucideIcon;
  iconGradient: string;
  status: IntegrationStatus;
  onConnect?: () => void;
}

export default function IntegrationCard({
  name,
  description,
  icon: Icon,
  iconGradient,
  status,
  onConnect,
}: IntegrationCardProps) {
  const isComingSoon = status === "coming_soon";

  return (
    <div style={{
      border: "1px solid var(--balboa-border)",
      borderRadius: 12,
      padding: 24,
      background: "white",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        {/* Platform Icon */}
        <div style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: iconGradient,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          <Icon size={22} style={{
            color: "var(--balboa-text-muted)",
          }} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--balboa-navy)" }}>
              {name}
            </span>
            {isComingSoon && (
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
            )}
          </div>

          <p style={{
            fontSize: 13,
            color: "var(--balboa-text-secondary)",
            marginBottom: 16,
            lineHeight: 1.5,
          }}>
            {description}
          </p>

          <button
            onClick={isComingSoon ? undefined : onConnect}
            disabled={isComingSoon}
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
        </div>
      </div>
    </div>
  );
}
