"use client";

import { Linkedin, Mail, Phone, Clock, StickyNote } from "lucide-react";
import type { TouchpointEvent } from "@/lib/types";

interface ActivityTimelineProps {
  events: TouchpointEvent[];
  compact?: boolean;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

const eventTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    connection_request_sent: "Connection Request",
    connection_accepted: "Connected",
    message_sent: "Message Sent",
    message_replied: "Reply Received",
    post_liked: "Post Liked",
    post_comment: "Post Comment",
    profile_viewed: "Profile Viewed",
    email_sent: "Email Sent",
    email_opened: "Email Opened",
    email_clicked: "Link Clicked",
    email_replied: "Reply Received",
    email_followup_sent: "Follow-up Sent",
    meeting_scheduled: "Meeting Scheduled",
    call_completed: "Call Completed",
    call_scheduled: "Call Scheduled",
    call_followup_sent: "Call Follow-up Sent",
    manual_note: "Note",
  };
  return labels[type] || type.replace(/_/g, " ");
};

export default function ActivityTimeline({ events, compact = false }: ActivityTimelineProps) {
  const sorted = [...events].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (sorted.length === 0) {
    return (
      <div style={{ padding: 16, textAlign: "center", color: "var(--balboa-text-muted)", fontSize: 13 }}>
        No activity yet
      </div>
    );
  }

  return (
    <div className="timeline">
      {sorted.map((event) => (
        <div key={event.id} className="timeline-item">
          <div className={`timeline-dot ${event.type === "manual_note" ? "timeline-dot-note" : event.channel === "linkedin" ? "timeline-dot-linkedin" : event.channel === "call" ? "timeline-dot-call" : "timeline-dot-email"}`} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              {event.type === "manual_note" ? (
                <StickyNote className="w-3 h-3" style={{ color: "#d97706" }} />
              ) : event.channel === "linkedin" ? (
                <Linkedin className="w-3 h-3" style={{ color: "#0077b5" }} />
              ) : event.channel === "call" ? (
                <Phone className="w-3 h-3" style={{ color: "#059669" }} />
              ) : (
                <Mail className="w-3 h-3" style={{ color: "#d97706" }} />
              )}
              <span style={{
                fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em",
                color: event.type === "manual_note" ? "#d97706" : event.channel === "linkedin" ? "#0077b5" : event.channel === "call" ? "#059669" : "#d97706",
              }}>
                {eventTypeLabel(event.type)}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "var(--balboa-text-muted)" }}>
                <Clock className="w-2.5 h-2.5" /> {timeAgo(event.date)}
              </span>
            </div>
            {!compact && (
              <p style={{ fontSize: 12, color: "var(--balboa-text-secondary)", marginLeft: 0, lineHeight: 1.4 }}>
                {event.description}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
