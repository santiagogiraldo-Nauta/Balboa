"use client";

import { useState } from "react";
import { X, Mail, Sparkles, Loader2, Send, Globe, AlertCircle } from "lucide-react";
import type { Lead, SupportedLanguage } from "@/lib/types";

interface EmailPopupProps {
  lead: Lead;
  onClose: () => void;
  onSend: (data: { subject: string; body: string }) => void;
  language: SupportedLanguage;
  initialSubject?: string;
  initialBody?: string;
  initialDraftId?: string;
}

function extractDomain(email: string): string {
  const parts = email.split("@");
  return parts.length > 1 ? parts[1] : "";
}

export default function EmailPopup({
  lead,
  onClose,
  onSend,
  language,
  initialSubject = "",
  initialBody = "",
}: EmailPopupProps) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [manualEmail, setManualEmail] = useState("");

  const email = lead.email || manualEmail;
  const domain = email ? extractDomain(email) : "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasHubspot = !!(lead as any).hubspotDealId;

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const resp = await fetch("/api/generate-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead,
          messageType: "email_initial",
          context: `Compose a professional email to ${lead.firstName} ${lead.lastName} at ${lead.company}. Their position is ${lead.position}.`,
          language,
          channel: "email",
        }),
      });
      const data = await resp.json();
      if (data.message?.subject) setSubject(data.message.subject);
      if (data.message?.body) setBody(data.message.body);
    } catch {
      setSubject(`Connecting with ${lead.company}`);
      setBody(
        `Hi ${lead.firstName},\n\nI came across your profile and was impressed by your work at ${lead.company}. I'd love to explore how we might be able to collaborate.\n\nWould you be open to a brief conversation this week?\n\nBest regards`
      );
    }
    setGenerating(false);
  };

  const handleSend = async () => {
    if (!body.trim() || !subject.trim()) return;
    setSending(true);
    try {
      onSend({ subject, body });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg, var(--balboa-navy), var(--balboa-blue))",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Mail className="w-5 h-5" style={{ color: "white" }} />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--balboa-navy)", margin: 0 }}>
                Compose Email
              </h3>
              <p style={{ fontSize: 12, color: "var(--balboa-text-muted)", margin: 0 }}>
                to {lead.firstName} {lead.lastName} @ {lead.company}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost"><X className="w-4 h-4" /></button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* To field */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-navy)", marginBottom: 6, display: "block" }}>
              <Mail className="w-3.5 h-3.5" style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
              To
            </label>
            {lead.email ? (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 12px", borderRadius: 10,
                background: "var(--balboa-bg-alt)", border: "1px solid var(--balboa-border)",
              }}>
                <span style={{ fontSize: 13, color: "var(--balboa-navy)", fontWeight: 500 }}>{lead.email}</span>
                {domain && (
                  <span style={{
                    display: "flex", alignItems: "center", gap: 4,
                    fontSize: 11, color: "var(--balboa-text-muted)", fontWeight: 500,
                  }}>
                    <Globe className="w-3 h-3" /> {domain}
                  </span>
                )}
              </div>
            ) : (
              <div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 6, marginBottom: 6,
                  padding: "8px 10px", borderRadius: 8,
                  background: "#fef3c7", border: "1px solid #fde68a",
                }}>
                  <AlertCircle className="w-3.5 h-3.5" style={{ color: "#92400e", flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: "#92400e" }}>No email on file. Enter one below or generate the message as a draft.</span>
                </div>
                <input
                  type="email"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  placeholder="Enter email address..."
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 10,
                    border: "1px solid var(--balboa-border)", fontSize: 13,
                    color: "var(--balboa-navy)", background: "white", outline: "none",
                  }}
                />
              </div>
            )}
          </div>

          {/* Subject */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-navy)", marginBottom: 6, display: "block" }}>
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject line..."
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 10,
                border: "1px solid var(--balboa-border)", fontSize: 13,
                color: "var(--balboa-navy)", background: "white", outline: "none",
              }}
            />
          </div>

          {/* Message Body */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-navy)" }}>
                Message
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
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Click 'Generate with AI' to create a personalized email, or type your own message..."
              rows={8}
              style={{
                width: "100%", padding: 12, borderRadius: 10,
                border: "1px solid var(--balboa-border)", fontSize: 13,
                color: "var(--balboa-navy)", background: "white",
                resize: "vertical", lineHeight: 1.5, outline: "none",
                fontFamily: "inherit",
              }}
            />
          </div>

          {/* Status indicators */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, paddingTop: 4 }}>
            <span style={{
              display: "flex", alignItems: "center", gap: 4,
              fontSize: 11, color: hasHubspot ? "var(--balboa-green)" : "var(--balboa-text-muted)",
              fontWeight: 500,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: hasHubspot ? "var(--balboa-green)" : "#d1d5db",
              }} />
              HubSpot: {hasHubspot ? "Tracking active" : "Not connected"}
            </span>
            {domain && (
              <span style={{
                display: "flex", alignItems: "center", gap: 4,
                fontSize: 11, color: "var(--balboa-text-muted)", fontWeight: 500,
              }}>
                <Globe className="w-3 h-3" /> {domain}
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 13 }}>
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!body.trim() || !subject.trim() || sending}
            className="btn-primary"
            style={{
              fontSize: 13,
              opacity: (!body.trim() || !subject.trim() || sending) ? 0.5 : 1,
              cursor: (!body.trim() || !subject.trim() || sending) ? "not-allowed" : "pointer",
              background: "linear-gradient(135deg, var(--balboa-navy), var(--balboa-blue))",
            }}
          >
            {sending ? (
              <><Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: 4 }} /> Sending...</>
            ) : (
              <><Send className="w-4 h-4" style={{ marginRight: 4 }} /> Send Email</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
