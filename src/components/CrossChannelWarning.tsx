"use client";

import { AlertTriangle, Info, CheckCircle, Linkedin, Mail } from "lucide-react";
import type { Lead } from "@/lib/types";

interface CrossChannelWarningProps {
  lead: Lead;
  currentChannel: "linkedin" | "email";
}

export default function CrossChannelWarning({ lead, currentChannel }: CrossChannelWarningProps) {
  const otherChannel = currentChannel === "linkedin" ? "email" : "linkedin";
  const otherChannelLabel = otherChannel === "linkedin" ? "LinkedIn" : "Email";
  const OtherIcon = otherChannel === "linkedin" ? Linkedin : Mail;

  // Find most recent event on the other channel
  const otherEvents = lead.touchpointTimeline
    .filter((e) => e.channel === otherChannel)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (otherEvents.length === 0) return null;

  const lastEvent = otherEvents[0];
  const daysAgo = Math.floor((Date.now() - new Date(lastEvent.date).getTime()) / 86400000);

  // Check if there was a reply on the other channel
  const hasReply = otherEvents.some((e) =>
    e.type.includes("replied") || e.type.includes("reply")
  );

  let alertType: "warning" | "info" | "success";
  let message: string;
  let Icon = Info;

  if (hasReply && daysAgo <= 3) {
    alertType = "success";
    message = `${otherChannelLabel} reply received ${daysAgo === 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`} — great momentum for cross-channel follow-up.`;
    Icon = CheckCircle;
  } else if (daysAgo <= 3) {
    alertType = "warning";
    message = `You reached out on ${otherChannelLabel} ${daysAgo === 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`} — consider waiting before ${currentChannel === "email" ? "emailing" : "messaging on LinkedIn"}.`;
    Icon = AlertTriangle;
  } else if (daysAgo <= 7) {
    alertType = "info";
    message = `Last ${otherChannelLabel} touchpoint was ${daysAgo} days ago. A ${currentChannel === "email" ? "email" : "LinkedIn message"} could complement the ${otherChannelLabel} outreach.`;
    Icon = Info;
  } else {
    return null; // No warning needed if last activity was over 7 days ago
  }

  return (
    <div className={`alert-box alert-${alertType}`} style={{ marginBottom: 12 }}>
      <Icon className="w-4 h-4 flex-shrink-0" style={{ marginTop: 1 }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <OtherIcon className="w-3 h-3" />
          <span style={{ fontSize: 12, fontWeight: 600 }}>Cross-Channel Context</span>
        </div>
        <p style={{ fontSize: 12, lineHeight: 1.4 }}>{message}</p>
      </div>
    </div>
  );
}
