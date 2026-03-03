"use client";

import type { ReactNode } from "react";

export interface SectionTab<T extends string> {
  key: T;
  label: string;
  icon?: ReactNode;
  badge?: number;
}

interface SectionTabBarProps<T extends string> {
  tabs: SectionTab<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
}

export default function SectionTabBar<T extends string>({
  tabs,
  activeTab,
  onTabChange,
}: SectionTabBarProps<T>) {
  return (
    <div style={{
      display: "flex",
      gap: 2,
      borderBottom: "1px solid var(--balboa-border-light)",
      marginBottom: 20,
      paddingBottom: 0,
    }}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          style={{
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: activeTab === tab.key ? 700 : 500,
            color: activeTab === tab.key ? "var(--balboa-navy)" : "var(--balboa-text-muted)",
            background: activeTab === tab.key ? "rgba(30, 42, 94, 0.06)" : "transparent",
            border: "none",
            borderBottom: activeTab === tab.key ? "2px solid var(--balboa-navy)" : "2px solid transparent",
            borderRadius: "8px 8px 0 0",
            cursor: "pointer",
            transition: "all 0.15s ease",
            display: "flex",
            alignItems: "center",
            gap: 6,
            whiteSpace: "nowrap",
          }}
        >
          {tab.icon}
          {tab.label}
          {tab.badge !== undefined && tab.badge > 0 && (
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              background: activeTab === tab.key ? "var(--balboa-navy)" : "var(--balboa-text-light)",
              color: "white",
              padding: "1px 6px",
              borderRadius: 10,
              minWidth: 18,
              textAlign: "center",
            }}>
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
