"use client";

import { useState, useEffect } from "react";
import { X, Calendar, Clock, Video, Phone, Monitor, Sparkles, Loader2 } from "lucide-react";
import type { Lead, SupportedLanguage } from "@/lib/types";
import { trackEventClient } from "@/lib/tracking";

interface MeetingSchedulerModalProps {
  lead: Lead;
  onClose: () => void;
  onSchedule: (meeting: {
    date: string;
    time: string;
    type: "google_meet" | "teams" | "zoom" | "phone";
    message: string;
  }) => void;
  language: SupportedLanguage;
}

const MEETING_TYPES = [
  { value: "google_meet" as const, label: "Google Meet", icon: Video },
  { value: "zoom" as const, label: "Zoom", icon: Monitor },
  { value: "teams" as const, label: "Microsoft Teams", icon: Monitor },
  { value: "phone" as const, label: "Phone Call", icon: Phone },
];

function getTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  // Skip weekends
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  return d.toISOString().split("T")[0];
}

export default function MeetingSchedulerModal({ lead, onClose, onSchedule, language }: MeetingSchedulerModalProps) {
  const [date, setDate] = useState(getTomorrow());
  const [time, setTime] = useState("10:00");
  const [meetingType, setMeetingType] = useState<"google_meet" | "teams" | "zoom" | "phone">("google_meet");
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    trackEventClient({ eventCategory: "enablement", eventAction: "meeting_scheduler_opened", leadId: lead.id });
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const meetingContext = `Schedule a meeting on ${date} at ${time} via ${meetingType.replace("_", " ")}. The meeting is to discuss potential collaboration and next steps.`;
      const resp = await fetch("/api/generate-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead,
          messageType: "meeting_request",
          context: meetingContext,
          language,
          channel: "email",
        }),
      });
      const data = await resp.json();
      if (data.message?.body) {
        setMessage(data.message.body);
        trackEventClient({ eventCategory: "enablement", eventAction: "meeting_message_generated", leadId: lead.id, metadata: { meetingType } });
      }
    } catch {
      // Fallback message
      const platformLabel = MEETING_TYPES.find(t => t.value === meetingType)?.label || meetingType;
      setMessage(
        `Hi ${lead.firstName},\n\nI'd love to schedule a call to discuss how we might be able to help ${lead.company}. Would ${formatDate(date)} at ${formatTime(time)} work for you?\n\nI'll send a ${platformLabel} link once confirmed.\n\nLooking forward to connecting!\n\nBest regards`
      );
    }
    setGenerating(false);
  };

  const handleSave = () => {
    if (!message.trim()) return;
    onSchedule({ date, time, type: meetingType, message });
    trackEventClient({ eventCategory: "enablement", eventAction: "meeting_draft_saved", leadId: lead.id, metadata: { meetingType, date, time } });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg, #059669, #10b981)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Calendar className="w-5 h-5" style={{ color: "white" }} />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--balboa-navy)", margin: 0 }}>
                Schedule Meeting
              </h3>
              <p style={{ fontSize: 12, color: "var(--balboa-text-muted)", margin: 0 }}>
                with {lead.firstName} {lead.lastName} @ {lead.company}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost"><X className="w-4 h-4" /></button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Date & Time row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-navy)", marginBottom: 6, display: "block" }}>
                <Calendar className="w-3.5 h-3.5" style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 10,
                  border: "1px solid var(--balboa-border)", fontSize: 13,
                  color: "var(--balboa-navy)", background: "white",
                  outline: "none",
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-navy)", marginBottom: 6, display: "block" }}>
                <Clock className="w-3.5 h-3.5" style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                Time
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 10,
                  border: "1px solid var(--balboa-border)", fontSize: 13,
                  color: "var(--balboa-navy)", background: "white",
                  outline: "none",
                }}
              />
            </div>
          </div>

          {/* Meeting Type */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-navy)", marginBottom: 8, display: "block" }}>
              Meeting Platform
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {MEETING_TYPES.map((mt) => {
                const Icon = mt.icon;
                const selected = meetingType === mt.value;
                return (
                  <button
                    key={mt.value}
                    onClick={() => setMeetingType(mt.value)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "10px 12px", borderRadius: 10,
                      background: selected ? "linear-gradient(135deg, #059669, #10b981)" : "white",
                      color: selected ? "white" : "var(--balboa-text-secondary)",
                      border: selected ? "none" : "1px solid var(--balboa-border)",
                      cursor: "pointer", fontSize: 12, fontWeight: 600,
                      transition: "all 0.2s ease",
                      boxShadow: selected ? "0 2px 8px rgba(5,150,105,0.25)" : "none",
                    }}
                  >
                    <Icon className="w-4 h-4" style={{ flexShrink: 0 }} />
                    {mt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Meeting Message */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-navy)" }}>
                Meeting Request Message
              </label>
              <button
                onClick={handleGenerate}
                disabled={generating}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "6px 12px", borderRadius: 8,
                  background: "linear-gradient(135deg, var(--balboa-navy), var(--balboa-blue))",
                  color: "white", border: "none", cursor: generating ? "not-allowed" : "pointer",
                  fontSize: 11, fontWeight: 600, opacity: generating ? 0.7 : 1,
                  transition: "all 0.2s ease",
                }}
              >
                {generating ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...</>
                ) : (
                  <><Sparkles className="w-3.5 h-3.5" /> Generate with AI</>
                )}
              </button>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Click 'Generate with AI' to create a personalized meeting request, or type your own message..."
              rows={6}
              style={{
                width: "100%", padding: 12, borderRadius: 10,
                border: "1px solid var(--balboa-border)", fontSize: 13,
                color: "var(--balboa-navy)", background: "white",
                resize: "vertical", lineHeight: 1.5, outline: "none",
                fontFamily: "inherit",
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 13 }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!message.trim()}
            className="btn-primary"
            style={{
              fontSize: 13, opacity: !message.trim() ? 0.5 : 1,
              cursor: !message.trim() ? "not-allowed" : "pointer",
            }}
          >
            <Calendar className="w-4 h-4" style={{ marginRight: 4 }} />
            Save Meeting Draft
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
}
