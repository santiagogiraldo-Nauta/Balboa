"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Layers, RefreshCw, ChevronRight, ChevronDown,
  Mail, Phone, Linkedin, CheckCircle, AlertCircle,
  TrendingUp, Users, Clock, Target, ArrowUpRight
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────

interface SequenceData {
  id: string;
  external_id: string | null;
  source: string;
  name: string;
  description: string | null;
  status: string;
  total_steps: number | null;
  steps: Array<{
    step_number: number;
    channel: string;
    type: string;
    subject?: string;
    delay_days: number;
  }>;
  stats: {
    enrolled?: number;
    completed?: number;
    replied?: number;
    meetings?: number;
    open_rate?: number;
    click_rate?: number;
    reply_rate?: number;
    bounce_rate?: number;
  };
  synced_at: string;
  created_at: string;
}

interface EnrollmentData {
  id: string;
  lead_id: string | null;
  sequence_id: string;
  sequence_name: string;
  sequence_source: string;
  current_step: number;
  total_steps: number | null;
  status: string;
  enrolled_at: string;
  last_step_at: string | null;
  lead_name?: string;
  lead_company?: string;
  lead_email?: string;
}

interface SequenceTrackerProps {
  onNavigateToLead?: (leadId: string) => void;
}

// ─── Component ───────────────────────────────────────────────────

export default function SequenceTracker({ onNavigateToLead }: SequenceTrackerProps) {
  const [sequences, setSequences] = useState<SequenceData[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expandedSequence, setExpandedSequence] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);

  // Fetch data
  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const [seqRes, enrollRes, ampRes] = await Promise.all([
        fetch("/api/sequences").then(r => r.json()).catch(() => ({ sequences: [] })),
        fetch("/api/sequences/enrollments").then(r => r.json()).catch(() => ({ enrollments: [] })),
        fetch("/api/amplemarket/sequences").then(r => r.json()).catch(() => ({ sequences: [] })),
      ]);

      setSequences(seqRes.sequences || []);
      setEnrollments(enrollRes.enrollments || []);

      // Merge Amplemarket sequences data
      if (ampRes.sequences?.length) {
        // These are already displayed via our sequences table after sync
        console.log(`[SequenceTracker] ${ampRes.sequences.length} Amplemarket sequences available`);
      }
    } catch (err) {
      setError("Failed to load sequences");
      console.error("[SequenceTracker] Fetch error:", err);
    }
    setLoading(false);
  }

  async function syncAmplemarket() {
    setSyncing(true);
    try {
      await fetch("/api/amplemarket/sequences");
      await fetchData();
    } catch (err) {
      console.error("[SequenceTracker] Sync error:", err);
    }
    setSyncing(false);
  }

  // Filter sequences
  const filteredSequences = useMemo(() => {
    if (sourceFilter === "all") return sequences;
    return sequences.filter(s => s.source === sourceFilter);
  }, [sequences, sourceFilter]);

  // Compute summary stats
  const summaryStats = useMemo(() => {
    const active = filteredSequences.filter(s => s.status === "active").length;
    const totalEnrolled = enrollments.length;
    const totalReplied = enrollments.filter(e => e.status === "replied").length;
    const totalCompleted = enrollments.filter(e => e.status === "completed").length;
    const replyRate = totalEnrolled > 0 ? Math.round((totalReplied / totalEnrolled) * 100) : 0;

    return { active, totalEnrolled, totalReplied, totalCompleted, replyRate };
  }, [filteredSequences, enrollments]);

  // Get enrollments for a specific sequence
  function getSequenceEnrollments(sequenceId: string) {
    return enrollments.filter(e => e.sequence_id === sequenceId);
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
        <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 12px" }} />
        <p>Loading sequences...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header + Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
            Sequence Tracker
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            Track all active sequences across Amplemarket, HubSpot, and Rocket
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {/* Source filter */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            style={{
              padding: "6px 10px",
              fontSize: 12,
              border: "1px solid var(--border-primary)",
              borderRadius: 6,
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
            }}
          >
            <option value="all">All Sources</option>
            <option value="amplemarket">Amplemarket</option>
            <option value="hubspot">HubSpot</option>
            <option value="rocket">Rocket</option>
          </select>
          <button
            onClick={syncAmplemarket}
            disabled={syncing}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              fontSize: 12,
              border: "1px solid var(--border-primary)",
              borderRadius: 6,
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              cursor: "pointer",
              opacity: syncing ? 0.6 : 1,
            }}
          >
            <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
            Sync
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 12,
        marginBottom: 20,
      }}>
        <StatCard icon={<Layers size={14} />} label="Active" value={summaryStats.active} color="#3B5BDB" />
        <StatCard icon={<Users size={14} />} label="Enrolled" value={summaryStats.totalEnrolled} color="#DF7F40" />
        <StatCard icon={<Mail size={14} />} label="Replied" value={summaryStats.totalReplied} color="#22c55e" />
        <StatCard icon={<CheckCircle size={14} />} label="Completed" value={summaryStats.totalCompleted} color="#8b5cf6" />
        <StatCard icon={<TrendingUp size={14} />} label="Reply Rate" value={`${summaryStats.replyRate}%`} color="#3B5BDB" />
      </div>

      {error && (
        <div style={{
          padding: "10px 14px",
          marginBottom: 16,
          borderRadius: 8,
          background: "rgba(239,68,68,0.1)",
          color: "#ef4444",
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Sequences List */}
      {filteredSequences.length === 0 ? (
        <div style={{
          padding: 40,
          textAlign: "center",
          color: "var(--text-secondary)",
          border: "1px dashed var(--border-primary)",
          borderRadius: 10,
        }}>
          <Layers size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
          <p style={{ margin: 0, fontSize: 14 }}>No sequences found</p>
          <p style={{ margin: "4px 0 0", fontSize: 12 }}>
            Import from Rocket, sync Amplemarket, or connect HubSpot to see sequences here.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredSequences.map(seq => {
            const isExpanded = expandedSequence === seq.id;
            const seqEnrollments = getSequenceEnrollments(seq.external_id || seq.id);
            const replied = seqEnrollments.filter(e => e.status === "replied").length;
            const active = seqEnrollments.filter(e => e.status === "active").length;

            return (
              <div key={seq.id} style={{
                border: "1px solid var(--border-primary)",
                borderRadius: 10,
                overflow: "hidden",
              }}>
                {/* Sequence header */}
                <button
                  onClick={() => setExpandedSequence(isExpanded ? null : seq.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    border: "none",
                    background: isExpanded ? "var(--bg-tertiary)" : "var(--bg-secondary)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <SourceBadge source={seq.source} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
                        {seq.name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                        {seq.total_steps || "?"} steps · Created {new Date(seq.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 12 }}>
                    <span style={{ color: "var(--text-secondary)" }}>
                      <Users size={11} style={{ marginRight: 4, verticalAlign: "middle" }} />
                      {seqEnrollments.length} enrolled
                    </span>
                    <span style={{ color: "#22c55e" }}>
                      {replied} replied
                    </span>
                    <span style={{ color: "#3B5BDB" }}>
                      {active} active
                    </span>
                    <StatusBadge status={seq.status} />
                  </div>
                </button>

                {/* Expanded: enrollments */}
                {isExpanded && (
                  <div style={{ padding: "8px 16px 16px", background: "var(--bg-primary)" }}>
                    {/* Steps timeline */}
                    {seq.steps && seq.steps.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 8 }}>
                          Sequence Steps
                        </div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {seq.steps.map((step, i) => (
                            <div key={i} style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "4px 8px",
                              fontSize: 11,
                              borderRadius: 4,
                              background: "var(--bg-tertiary)",
                              color: "var(--text-secondary)",
                            }}>
                              {step.channel === "email" ? <Mail size={10} /> :
                               step.channel === "call" ? <Phone size={10} /> :
                               <Linkedin size={10} />}
                              Day {step.delay_days}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Enrollment table */}
                    {seqEnrollments.length === 0 ? (
                      <p style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "center", padding: 16 }}>
                        No leads enrolled yet
                      </p>
                    ) : (
                      <div style={{ maxHeight: 300, overflowY: "auto" }}>
                        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--border-primary)" }}>
                              <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)", fontWeight: 500 }}>Lead</th>
                              <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)", fontWeight: 500 }}>Step</th>
                              <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)", fontWeight: 500 }}>Status</th>
                              <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)", fontWeight: 500 }}>Enrolled</th>
                              <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)", fontWeight: 500 }}>Last Activity</th>
                            </tr>
                          </thead>
                          <tbody>
                            {seqEnrollments.map(enrollment => (
                              <tr
                                key={enrollment.id}
                                style={{
                                  borderBottom: "1px solid var(--border-primary)",
                                  cursor: enrollment.lead_id ? "pointer" : "default",
                                }}
                                onClick={() => enrollment.lead_id && onNavigateToLead?.(enrollment.lead_id)}
                              >
                                <td style={{ padding: "8px", color: "var(--text-primary)" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    {enrollment.lead_name || "Unknown"}
                                    {enrollment.lead_id && <ArrowUpRight size={10} style={{ color: "var(--text-secondary)" }} />}
                                  </div>
                                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                                    {enrollment.lead_company || enrollment.lead_email || ""}
                                  </div>
                                </td>
                                <td style={{ padding: "8px" }}>
                                  <span style={{
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                    fontSize: 11,
                                    background: "var(--bg-tertiary)",
                                    color: "var(--text-primary)",
                                  }}>
                                    {enrollment.current_step}/{enrollment.total_steps || "?"}
                                  </span>
                                </td>
                                <td style={{ padding: "8px" }}>
                                  <EnrollmentStatusBadge status={enrollment.status} />
                                </td>
                                <td style={{ padding: "8px", fontSize: 11, color: "var(--text-secondary)" }}>
                                  {new Date(enrollment.enrolled_at).toLocaleDateString()}
                                </td>
                                <td style={{ padding: "8px", fontSize: 11, color: "var(--text-secondary)" }}>
                                  {enrollment.last_step_at
                                    ? new Date(enrollment.last_step_at).toLocaleDateString()
                                    : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
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

// ─── Sub-components ──────────────────────────────────────────────

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div style={{
      padding: "12px 14px",
      borderRadius: 8,
      border: "1px solid var(--border-primary)",
      background: "var(--bg-secondary)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ color }}>{icon}</span>
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    amplemarket: { bg: "rgba(59,91,219,0.1)", text: "#3B5BDB" },
    hubspot: { bg: "rgba(255,122,69,0.1)", text: "#ff7a45" },
    rocket: { bg: "rgba(223,127,64,0.1)", text: "#DF7F40" },
  };
  const c = colors[source] || { bg: "var(--bg-tertiary)", text: "var(--text-secondary)" };

  return (
    <span style={{
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      background: c.bg,
      color: c.text,
    }}>
      {source}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    active: { bg: "rgba(34,197,94,0.1)", text: "#22c55e" },
    paused: { bg: "rgba(234,179,8,0.1)", text: "#eab308" },
    completed: { bg: "rgba(139,92,246,0.1)", text: "#8b5cf6" },
    draft: { bg: "var(--bg-tertiary)", text: "var(--text-secondary)" },
  };
  const c = colors[status] || colors.draft;

  return (
    <span style={{
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 500,
      background: c.bg,
      color: c.text,
    }}>
      {status}
    </span>
  );
}

function EnrollmentStatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: React.ReactNode; color: string }> = {
    active: { icon: <Clock size={10} />, color: "#3B5BDB" },
    replied: { icon: <Mail size={10} />, color: "#22c55e" },
    completed: { icon: <CheckCircle size={10} />, color: "#8b5cf6" },
    bounced: { icon: <AlertCircle size={10} />, color: "#ef4444" },
    paused: { icon: <Clock size={10} />, color: "#eab308" },
  };
  const c = config[status] || config.active;

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "2px 6px",
      borderRadius: 4,
      fontSize: 11,
      color: c.color,
    }}>
      {c.icon} {status}
    </span>
  );
}
