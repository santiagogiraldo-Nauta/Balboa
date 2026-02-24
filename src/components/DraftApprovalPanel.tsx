"use client";

import { useState } from "react";
import { MessageSquare, Copy, CheckCircle, XCircle, Send, Linkedin, AtSign, ChevronDown, ChevronUp, Mail } from "lucide-react";
import type { Lead, DraftMessage } from "@/lib/types";

interface DraftApprovalPanelProps {
  drafts: DraftMessage[];
  lead: Lead;
  onApprove: (draftId: string) => void;
  onReject: (draftId: string) => void;
  onSendViaEmail: (draft: DraftMessage) => void;
  onSendViaLinkedIn: (draft: DraftMessage) => void;
  onCopy: (text: string) => void;
  onGenerateLinkedIn?: () => void;
  onGenerateEmail?: () => void;
  onGenerateProposal?: () => void;
  generatingAction?: string | null;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  draft: { bg: "#fef3c7", text: "#92400e", border: "#fde68a" },
  approved: { bg: "#d1fae5", text: "#065f46", border: "#a7f3d0" },
  rejected: { bg: "#fee2e2", text: "#991b1b", border: "#fecaca" },
  sent: { bg: "#dbeafe", text: "#1e40af", border: "#bfdbfe" },
};

export default function DraftApprovalPanel({
  drafts,
  lead,
  onApprove,
  onReject,
  onSendViaEmail,
  onSendViaLinkedIn,
  onCopy,
  onGenerateLinkedIn,
  onGenerateEmail,
  onGenerateProposal,
  generatingAction,
}: DraftApprovalPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h4 style={{
          fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
          color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em",
        }}>
          <MessageSquare className="w-3.5 h-3.5" style={{ color: "var(--balboa-navy)" }} />
          Draft Messages
          {drafts.length > 0 && (
            <span style={{
              background: "var(--balboa-navy)", color: "white",
              fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 10,
            }}>
              {drafts.length}
            </span>
          )}
        </h4>
        <div style={{ display: "flex", gap: 2 }}>
          {onGenerateLinkedIn && (
            <button onClick={onGenerateLinkedIn} disabled={!!generatingAction}
              className="btn-ghost" style={{ fontSize: 10, opacity: generatingAction ? 0.5 : 1 }}>
              + LinkedIn
            </button>
          )}
          {onGenerateEmail && (
            <button onClick={onGenerateEmail} disabled={!!generatingAction}
              className="btn-ghost" style={{ fontSize: 10, opacity: generatingAction ? 0.5 : 1 }}>
              + Email
            </button>
          )}
          {onGenerateProposal && (
            <button onClick={onGenerateProposal} disabled={!!generatingAction}
              className="btn-ghost" style={{ fontSize: 10, opacity: generatingAction ? 0.5 : 1 }}>
              + Proposal
            </button>
          )}
        </div>
      </div>

      {/* Drafts list */}
      {drafts.length === 0 ? (
        <p style={{ fontSize: 12, fontStyle: "italic", color: "var(--balboa-text-muted)", padding: "12px 0" }}>
          No drafts yet. Generate one above or use the action buttons.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {drafts.map((d) => {
            const isExpanded = expandedIds.has(d.id);
            const statusColor = STATUS_COLORS[d.status] || STATUS_COLORS.draft;
            const preview = d.subject || d.body.substring(0, 60) + (d.body.length > 60 ? "..." : "");

            return (
              <div key={d.id} style={{
                borderRadius: 10, overflow: "hidden",
                background: "var(--balboa-bg-alt)",
                border: "1px solid var(--balboa-border-light)",
                transition: "all 0.2s ease",
              }}>
                {/* Collapsed header — always visible */}
                <button
                  onClick={() => toggleExpand(d.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "10px 14px", border: "none", background: "transparent",
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  {/* Channel icon */}
                  <span style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                    background: d.channel === "linkedin" ? "#e0f2fe" : "#ede9fe",
                  }}>
                    {d.channel === "linkedin"
                      ? <Linkedin className="w-3 h-3" style={{ color: "#0077b5" }} />
                      : <AtSign className="w-3 h-3" style={{ color: "#7c3aed" }} />}
                  </span>

                  {/* Preview text */}
                  <span style={{
                    flex: 1, fontSize: 12, fontWeight: 500, color: "var(--balboa-navy)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {preview}
                  </span>

                  {/* Status badge */}
                  <span style={{
                    fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                    padding: "2px 8px", borderRadius: 10, letterSpacing: "0.03em",
                    background: statusColor.bg, color: statusColor.text, border: `1px solid ${statusColor.border}`,
                    flexShrink: 0,
                  }}>
                    {d.status}
                  </span>

                  {/* Expand chevron */}
                  {isExpanded
                    ? <ChevronUp className="w-3.5 h-3.5" style={{ color: "var(--balboa-text-muted)", flexShrink: 0 }} />
                    : <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--balboa-text-muted)", flexShrink: 0 }} />}
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ padding: "0 14px 12px 14px" }}>
                    {/* Type + channel pills */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--balboa-navy)", letterSpacing: "0.03em" }}>
                        {d.type?.replace(/_/g, " ").toUpperCase()}
                      </span>
                      <span className={`channel-pill ${d.channel === "linkedin" ? "channel-linkedin" : "channel-email"}`}>
                        {d.channel === "linkedin" ? <Linkedin className="w-3 h-3" /> : <AtSign className="w-3 h-3" />}
                        {d.channel}
                      </span>
                    </div>

                    {/* Subject (if email) */}
                    {d.subject && (
                      <p style={{
                        fontSize: 12, fontWeight: 600, color: "var(--balboa-navy)",
                        marginBottom: 6, lineHeight: 1.4,
                      }}>
                        Subject: {d.subject}
                      </p>
                    )}

                    {/* Full body */}
                    <p style={{
                      fontSize: 12, whiteSpace: "pre-wrap", marginBottom: 10,
                      color: "var(--balboa-text-secondary)", lineHeight: 1.5,
                      maxHeight: 200, overflowY: "auto",
                    }}>
                      {d.body}
                    </p>

                    {/* Actions */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap",
                      borderTop: "1px solid var(--balboa-border-light)", paddingTop: 8,
                    }}>
                      <button onClick={() => onCopy(d.body)} className="btn-ghost" style={{ fontSize: 11 }}>
                        <Copy className="w-3 h-3" /> Copy
                      </button>

                      {d.status === "draft" && (
                        <>
                          <button onClick={() => onApprove(d.id)}
                            className="btn-ghost" style={{ fontSize: 11, color: "var(--balboa-green)" }}>
                            <CheckCircle className="w-3 h-3" /> Approve
                          </button>
                          <button onClick={() => onReject(d.id)}
                            className="btn-ghost" style={{ fontSize: 11, color: "var(--balboa-red)" }}>
                            <XCircle className="w-3 h-3" /> Reject
                          </button>
                        </>
                      )}

                      {d.status === "approved" && (
                        <>
                          {d.channel === "linkedin" ? (
                            <button onClick={() => onSendViaLinkedIn(d)}
                              className="btn-ghost" style={{ fontSize: 11, color: "#0077b5", fontWeight: 700 }}>
                              <Send className="w-3 h-3" /> Send via LinkedIn
                            </button>
                          ) : (
                            <button onClick={() => onSendViaEmail(d)}
                              className="btn-ghost" style={{ fontSize: 11, color: "var(--balboa-green)", fontWeight: 700 }}>
                              <Mail className="w-3 h-3" /> Send Email
                            </button>
                          )}
                          {/* Secondary: Copy & Open */}
                          {d.channel === "linkedin" && (
                            <button onClick={() => {
                              onCopy(d.body);
                              const url = lead.linkedinUrl
                                || `https://linkedin.com/search/results/people/?keywords=${encodeURIComponent(lead.firstName + " " + lead.lastName + " " + lead.company)}`;
                              window.open(url, "_blank");
                            }} className="btn-ghost" style={{ fontSize: 11, color: "#0077b5" }}>
                              <Copy className="w-3 h-3" /> Copy & Open
                            </button>
                          )}
                        </>
                      )}

                      {d.status === "sent" && (
                        <span style={{
                          fontSize: 10, color: "var(--balboa-green)", fontWeight: 600,
                          display: "flex", alignItems: "center", gap: 4,
                        }}>
                          <CheckCircle className="w-3 h-3" /> Sent
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
