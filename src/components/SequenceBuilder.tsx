"use client";

import { useState, useMemo } from "react";
import {
  Play, Pause, Plus, Mail, Linkedin, Phone, Clock,
  ChevronRight, Users,
  AlertCircle, Eye, MessageSquare,
  X, Send,
} from "lucide-react";
import type { Lead } from "@/lib/types";

// ── Local types (will move to types.ts) ─────────────────────────────────────

type SequenceStatus = "active" | "paused" | "draft" | "completed";

interface SequenceStep {
  id: string;
  stepNumber: number;
  channel: "email" | "linkedin";
  type: string;
  subject?: string;
  body: string;
  delayDays: number;
  stats: { sent: number; opened: number; replied: number; bounced: number };
}

interface Sequence {
  id: string;
  name: string;
  description: string;
  status: SequenceStatus;
  steps: SequenceStep[];
  enrolledLeadIds: string[];
  createdAt: string;
  updatedAt: string;
  stats: { enrolled: number; completed: number; replied: number; meetings: number };
}

interface SequenceEnrollment {
  leadId: string;
  leadName: string;
  company: string;
  currentStep: number;
  status: "active" | "completed" | "replied" | "paused";
  enrolledAt: string;
}

// ── Mock data ───────────────────────────────────────────────────────────────

function generateMockSequences(leads: Lead[]): Sequence[] {
  const enrollableLeadIds = leads.slice(0, 6).map((l) => l.id);

  return [
    {
      id: "seq-1",
      name: "Hot Lead Outreach",
      description: "Aggressive 4-step sequence for hot leads showing strong buying signals",
      status: "active",
      steps: [
        {
          id: "step-1-1", stepNumber: 1, channel: "email", type: "Initial Email",
          subject: "Quick question about {company}'s supply chain",
          body: "Hi {firstName}, I noticed {company} is expanding operations. We help companies like yours reduce logistics costs by 20-30%...",
          delayDays: 0,
          stats: { sent: 45, opened: 32, replied: 12, bounced: 2 },
        },
        {
          id: "step-1-2", stepNumber: 2, channel: "linkedin", type: "LinkedIn Connection",
          body: "Hi {firstName}, I sent you an email about how Balboa can help {company} streamline supply chain operations. Would love to connect!",
          delayDays: 2,
          stats: { sent: 38, opened: 38, replied: 8, bounced: 0 },
        },
        {
          id: "step-1-3", stepNumber: 3, channel: "email", type: "Follow-up Email",
          subject: "Re: {company}'s supply chain optimization",
          body: "Hi {firstName}, following up on my previous email. I wanted to share a case study of how we helped a similar company save $2M annually...",
          delayDays: 3,
          stats: { sent: 30, opened: 22, replied: 9, bounced: 1 },
        },
        {
          id: "step-1-4", stepNumber: 4, channel: "email", type: "Break-up Email",
          subject: "Should I close your file?",
          body: "Hi {firstName}, I haven't heard back and don't want to be a nuisance. If timing isn't right, I completely understand. Would it be helpful if I reached out in Q3 instead?",
          delayDays: 5,
          stats: { sent: 22, opened: 18, replied: 6, bounced: 0 },
        },
      ],
      enrolledLeadIds: enrollableLeadIds.slice(0, 4),
      createdAt: "2026-01-15",
      updatedAt: "2026-02-20",
      stats: { enrolled: 45, completed: 22, replied: 15, meetings: 8 },
    },
    {
      id: "seq-2",
      name: "Warm Nurture",
      description: "Gentle 3-step sequence for warm leads who need more information",
      status: "active",
      steps: [
        {
          id: "step-2-1", stepNumber: 1, channel: "email", type: "Value-Add Email",
          subject: "Thought you'd find this useful, {firstName}",
          body: "Hi {firstName}, I came across this report on supply chain trends for {industry} and thought of {company}. Key takeaway: companies investing in visibility see 35% fewer stockouts...",
          delayDays: 0,
          stats: { sent: 62, opened: 41, replied: 8, bounced: 3 },
        },
        {
          id: "step-2-2", stepNumber: 2, channel: "linkedin", type: "LinkedIn Engage",
          body: "Great post about {topic}, {firstName}! At Balboa we see the same trend -- happy to share our data if useful.",
          delayDays: 5,
          stats: { sent: 55, opened: 55, replied: 11, bounced: 0 },
        },
        {
          id: "step-2-3", stepNumber: 3, channel: "email", type: "Soft CTA Email",
          subject: "15 min to explore how Balboa helps {industry}?",
          body: "Hi {firstName}, would you be open to a quick 15-min chat? No pitch, just want to understand your current challenges and see if there is a fit...",
          delayDays: 7,
          stats: { sent: 48, opened: 30, replied: 7, bounced: 2 },
        },
      ],
      enrolledLeadIds: enrollableLeadIds.slice(2, 5),
      createdAt: "2026-01-20",
      updatedAt: "2026-02-18",
      stats: { enrolled: 62, completed: 48, replied: 18, meetings: 6 },
    },
    {
      id: "seq-3",
      name: "Re-engagement",
      description: "2-step sequence for leads who went cold or stopped responding",
      status: "paused",
      steps: [
        {
          id: "step-3-1", stepNumber: 1, channel: "email", type: "Re-engagement Email",
          subject: "Still on your radar, {firstName}?",
          body: "Hi {firstName}, it has been a while since we connected. I wanted to share that we just launched a new feature that addresses exactly what you mentioned about {painPoint}...",
          delayDays: 0,
          stats: { sent: 28, opened: 15, replied: 4, bounced: 1 },
        },
        {
          id: "step-3-2", stepNumber: 2, channel: "email", type: "Last Chance Email",
          subject: "One last thing, {firstName}",
          body: "Hi {firstName}, I will assume timing is not right and will not reach out again. If things change, here is my calendar link. Wishing you and {company} all the best!",
          delayDays: 3,
          stats: { sent: 20, opened: 12, replied: 3, bounced: 0 },
        },
      ],
      enrolledLeadIds: enrollableLeadIds.slice(4, 6),
      createdAt: "2026-02-01",
      updatedAt: "2026-02-15",
      stats: { enrolled: 28, completed: 20, replied: 5, meetings: 2 },
    },
  ];
}

function generateEnrollments(sequence: Sequence, leads: Lead[]): SequenceEnrollment[] {
  return sequence.enrolledLeadIds.map((leadId, idx) => {
    const lead = leads.find((l) => l.id === leadId);
    const statuses: SequenceEnrollment["status"][] = ["active", "completed", "replied", "active"];
    return {
      leadId,
      leadName: lead ? `${lead.firstName} ${lead.lastName}` : `Lead ${idx + 1}`,
      company: lead?.company || "Unknown",
      currentStep: Math.min(idx + 1, sequence.steps.length),
      status: statuses[idx % statuses.length],
      enrolledAt: sequence.createdAt,
    };
  });
}

// ── Style helpers ───────────────────────────────────────────────────────────

const statusConfig: Record<SequenceStatus, { label: string; color: string; bg: string; border: string }> = {
  active: { label: "Active", color: "#2b8a3e", bg: "#ecfdf5", border: "#b2f2bb" },
  paused: { label: "Paused", color: "#d97706", bg: "#fffbeb", border: "#ffe066" },
  draft: { label: "Draft", color: "#868e96", bg: "#f8f9fa", border: "#dee2e6" },
  completed: { label: "Completed", color: "#3b5bdb", bg: "#eff6ff", border: "#bac8ff" },
};

const channelIcons: Record<string, { icon: typeof Mail; color: string; bg: string }> = {
  email: { icon: Mail, color: "#3b5bdb", bg: "#eff6ff" },
  linkedin: { icon: Linkedin, color: "#0077b5", bg: "#e8f4fd" },
  call: { icon: Phone, color: "#2b8a3e", bg: "#ecfdf5" },
};

const enrollmentStatusConfig: Record<string, { color: string; bg: string }> = {
  active: { color: "#3b5bdb", bg: "#eff6ff" },
  completed: { color: "#2b8a3e", bg: "#ecfdf5" },
  replied: { color: "#7c3aed", bg: "#f5f3ff" },
  paused: { color: "#d97706", bg: "#fffbeb" },
};

// ── Component ────────────────────────────────────────────────────────────────

export default function SequenceBuilder({
  leads,
  onNavigateToLead,
}: {
  leads: Lead[];
  onNavigateToLead: (leadId: string) => void;
}) {
  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSequenceName, setNewSequenceName] = useState("");
  const [newSequenceDesc, setNewSequenceDesc] = useState("");

  const sequences = useMemo(() => generateMockSequences(leads), [leads]);

  const selectedSequence = sequences.find((s) => s.id === selectedSequenceId) || null;

  const enrollments = useMemo(() => {
    if (!selectedSequence) return [];
    return generateEnrollments(selectedSequence, leads);
  }, [selectedSequence, leads]);

  const handleToggleStatus = (seqId: string) => {
    // In a real app, this would update state via API
    const seq = sequences.find((s) => s.id === seqId);
    if (seq) {
      // Toggle between active and paused (visual only in this mock)
    }
  };

  const handleCreateSequence = () => {
    if (!newSequenceName.trim()) return;
    // In a real app, this would create via API
    setShowCreateForm(false);
    setNewSequenceName("");
    setNewSequenceDesc("");
  };

  const cardStyle: React.CSSProperties = {
    background: "white",
    borderRadius: 12,
    border: "1px solid #f1f3f5",
    boxShadow: "0 1px 4px rgba(30,42,94,0.04)",
    padding: "20px 24px",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Header + Create Button ────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1e2a5e", margin: 0 }}>
            Sequence Builder
          </h3>
          <p style={{ fontSize: 12, color: "#868e96", margin: "4px 0 0" }}>
            Multi-step outreach sequences with enrollment management
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "10px 18px", borderRadius: 10,
            background: "linear-gradient(135deg, #1e2a5e, #3b5bdb)",
            color: "white", border: "none", cursor: "pointer",
            fontSize: 12, fontWeight: 600,
            boxShadow: "0 2px 8px rgba(30,42,94,0.25)",
          }}
        >
          <Plus style={{ width: 14, height: 14 }} />
          Create New Sequence
        </button>
      </div>

      {/* ── Create Form Modal ────────────────────────────────────────── */}
      {showCreateForm && (
        <div style={{
          ...cardStyle,
          border: "2px solid #3b5bdb",
          background: "linear-gradient(135deg, #f8f9ff, #ffffff)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h4 style={{ fontSize: 14, fontWeight: 700, color: "#1e2a5e", margin: 0 }}>New Sequence</h4>
            <button
              onClick={() => setShowCreateForm(false)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
            >
              <X style={{ width: 16, height: 16, color: "#868e96" }} />
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#868e96", display: "block", marginBottom: 4 }}>
                Sequence Name
              </label>
              <input
                type="text"
                value={newSequenceName}
                onChange={(e) => setNewSequenceName(e.target.value)}
                placeholder="e.g., Enterprise Cold Outreach"
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8,
                  border: "1px solid #f1f3f5", fontSize: 13, color: "#1e2a5e",
                  outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#868e96", display: "block", marginBottom: 4 }}>
                Description
              </label>
              <textarea
                value={newSequenceDesc}
                onChange={(e) => setNewSequenceDesc(e.target.value)}
                placeholder="Describe the purpose and target audience..."
                rows={3}
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8,
                  border: "1px solid #f1f3f5", fontSize: 13, color: "#1e2a5e",
                  outline: "none", resize: "vertical", fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowCreateForm(false)}
                style={{
                  padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: "white", color: "#868e96", border: "1px solid #f1f3f5",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSequence}
                style={{
                  padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: "#1e2a5e", color: "white", border: "none",
                  cursor: "pointer", opacity: newSequenceName.trim() ? 1 : 0.5,
                }}
              >
                Create as Draft
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sequence List ────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sequences.map((seq) => {
          const sc = statusConfig[seq.status];
          const isSelected = selectedSequenceId === seq.id;
          const replyRate = seq.stats.enrolled > 0
            ? Math.round((seq.stats.replied / seq.stats.enrolled) * 100)
            : 0;

          return (
            <div
              key={seq.id}
              onClick={() => setSelectedSequenceId(isSelected ? null : seq.id)}
              style={{
                ...cardStyle,
                cursor: "pointer",
                borderColor: isSelected ? "#3b5bdb" : "#f1f3f5",
                boxShadow: isSelected ? "0 0 0 2px rgba(59,91,219,0.15)" : cardStyle.boxShadow,
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {/* Status indicator */}
                <div style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: sc.color, flexShrink: 0,
                }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#1e2a5e" }}>
                      {seq.name}
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                      background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                      letterSpacing: "0.05em", textTransform: "uppercase",
                    }}>
                      {sc.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#868e96" }}>{seq.description}</div>
                </div>

                {/* Stats */}
                <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#868e96", fontWeight: 500 }}>Steps</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1e2a5e" }}>{seq.steps.length}</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#868e96", fontWeight: 500 }}>Enrolled</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#3b5bdb" }}>{seq.stats.enrolled}</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#868e96", fontWeight: 500 }}>Reply Rate</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#2b8a3e" }}>{replyRate}%</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#868e96", fontWeight: 500 }}>Meetings</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#7c3aed" }}>{seq.stats.meetings}</div>
                  </div>
                </div>

                {/* Pause/Resume */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleStatus(seq.id);
                  }}
                  style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: seq.status === "active" ? "#fffbeb" : "#ecfdf5",
                    border: `1px solid ${seq.status === "active" ? "#ffe066" : "#b2f2bb"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", flexShrink: 0,
                  }}
                  title={seq.status === "active" ? "Pause sequence" : "Resume sequence"}
                >
                  {seq.status === "active"
                    ? <Pause style={{ width: 14, height: 14, color: "#d97706" }} />
                    : <Play style={{ width: 14, height: 14, color: "#2b8a3e" }} />
                  }
                </button>

                <ChevronRight style={{
                  width: 16, height: 16, color: "#868e96",
                  transform: isSelected ? "rotate(90deg)" : "none",
                  transition: "transform 0.15s ease",
                }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Selected Sequence Detail ──────────────────────────────────── */}
      {selectedSequence && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Step Timeline */}
          <div style={cardStyle}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "#868e96",
              textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16,
            }}>
              Sequence Flow -- {selectedSequence.name}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 0, paddingLeft: 20 }}>
              {selectedSequence.steps.map((step, idx) => {
                const ch = channelIcons[step.channel];
                const ChannelIcon = ch.icon;
                const isLast = idx === selectedSequence.steps.length - 1;
                const openRate = step.stats.sent > 0
                  ? Math.round((step.stats.opened / step.stats.sent) * 100)
                  : 0;
                const replyRate = step.stats.sent > 0
                  ? Math.round((step.stats.replied / step.stats.sent) * 100)
                  : 0;

                return (
                  <div key={step.id}>
                    {/* Wait indicator (before step, except first) */}
                    {idx > 0 && (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "8px 0", marginLeft: -4,
                      }}>
                        <div style={{
                          width: 2, height: 24, background: "#dee2e6", marginLeft: 14,
                        }} />
                        <div style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "4px 10px", borderRadius: 12,
                          background: "#f8f9fa", border: "1px solid #f1f3f5",
                          fontSize: 10, color: "#868e96", fontWeight: 600,
                        }}>
                          <Clock style={{ width: 10, height: 10 }} />
                          Wait {step.delayDays} day{step.delayDays !== 1 ? "s" : ""}
                        </div>
                      </div>
                    )}

                    {/* Step card */}
                    <div style={{
                      display: "flex", alignItems: "flex-start", gap: 14,
                      position: "relative",
                    }}>
                      {/* Step number + icon */}
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: ch.bg, border: `1px solid ${ch.color}22`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, position: "relative",
                      }}>
                        <ChannelIcon style={{ width: 14, height: 14, color: ch.color }} />
                        <span style={{
                          position: "absolute", top: -6, left: -6,
                          width: 16, height: 16, borderRadius: "50%",
                          background: "#1e2a5e", color: "white",
                          fontSize: 8, fontWeight: 700,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {step.stepNumber}
                        </span>
                      </div>

                      {/* Step content */}
                      <div style={{
                        flex: 1, padding: "12px 16px", borderRadius: 10,
                        background: "#f8f9fa", border: "1px solid #f1f3f5",
                        marginBottom: isLast ? 0 : 4,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#1e2a5e" }}>
                              {step.type}
                            </span>
                            <span style={{
                              fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                              background: ch.bg, color: ch.color, textTransform: "uppercase",
                            }}>
                              {step.channel}
                            </span>
                          </div>
                        </div>

                        {step.subject && (
                          <div style={{ fontSize: 11, fontWeight: 600, color: "#1e2a5e", marginBottom: 4 }}>
                            Subject: {step.subject}
                          </div>
                        )}

                        <div style={{ fontSize: 11, color: "#868e96", lineHeight: 1.5, marginBottom: 8 }}>
                          {step.body.length > 120 ? `${step.body.slice(0, 120)}...` : step.body}
                        </div>

                        {/* Step stats */}
                        <div style={{ display: "flex", gap: 12, paddingTop: 8, borderTop: "1px solid #f1f3f5" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#868e96" }}>
                            <Send style={{ width: 10, height: 10 }} />
                            <span style={{ fontWeight: 600 }}>{step.stats.sent}</span> sent
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#3b5bdb" }}>
                            <Eye style={{ width: 10, height: 10 }} />
                            <span style={{ fontWeight: 600 }}>{openRate}%</span> opened
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#2b8a3e" }}>
                            <MessageSquare style={{ width: 10, height: 10 }} />
                            <span style={{ fontWeight: 600 }}>{replyRate}%</span> replied
                          </div>
                          {step.stats.bounced > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#e03131" }}>
                              <AlertCircle style={{ width: 10, height: 10 }} />
                              <span style={{ fontWeight: 600 }}>{step.stats.bounced}</span> bounced
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Connector line */}
                    {!isLast && (
                      <div style={{
                        display: "flex", alignItems: "center", marginLeft: 11,
                        height: 8,
                      }}>
                        <div style={{ width: 2, height: "100%", background: "#dee2e6" }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Enrollment Section */}
          <div style={cardStyle}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 16,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Users style={{ width: 16, height: 16, color: "#3b5bdb" }} />
                <span style={{
                  fontSize: 10, fontWeight: 700, color: "#868e96",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                }}>
                  Enrolled Leads ({enrollments.length})
                </span>
              </div>
            </div>

            {enrollments.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "#868e96" }}>
                No leads enrolled in this sequence yet
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {/* Table header */}
                <div style={{
                  display: "grid", gridTemplateColumns: "2fr 1.5fr 80px 80px",
                  padding: "8px 12px", fontSize: 10, fontWeight: 700, color: "#868e96",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                  borderBottom: "1px solid #f1f3f5",
                }}>
                  <span>Lead</span>
                  <span>Company</span>
                  <span>Step</span>
                  <span>Status</span>
                </div>

                {enrollments.map((enrollment) => {
                  const es = enrollmentStatusConfig[enrollment.status];

                  return (
                    <div
                      key={enrollment.leadId}
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigateToLead(enrollment.leadId);
                      }}
                      style={{
                        display: "grid", gridTemplateColumns: "2fr 1.5fr 80px 80px",
                        padding: "10px 12px", borderRadius: 8,
                        cursor: "pointer", transition: "background 0.1s ease",
                        fontSize: 12,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#f8f9fa";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <span style={{ fontWeight: 600, color: "#1e2a5e" }}>
                        {enrollment.leadName}
                      </span>
                      <span style={{ color: "#868e96" }}>{enrollment.company}</span>
                      <span style={{ color: "#1e2a5e", fontWeight: 600 }}>
                        {enrollment.currentStep} / {selectedSequence.steps.length}
                      </span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                        background: es.bg, color: es.color,
                        textTransform: "uppercase", letterSpacing: "0.05em",
                        display: "inline-block", textAlign: "center",
                      }}>
                        {enrollment.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
