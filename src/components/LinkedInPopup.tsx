"use client";

import { useState } from "react";
import { X, Linkedin, Sparkles, Loader2, Copy, ExternalLink, User } from "lucide-react";
import type { Lead, SupportedLanguage } from "@/lib/types";

interface LinkedInPopupProps {
  lead: Lead;
  onClose: () => void;
  onSend: (data: { body: string }) => void;
  language: SupportedLanguage;
  initialBody?: string;
  initialDraftId?: string;
}

const LINKEDIN_CHAR_LIMIT = 300;

function getSalesNavUrl(linkedinUrl: string): string {
  // Convert regular LinkedIn URL to Sales Navigator search
  const name = linkedinUrl.split("/in/")[1]?.replace(/\/$/, "") || "";
  if (name) {
    return `https://www.linkedin.com/sales/search/people?query=(keywords:${encodeURIComponent(name)})`;
  }
  return "https://www.linkedin.com/sales/home";
}

export default function LinkedInPopup({
  lead,
  onClose,
  onSend,
  language,
  initialBody = "",
}: LinkedInPopupProps) {
  const [body, setBody] = useState(initialBody);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const charCount = body.length;
  const isOverLimit = charCount > LINKEDIN_CHAR_LIMIT;

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const resp = await fetch("/api/generate-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead,
          messageType: "connection_followup",
          context: `Write a concise LinkedIn message (under ${LINKEDIN_CHAR_LIMIT} characters) to ${lead.firstName} ${lead.lastName}, ${lead.position} at ${lead.company}. Be professional but warm.`,
          language,
          channel: "linkedin",
        }),
      });
      const data = await resp.json();
      if (data.message?.body) {
        setBody(data.message.body);
      }
    } catch {
      setBody(
        `Hi ${lead.firstName},\n\nI noticed your work at ${lead.company} and would love to connect. I think there could be some great synergies between what we're doing and your team's goals.\n\nWould you be open to a quick chat?`
      );
    }
    setGenerating(false);
  };

  const handleCopyAndOpen = () => {
    navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    // Open LinkedIn profile
    const url = lead.linkedinUrl
      || `https://linkedin.com/search/results/people/?keywords=${encodeURIComponent(
        lead.firstName + " " + lead.lastName + " " + lead.company
      )}`;
    window.open(url, "_blank");

    // Notify parent
    onSend({ body });
  };

  const profileUrl = lead.linkedinUrl || "";
  const profileHandle = profileUrl ? profileUrl.replace("https://www.linkedin.com/in/", "").replace("https://linkedin.com/in/", "").replace(/\/$/, "") : "";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg, #0077b5, #00a0dc)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Linkedin className="w-5 h-5" style={{ color: "white" }} />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--balboa-navy)", margin: 0 }}>
                LinkedIn Message
              </h3>
              <p style={{ fontSize: 12, color: "var(--balboa-text-muted)", margin: 0 }}>
                to {lead.firstName} {lead.lastName}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost"><X className="w-4 h-4" /></button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Profile Preview */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: 12, borderRadius: 10,
            background: "var(--balboa-bg-alt)", border: "1px solid var(--balboa-border-light)",
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: "linear-gradient(135deg, #0077b5, #00a0dc)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <User className="w-5 h-5" style={{ color: "white" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--balboa-navy)", margin: 0, lineHeight: 1.3 }}>
                {lead.firstName} {lead.lastName}
              </p>
              <p style={{ fontSize: 12, color: "var(--balboa-text-secondary)", margin: 0 }}>
                {lead.position} @ {lead.company}
              </p>
              {profileHandle && (
                <p style={{ fontSize: 11, color: "#0077b5", margin: "2px 0 0 0" }}>
                  linkedin.com/in/{profileHandle}
                </p>
              )}
            </div>
          </div>

          {/* Quick links */}
          <div style={{ display: "flex", gap: 8 }}>
            {profileUrl && (
              <button
                onClick={() => window.open(getSalesNavUrl(profileUrl), "_blank")}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "6px 12px", borderRadius: 8, flex: 1,
                  background: "white", border: "1px solid #b3d4fc",
                  color: "#0077b5", cursor: "pointer",
                  fontSize: 11, fontWeight: 600, transition: "all 0.2s ease",
                }}
              >
                <Linkedin className="w-3 h-3" /> Sales Navigator
                <ExternalLink className="w-3 h-3" style={{ marginLeft: "auto", opacity: 0.5 }} />
              </button>
            )}
            <button
              onClick={() => {
                const url = lead.linkedinUrl
                  || `https://linkedin.com/search/results/people/?keywords=${encodeURIComponent(lead.firstName + " " + lead.lastName)}`;
                window.open(url, "_blank");
              }}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "6px 12px", borderRadius: 8, flex: 1,
                background: "white", border: "1px solid #b3d4fc",
                color: "#0077b5", cursor: "pointer",
                fontSize: 11, fontWeight: 600, transition: "all 0.2s ease",
              }}
            >
              <User className="w-3 h-3" /> View Profile
              <ExternalLink className="w-3 h-3" style={{ marginLeft: "auto", opacity: 0.5 }} />
            </button>
          </div>

          {/* Message */}
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
                  background: "linear-gradient(135deg, #0077b5, #00a0dc)",
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
              placeholder="Click 'Generate with AI' to create a personalized LinkedIn message, or type your own..."
              rows={6}
              style={{
                width: "100%", padding: 12, borderRadius: 10,
                border: `1px solid ${isOverLimit ? "#ef4444" : "var(--balboa-border)"}`,
                fontSize: 13,
                color: "var(--balboa-navy)", background: "white",
                resize: "vertical", lineHeight: 1.5, outline: "none",
                fontFamily: "inherit",
              }}
            />
            {/* Character counter */}
            <div style={{
              display: "flex", justifyContent: "flex-end", marginTop: 4,
            }}>
              <span style={{
                fontSize: 11, fontWeight: 600,
                color: isOverLimit ? "#ef4444" : charCount > LINKEDIN_CHAR_LIMIT * 0.8 ? "#f59e0b" : "var(--balboa-text-muted)",
              }}>
                {charCount}/{LINKEDIN_CHAR_LIMIT}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 13 }}>
            Cancel
          </button>
          <button
            onClick={handleCopyAndOpen}
            disabled={!body.trim() || isOverLimit}
            className="btn-primary"
            style={{
              fontSize: 13,
              opacity: (!body.trim() || isOverLimit) ? 0.5 : 1,
              cursor: (!body.trim() || isOverLimit) ? "not-allowed" : "pointer",
              background: "linear-gradient(135deg, #0077b5, #00a0dc)",
            }}
          >
            {copied ? (
              <><Copy className="w-4 h-4" style={{ marginRight: 4 }} /> Copied!</>
            ) : (
              <><Copy className="w-4 h-4" style={{ marginRight: 4 }} /> Copy & Open LinkedIn</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
