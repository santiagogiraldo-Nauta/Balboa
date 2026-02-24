"use client";

import { useState } from "react";
import { Activity, Mail, Linkedin, Phone, ChevronDown, ChevronUp, Clock } from "lucide-react";
import type { Lead } from "@/lib/types";

interface OutreachActivitySummaryProps {
  lead: Lead;
}

interface TimelineEntry {
  id: string;
  date: string;
  channel: "email" | "linkedin" | "call";
  type: string;
  description: string;
}

function mergeTimeline(lead: Lead): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  // Sent drafts
  (lead.draftMessages || [])
    .filter(d => d.status === "sent")
    .forEach(d => {
      entries.push({
        id: `draft-${d.id}`,
        date: d.approvedAt || d.createdAt,
        channel: d.channel === "call" ? "call" : d.channel,
        type: d.type?.replace(/_/g, " ") || "message",
        description: d.subject || d.body.substring(0, 80) + (d.body.length > 80 ? "..." : ""),
      });
    });

  // Touchpoint timeline
  (lead.touchpointTimeline || []).forEach(t => {
    entries.push({
      id: `tp-${t.id}`,
      date: t.date,
      channel: t.channel,
      type: t.type,
      description: t.description,
    });
  });

  // Call logs
  (lead.callLogs || []).forEach(c => {
    entries.push({
      id: `call-${c.id}`,
      date: c.date,
      channel: "call",
      type: "call",
      description: `Call logged${c.duration ? ` (${c.duration})` : ""} — ${c.notes?.substring(0, 60) || "No notes"}`,
    });
  });

  // Email campaigns
  (lead.emailCampaigns || []).forEach(ec => {
    entries.push({
      id: `ec-${ec.campaignId}-${ec.sentAt}`,
      date: ec.sentAt,
      channel: "email",
      type: `campaign: ${ec.status}`,
      description: `${ec.campaignName} — ${ec.status}`,
    });
  });

  // Deduplicate by id and sort by date (newest first)
  const seen = new Set<string>();
  return entries
    .filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

const CHANNEL_CONFIG = {
  email: { icon: Mail, color: "#059669", bg: "#d1fae5", label: "Email" },
  linkedin: { icon: Linkedin, color: "#0077b5", bg: "#e0f2fe", label: "LinkedIn" },
  call: { icon: Phone, color: "#7c3aed", bg: "#ede9fe", label: "Call" },
};

function formatRelativeDate(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function OutreachActivitySummary({ lead }: OutreachActivitySummaryProps) {
  const [expanded, setExpanded] = useState(false);
  const timeline = mergeTimeline(lead);

  if (timeline.length === 0) return null;

  // Count by channel
  const emailCount = timeline.filter(t => t.channel === "email").length;
  const linkedinCount = timeline.filter(t => t.channel === "linkedin").length;
  const callCount = timeline.filter(t => t.channel === "call").length;

  const lastContact = timeline[0];
  const displayItems = expanded ? timeline : timeline.slice(0, 3);

  return (
    <div style={{ marginTop: 4 }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", padding: 0, marginBottom: 10,
          border: "none", background: "transparent", cursor: "pointer",
        }}
      >
        <h4 style={{
          fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
          color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em",
          margin: 0,
        }}>
          <Activity className="w-3.5 h-3.5" style={{ color: "var(--balboa-navy)" }} />
          Outreach Activity
          <span style={{
            background: "var(--balboa-navy)", color: "white",
            fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 10,
          }}>
            {timeline.length}
          </span>
        </h4>
        {expanded
          ? <ChevronUp className="w-3.5 h-3.5" style={{ color: "var(--balboa-text-muted)" }} />
          : <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--balboa-text-muted)" }} />}
      </button>

      {/* Summary stats */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, marginBottom: 10,
        padding: "8px 12px", borderRadius: 8,
        background: "var(--balboa-bg-alt)", border: "1px solid var(--balboa-border-light)",
      }}>
        <span style={{ fontSize: 11, color: "var(--balboa-text-secondary)" }}>
          {emailCount > 0 && <><Mail className="w-3 h-3" style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }} />{emailCount} email{emailCount > 1 ? "s" : ""}</>}
          {emailCount > 0 && (linkedinCount > 0 || callCount > 0) && " · "}
          {linkedinCount > 0 && <><Linkedin className="w-3 h-3" style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }} />{linkedinCount} LinkedIn</>}
          {linkedinCount > 0 && callCount > 0 && " · "}
          {callCount > 0 && <><Phone className="w-3 h-3" style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }} />{callCount} call{callCount > 1 ? "s" : ""}</>}
        </span>
        {lastContact && (
          <span style={{
            fontSize: 11, color: "var(--balboa-text-muted)",
            display: "flex", alignItems: "center", gap: 4, marginLeft: "auto",
          }}>
            <Clock className="w-3 h-3" /> Last: {formatRelativeDate(lastContact.date)}
          </span>
        )}
      </div>

      {/* Timeline */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {displayItems.map((entry) => {
          const config = CHANNEL_CONFIG[entry.channel] || CHANNEL_CONFIG.email;
          const Icon = config.icon;
          return (
            <div key={entry.id} style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              padding: "6px 0",
            }}>
              {/* Channel icon */}
              <div style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                background: config.bg,
                display: "flex", alignItems: "center", justifyContent: "center",
                marginTop: 1,
              }}>
                <Icon className="w-3 h-3" style={{ color: config.color }} />
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: 12, color: "var(--balboa-navy)", margin: 0, lineHeight: 1.4,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {entry.description}
                </p>
                <p style={{ fontSize: 10, color: "var(--balboa-text-muted)", margin: "1px 0 0 0" }}>
                  {formatDate(entry.date)} · {entry.type}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Show more/less */}
      {timeline.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="btn-ghost"
          style={{ fontSize: 11, marginTop: 4, width: "100%", justifyContent: "center" }}
        >
          {expanded ? "Show less" : `Show all ${timeline.length} activities`}
        </button>
      )}
    </div>
  );
}
