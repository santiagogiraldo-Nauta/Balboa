"use client";

import { useState, useEffect } from "react";
import { X, FileText, Sparkles, Loader2, Save } from "lucide-react";
import type { Lead, SupportedLanguage } from "@/lib/types";
import { trackEventClient } from "@/lib/tracking";

export type ProposalDocType = "scope_of_work" | "proposal" | "deck" | "case_study" | "one_pager";

interface ProposalCreatorPopupProps {
  lead: Lead;
  onClose: () => void;
  onSend: (data: { subject: string; body: string; docType: ProposalDocType }) => void;
  language: SupportedLanguage;
}

const DOC_TYPES: { value: ProposalDocType; label: string }[] = [
  { value: "scope_of_work", label: "Scope of Work" },
  { value: "proposal", label: "Proposal" },
  { value: "deck", label: "Deck" },
  { value: "case_study", label: "Case Study" },
  { value: "one_pager", label: "One Pager" },
];

export default function ProposalCreatorPopup({
  lead,
  onClose,
  onSend,
  language,
}: ProposalCreatorPopupProps) {
  const [docType, setDocType] = useState<ProposalDocType>("proposal");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    trackEventClient({ eventCategory: "outreach", eventAction: "proposal_popup_opened", leadId: lead.id, channel: "email" });
  }, []);

  const docLabel = DOC_TYPES.find(d => d.value === docType)?.label || docType;

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const context = `Create a ${docLabel} email for ${lead.firstName} ${lead.lastName} at ${lead.company} (${lead.position}). The document type is "${docLabel}". Write a professional email body that introduces the ${docLabel.toLowerCase()} and highlights key value propositions tailored to their company and role.`;
      const resp = await fetch("/api/generate-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead,
          messageType: "value_share",
          context,
          language,
          channel: "email",
        }),
      });
      const data = await resp.json();
      if (data.message?.subject) setSubject(data.message.subject);
      if (data.message?.body) setBody(data.message.body);
      trackEventClient({ eventCategory: "outreach", eventAction: "proposal_ai_generated", leadId: lead.id, channel: "email", metadata: { docType } });
    } catch {
      setSubject(`${docLabel} for ${lead.company}`);
      setBody(
        `Dear ${lead.firstName},\n\nThank you for the conversation. As discussed, please find attached our ${docLabel.toLowerCase()} outlining how we can help ${lead.company} achieve its goals.\n\nKey highlights:\n- [Value proposition 1]\n- [Value proposition 2]\n- [Expected outcomes]\n\nI'd love to schedule a follow-up call to walk through the details. Would next week work for you?\n\nBest regards`
      );
    }
    setGenerating(false);
  };

  const handleSave = () => {
    if (!body.trim() || !subject.trim()) return;
    onSend({ subject, body, docType });
    trackEventClient({ eventCategory: "outreach", eventAction: "proposal_saved_as_draft", leadId: lead.id, channel: "email", metadata: { docType } });
  };

  return (
    <div className="modal-overlay" onClick={() => { trackEventClient({ eventCategory: "outreach", eventAction: "proposal_popup_closed", leadId: lead.id, channel: "email" }); onClose(); }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580 }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg, #7c3aed, #a855f7)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <FileText className="w-5 h-5" style={{ color: "white" }} />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--balboa-navy)", margin: 0 }}>
                Create Proposal
              </h3>
              <p style={{ fontSize: 12, color: "var(--balboa-text-muted)", margin: 0 }}>
                for {lead.firstName} {lead.lastName} @ {lead.company}
              </p>
            </div>
          </div>
          <button onClick={() => { trackEventClient({ eventCategory: "outreach", eventAction: "proposal_popup_closed", leadId: lead.id, channel: "email" }); onClose(); }} className="btn-ghost"><X className="w-4 h-4" /></button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Document Type */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-navy)", marginBottom: 8, display: "block" }}>
              Document Type
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {DOC_TYPES.map((dt) => {
                const selected = docType === dt.value;
                return (
                  <button
                    key={dt.value}
                    onClick={() => {
                      setDocType(dt.value);
                      trackEventClient({ eventCategory: "outreach", eventAction: "proposal_doc_type_selected", leadId: lead.id, channel: "email", metadata: { docType: dt.value } });
                    }}
                    style={{
                      padding: "8px 14px", borderRadius: 20,
                      background: selected ? "linear-gradient(135deg, #7c3aed, #a855f7)" : "white",
                      color: selected ? "white" : "var(--balboa-text-secondary)",
                      border: selected ? "none" : "1px solid var(--balboa-border)",
                      cursor: "pointer", fontSize: 12, fontWeight: 600,
                      transition: "all 0.2s ease",
                      boxShadow: selected ? "0 2px 8px rgba(124,58,237,0.25)" : "none",
                    }}
                  >
                    {dt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subject */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-navy)", marginBottom: 6, display: "block" }}>
              Email Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={`${docLabel} for ${lead.company}...`}
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
                Email Body
              </label>
              <button
                onClick={handleGenerate}
                disabled={generating}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "6px 12px", borderRadius: 8,
                  background: "linear-gradient(135deg, #7c3aed, #a855f7)",
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
              placeholder={`Click 'Generate with AI' to create a personalized ${docLabel.toLowerCase()} email, or type your own...`}
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
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button onClick={() => { trackEventClient({ eventCategory: "outreach", eventAction: "proposal_popup_closed", leadId: lead.id, channel: "email" }); onClose(); }} className="btn-secondary" style={{ fontSize: 13 }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!body.trim() || !subject.trim()}
            className="btn-primary"
            style={{
              fontSize: 13,
              opacity: (!body.trim() || !subject.trim()) ? 0.5 : 1,
              cursor: (!body.trim() || !subject.trim()) ? "not-allowed" : "pointer",
              background: "linear-gradient(135deg, #7c3aed, #a855f7)",
            }}
          >
            <Save className="w-4 h-4" style={{ marginRight: 4 }} />
            Save as Draft
          </button>
        </div>
      </div>
    </div>
  );
}
