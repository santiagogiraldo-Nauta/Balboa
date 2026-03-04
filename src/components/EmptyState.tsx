"use client";

import type { ReactNode } from "react";
import { Inbox, Users, Target, BarChart3, Send, Mail } from "lucide-react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

/** Reusable empty state for sections with no data in production mode */
export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  compact,
}: EmptyStateProps) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: compact ? "32px 24px" : "64px 24px",
      textAlign: "center",
      maxWidth: 420,
      margin: "0 auto",
    }}>
      {icon && (
        <div style={{
          width: compact ? 48 : 64,
          height: compact ? 48 : 64,
          borderRadius: 16,
          background: "var(--balboa-bg-alt)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: compact ? 12 : 20,
          color: "var(--balboa-text-muted)",
        }}>
          {icon}
        </div>
      )}
      <h3 style={{
        fontSize: compact ? 14 : 16,
        fontWeight: 700,
        color: "var(--balboa-navy)",
        marginBottom: 6,
      }}>
        {title}
      </h3>
      <p style={{
        fontSize: compact ? 12 : 13,
        color: "var(--balboa-text-muted)",
        lineHeight: 1.5,
        marginBottom: actionLabel ? 16 : 0,
      }}>
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 18px",
            fontSize: 13,
            fontWeight: 600,
            color: "white",
            background: "var(--balboa-blue)",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ── Preset empty states ──

export function EmptyLeads({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={<Users size={28} />}
      title="No leads yet"
      description="Import your LinkedIn connections or add leads manually to get started."
      actionLabel={onAction ? "Import Leads" : undefined}
      onAction={onAction}
    />
  );
}

export function EmptyInbox({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={<Mail size={28} />}
      title="No conversations yet"
      description="Connect your Gmail in Settings to see real email conversations matched to your leads."
      actionLabel={onAction ? "Connect Gmail" : undefined}
      onAction={onAction}
    />
  );
}

export function EmptyDeals() {
  return (
    <EmptyState
      icon={<Target size={28} />}
      title="No deals yet"
      description="Deals will appear here once you start tracking opportunities in your pipeline."
    />
  );
}

export function EmptyInsights() {
  return (
    <EmptyState
      icon={<BarChart3 size={28} />}
      title="No insights yet"
      description="Playbook insights and analytics will generate once your pipeline has enough data."
    />
  );
}

export function EmptyOutreach() {
  return (
    <EmptyState
      icon={<Send size={28} />}
      title="No outreach activity"
      description="Add leads and start outreach to see your activity, lists, and progress here."
    />
  );
}

export function EmptyHome() {
  return (
    <EmptyState
      icon={<Inbox size={28} />}
      title="All clear"
      description="No pending actions right now. Connect integrations to start tracking your sales activity."
    />
  );
}

// Silence unused import warnings — these are used as JSX
void Inbox; void Users; void Target; void BarChart3; void Send; void Mail;
