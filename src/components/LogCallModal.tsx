"use client";

import { useState, useMemo } from "react";
import { Phone, X, Link2, Clock, Sparkles, Plus, Check } from "lucide-react";
import type { Lead, CallLog, CallOutcome } from "@/lib/types";
import { CALL_OUTCOME_TEMPLATES } from "@/lib/mock-data";

interface LogCallModalProps {
  leads: Lead[];
  onClose: () => void;
  onSubmit: (data: {
    callLog: CallLog;
    leadId: string;
    generatedDrafts: { type: CallOutcome["type"]; subject: string; body: string }[];
  }) => void;
}

type OutcomeType = CallOutcome["type"];

const OUTCOME_LABELS: Record<OutcomeType, { label: string; keywords: string[] }> = {
  send_email: { label: "Send Email", keywords: ["email", "send", "write", "info", "information", "details"] },
  send_deck: { label: "Send Deck", keywords: ["deck", "presentation", "slides", "ppt", "pitch"] },
  send_loom: { label: "Send Loom", keywords: ["loom", "video", "walkthrough", "recording", "demo video", "screen"] },
  send_case_study: { label: "Case Study", keywords: ["case study", "case", "example", "success story", "reference"] },
  schedule_followup: { label: "Schedule Follow-up", keywords: ["follow up", "followup", "schedule", "next call", "next meeting", "book"] },
  custom: { label: "Custom", keywords: [] },
};

const DURATION_OPTIONS = ["5 min", "10 min", "15 min", "30 min", "60 min"];

function detectPlatform(url: string): CallLog["platform"] {
  if (url.includes("meet.google.com")) return "google_meet";
  if (url.includes("teams.microsoft.com")) return "teams";
  if (url.includes("amplemarket")) return "amplemarket";
  return "other";
}

function detectOutcomes(notes: string): OutcomeType[] {
  const lower = notes.toLowerCase();
  const detected: OutcomeType[] = [];
  for (const [type, { keywords }] of Object.entries(OUTCOME_LABELS) as [OutcomeType, { label: string; keywords: string[] }][]) {
    if (type === "custom") continue;
    if (keywords.some((kw) => lower.includes(kw))) {
      detected.push(type);
    }
  }
  return detected;
}

export default function LogCallModal({ leads, onClose, onSubmit }: LogCallModalProps) {
  const [callLink, setCallLink] = useState("");
  const [leadSearch, setLeadSearch] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState<string | null>(null);
  const [activeOutcomes, setActiveOutcomes] = useState<Set<OutcomeType>>(new Set());
  const [showLeadDropdown, setShowLeadDropdown] = useState(false);

  // Auto-detect outcomes from notes
  const detectedOutcomes = useMemo(() => detectOutcomes(notes), [notes]);

  // Merge detected + manually toggled
  const allActiveOutcomes = useMemo(() => {
    const merged = new Set(activeOutcomes);
    detectedOutcomes.forEach((o) => merged.add(o));
    return merged;
  }, [activeOutcomes, detectedOutcomes]);

  // Filter leads
  const filteredLeads = useMemo(() => {
    if (!leadSearch.trim()) return leads.slice(0, 8);
    const q = leadSearch.toLowerCase();
    return leads.filter((l) =>
      `${l.firstName} ${l.lastName} ${l.company}`.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [leads, leadSearch]);

  const selectedLead = leads.find((l) => l.id === selectedLeadId);

  const toggleOutcome = (type: OutcomeType) => {
    setActiveOutcomes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const handleSubmit = () => {
    if (!selectedLeadId || !selectedLead) return;

    const outcomes: CallOutcome[] = Array.from(allActiveOutcomes).map((type) => ({
      type,
      description: OUTCOME_LABELS[type].label,
      completed: false,
    }));

    const generatedDrafts = outcomes
      .filter((o) => o.type !== "custom")
      .map((o) => {
        const template = CALL_OUTCOME_TEMPLATES[o.type];
        return {
          type: o.type,
          subject: template.subject
            .replace("{firstName}", selectedLead.firstName)
            .replace("{company}", selectedLead.company)
            .replace("{industry}", selectedLead.companyIntel?.industry || "supply chain"),
          body: template.body
            .replace(/{firstName}/g, selectedLead.firstName)
            .replace(/{company}/g, selectedLead.company)
            .replace(/{industry}/g, selectedLead.companyIntel?.industry || "supply chain"),
        };
      });

    const callLog: CallLog = {
      id: `call-${Date.now()}`,
      leadId: selectedLeadId,
      callLink: callLink || undefined,
      platform: callLink ? detectPlatform(callLink) : "phone",
      date: new Date().toISOString(),
      duration: duration || undefined,
      notes,
      outcomes,
      generatedDrafts: generatedDrafts.map((_, i) => `draft-gen-${Date.now()}-${i}`),
      generatedReminders: outcomes
        .filter((o) => o.type === "schedule_followup")
        .map((_, i) => `reminder-gen-${Date.now()}-${i}`),
    };

    onSubmit({ callLog, leadId: selectedLeadId, generatedDrafts });
  };

  const canSubmit = selectedLeadId && notes.trim().length > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#e8faf0", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Phone className="w-4.5 h-4.5" style={{ color: "#059669" }} />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)", margin: 0 }}>Log a Call</h3>
              <p style={{ fontSize: 12, color: "var(--balboa-text-muted)", margin: 0 }}>Auto-generates drafts and reminders</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--balboa-text-muted)", padding: 4 }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Lead selector */}
          <div style={{ position: "relative" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-text-muted)", marginBottom: 4, display: "block" }}>
              Lead *
            </label>
            {selectedLead ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--balboa-bg-alt)", borderRadius: 8, border: "1px solid var(--balboa-border)" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-navy)" }}>
                  {selectedLead.firstName} {selectedLead.lastName}
                </span>
                <span style={{ fontSize: 12, color: "var(--balboa-text-muted)" }}>at {selectedLead.company}</span>
                <button onClick={() => { setSelectedLeadId(null); setLeadSearch(""); }} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--balboa-text-muted)" }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  placeholder="Search by name or company..."
                  value={leadSearch}
                  onChange={(e) => { setLeadSearch(e.target.value); setShowLeadDropdown(true); }}
                  onFocus={() => setShowLeadDropdown(true)}
                  style={{ width: "100%" }}
                />
                {showLeadDropdown && filteredLeads.length > 0 && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
                    background: "white", border: "1px solid var(--balboa-border)", borderRadius: 8,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 10, maxHeight: 200, overflowY: "auto",
                  }}>
                    {filteredLeads.map((lead) => (
                      <div key={lead.id}
                        onClick={() => { setSelectedLeadId(lead.id); setShowLeadDropdown(false); setLeadSearch(""); }}
                        style={{
                          padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                          borderBottom: "1px solid var(--balboa-border-light)", transition: "background 0.1s",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--balboa-bg-hover)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ""; }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-navy)" }}>
                          {lead.firstName} {lead.lastName}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--balboa-text-muted)" }}>{lead.company}</span>
                        <span className={`badge badge-${lead.icpScore.tier}`} style={{ marginLeft: "auto", fontSize: 10 }}>
                          {lead.icpScore.overall}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Call link */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-text-muted)", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              <Link2 className="w-3 h-3" /> Call Link <span style={{ fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              type="text"
              placeholder="https://meet.google.com/... or teams/amplemarket link"
              value={callLink}
              onChange={(e) => setCallLink(e.target.value)}
              style={{ width: "100%" }}
            />
            {callLink && (
              <span style={{ fontSize: 11, color: "#059669", marginTop: 2, display: "block" }}>
                Detected: {detectPlatform(callLink).replace("_", " ")}
              </span>
            )}
          </div>

          {/* Duration pills */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-text-muted)", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
              <Clock className="w-3 h-3" /> Duration <span style={{ fontWeight: 400 }}>(optional)</span>
            </label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DURATION_OPTIONS.map((d) => (
                <button key={d}
                  className={`duration-pill ${duration === d ? "active" : ""}`}
                  onClick={() => setDuration(duration === d ? null : d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-text-muted)", marginBottom: 4, display: "block" }}>
              Call Notes *
            </label>
            <textarea
              rows={4}
              placeholder="What did you discuss? What did they ask for? e.g. 'They asked for a deck and a Loom walkthrough of our dashboard...'"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Auto-detected outcomes */}
          {(allActiveOutcomes.size > 0 || notes.length > 0) && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-text-muted)", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                <Sparkles className="w-3 h-3" style={{ color: "#059669" }} />
                {detectedOutcomes.length > 0 ? "Auto-detected Actions" : "Actions"}
              </label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(Object.entries(OUTCOME_LABELS) as [OutcomeType, { label: string; keywords: string[] }][])
                  .filter(([type]) => type !== "custom")
                  .map(([type, { label }]) => {
                    const isActive = allActiveOutcomes.has(type);
                    const isDetected = detectedOutcomes.includes(type);
                    return (
                      <button key={type}
                        className={`outcome-chip ${isActive ? "active" : ""}`}
                        onClick={() => toggleOutcome(type)}
                      >
                        {isActive ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                        {label}
                        {isDetected && <Sparkles className="w-2.5 h-2.5" style={{ color: "#059669" }} />}
                      </button>
                    );
                  })}
              </div>
              {allActiveOutcomes.size > 0 && (
                <p style={{ fontSize: 11, color: "#059669", marginTop: 6 }}>
                  ✓ Will generate {allActiveOutcomes.size} draft{allActiveOutcomes.size > 1 ? "s" : ""} and reminder{allActiveOutcomes.size > 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{ opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? "pointer" : "not-allowed" }}
          >
            <Phone className="w-3.5 h-3.5" />
            Log Call{allActiveOutcomes.size > 0 ? ` + ${allActiveOutcomes.size} Draft${allActiveOutcomes.size > 1 ? "s" : ""}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
