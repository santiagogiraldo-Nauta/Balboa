"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  CheckCircle2,
  BarChart3,
  Users,
  Mail,
  ArrowRight,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────

type SequenceSource = "amplemarket" | "hubspot" | "rocket";
type SequenceStatus = "active" | "completed" | "paused" | "draft";
interface SequenceStep {
  step_number: number;
  channel: string;
  type: string;
  subject?: string;
  delay_days: number;
}

interface SequenceStats {
  enrolled?: number;
  completed?: number;
  replied?: number;
  meetings?: number;
  open_rate?: number;
  click_rate?: number;
  reply_rate?: number;
  bounce_rate?: number;
}

interface SequenceData {
  id: string;
  external_id: string | null;
  source: string;
  name: string;
  description: string | null;
  status: string;
  total_steps: number | null;
  steps: SequenceStep[];
  stats: SequenceStats;
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
  userId?: string;
  onLeadClick?: (leadId: string) => void;
  onNavigateToLead?: (leadId: string) => void;
}

type SourceFilter = "all" | SequenceSource;
type StatusFilter = "all" | SequenceStatus;

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "---";
  }
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "---";
  try {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateStr);
  } catch {
    return "---";
  }
}

// ─── Component ────────────────────────────────────────────────────────────

export default function SequenceTracker({
  userId,
  onLeadClick,
  onNavigateToLead,
}: SequenceTrackerProps) {
  const handleLeadClick = onLeadClick || onNavigateToLead;
  const [sequences, setSequences] = useState<SequenceData[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedSequenceId, setExpandedSequenceId] = useState<string | null>(null);

  // ── Data fetching ───────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [seqRes, enrollRes] = await Promise.all([
        fetch("/api/sequences").then((r) => {
          if (!r.ok) throw new Error(`Sequences: ${r.status}`);
          return r.json();
        }),
        fetch("/api/sequences/enrollments").then((r) => {
          if (!r.ok) throw new Error(`Enrollments: ${r.status}`);
          return r.json();
        }),
      ]);

      setSequences(seqRes.sequences || []);
      setEnrollments(enrollRes.enrollments || []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load sequence data";
      setError(message);
      console.error("[SequenceTracker] Fetch error:", err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      await fetchData();
      if (!cancelled) setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [fetchData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // ── Filtering ───────────────────────────────────────────────────────────

  const filteredSequences = sequences.filter((seq) => {
    if (sourceFilter !== "all" && seq.source !== sourceFilter) return false;
    if (statusFilter !== "all" && seq.status !== statusFilter) return false;
    return true;
  });

  // ── Metrics ─────────────────────────────────────────────────────────────

  const totalEnrolled = enrollments.length;
  const activeEnrollments = enrollments.filter(
    (e) => e.status === "active"
  ).length;
  const completedEnrollments = enrollments.filter(
    (e) => e.status === "completed"
  ).length;
  const repliedEnrollments = enrollments.filter(
    (e) => e.status === "replied"
  ).length;
  const bouncedEnrollments = enrollments.filter(
    (e) => e.status === "bounced"
  ).length;
  const replyRate =
    totalEnrolled > 0
      ? Math.round((repliedEnrollments / totalEnrolled) * 100)
      : 0;
  const bounceRate =
    totalEnrolled > 0
      ? Math.round((bouncedEnrollments / totalEnrolled) * 100)
      : 0;

  // ── Helpers for per-sequence data ───────────────────────────────────────

  function getEnrollmentsForSequence(seq: SequenceData): EnrollmentData[] {
    return enrollments.filter(
      (e) => e.sequence_id === (seq.external_id || seq.id)
    );
  }

  function getSequenceReplyRate(seq: SequenceData): number {
    const seqEnrollments = getEnrollmentsForSequence(seq);
    if (seqEnrollments.length === 0) {
      return seq.stats.reply_rate ?? 0;
    }
    const replied = seqEnrollments.filter((e) => e.status === "replied").length;
    return Math.round((replied / seqEnrollments.length) * 100);
  }

  function getSequenceEnrolledCount(seq: SequenceData): number {
    const seqEnrollments = getEnrollmentsForSequence(seq);
    return seqEnrollments.length || seq.stats.enrolled || 0;
  }

  // ── Rendering ───────────────────────────────────────────────────────────

  if (loading) {
    return <LoadingSkeleton />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              color: "#151B42",
              letterSpacing: "-0.02em",
            }}
          >
            Sequence Tracker
          </h3>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "var(--balboa-text-muted)",
            }}
          >
            Monitor active sequences across all sources
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="btn-secondary"
          style={{ opacity: refreshing ? 0.6 : 1 }}
        >
          <RefreshCw
            size={14}
            className={refreshing ? "animate-spin" : ""}
          />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* ── Metrics Bar ────────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
        }}
      >
        <MetricCard
          label="Total Enrolled"
          value={totalEnrolled}
          color="#3B5BDB"
          icon={<Users size={14} />}
        />
        <MetricCard
          label="Active"
          value={activeEnrollments}
          color="#2b8a3e"
          icon={<Play size={14} />}
        />
        <MetricCard
          label="Completed"
          value={completedEnrollments}
          color="#8b5cf6"
          icon={<CheckCircle2 size={14} />}
        />
        <MetricCard
          label="Reply Rate"
          value={`${replyRate}%`}
          color="#3B5BDB"
          icon={<BarChart3 size={14} />}
        />
        <MetricCard
          label="Bounce Rate"
          value={`${bounceRate}%`}
          color={bounceRate > 5 ? "#DF7F40" : "var(--balboa-text-muted)"}
          icon={<Mail size={14} />}
        />
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        {/* Source filter */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Filter
            size={12}
            style={{ color: "var(--balboa-text-muted)" }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--balboa-text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Source
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            {(
              [
                { key: "all", label: "All" },
                { key: "amplemarket", label: "Amplemarket" },
                { key: "hubspot", label: "HubSpot" },
                { key: "rocket", label: "Rocket" },
              ] as { key: SourceFilter; label: string }[]
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setSourceFilter(f.key)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  border:
                    sourceFilter === f.key
                      ? "1px solid #151B42"
                      : "1px solid var(--balboa-border)",
                  background:
                    sourceFilter === f.key ? "#151B42" : "white",
                  color:
                    sourceFilter === f.key
                      ? "white"
                      : "var(--balboa-text-muted)",
                  transition: "all 0.15s ease",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status filter */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--balboa-text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Status
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            {(
              [
                { key: "all", label: "All" },
                { key: "active", label: "Active" },
                { key: "completed", label: "Completed" },
                { key: "paused", label: "Paused" },
              ] as { key: StatusFilter; label: string }[]
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  border:
                    statusFilter === f.key
                      ? "1px solid #3B5BDB"
                      : "1px solid var(--balboa-border)",
                  background:
                    statusFilter === f.key ? "#3B5BDB" : "white",
                  color:
                    statusFilter === f.key
                      ? "white"
                      : "var(--balboa-text-muted)",
                  transition: "all 0.15s ease",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div
          className="alert-box alert-warning"
          style={{ borderRadius: 10 }}
        >
          <Zap size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>
              Failed to load data
            </div>
            <div style={{ fontSize: 12 }}>{error}</div>
          </div>
        </div>
      )}

      {/* ── Sequence Cards ─────────────────────────────────────────────── */}
      {filteredSequences.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredSequences.map((seq) => {
            const isExpanded = expandedSequenceId === seq.id;
            const seqEnrollments = getEnrollmentsForSequence(seq);
            const enrolledCount = getSequenceEnrolledCount(seq);
            const seqReplyRate = getSequenceReplyRate(seq);
            const totalSteps = seq.total_steps || seq.steps?.length || 0;

            return (
              <div
                key={seq.id}
                className="card"
                style={{
                  overflow: "hidden",
                  borderColor: isExpanded
                    ? "rgba(59, 91, 219, 0.3)"
                    : undefined,
                }}
              >
                {/* ── Card Header ─────────────────────────────────────── */}
                <button
                  onClick={() =>
                    setExpandedSequenceId(isExpanded ? null : seq.id)
                  }
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 18px",
                    border: "none",
                    background: isExpanded
                      ? "var(--balboa-bg-alt)"
                      : "white",
                    cursor: "pointer",
                    textAlign: "left",
                    gap: 12,
                    transition: "background 0.15s ease",
                  }}
                >
                  {/* Left section */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {isExpanded ? (
                      <ChevronUp
                        size={14}
                        style={{ color: "var(--balboa-text-muted)", flexShrink: 0 }}
                      />
                    ) : (
                      <ChevronDown
                        size={14}
                        style={{ color: "var(--balboa-text-muted)", flexShrink: 0 }}
                      />
                    )}

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 4,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: "#151B42",
                            letterSpacing: "-0.01em",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {seq.name}
                        </span>
                        <SourceBadge source={seq.source} />
                        <SequenceStatusBadge status={seq.status} />
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--balboa-text-muted)",
                        }}
                      >
                        {totalSteps} step{totalSteps !== 1 ? "s" : ""} -- Created{" "}
                        {formatDate(seq.created_at)}
                      </div>
                    </div>
                  </div>

                  {/* Right stats */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 20,
                      flexShrink: 0,
                    }}
                  >
                    {/* Enrolled count */}
                    <div style={{ textAlign: "center", minWidth: 50 }}>
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          color: "#151B42",
                          lineHeight: 1,
                        }}
                      >
                        {enrolledCount}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--balboa-text-muted)",
                          marginTop: 2,
                        }}
                      >
                        Enrolled
                      </div>
                    </div>

                    {/* Reply rate */}
                    <div style={{ textAlign: "center", minWidth: 50 }}>
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          color:
                            seqReplyRate >= 20
                              ? "#2b8a3e"
                              : seqReplyRate >= 10
                              ? "#DF7F40"
                              : "var(--balboa-text-muted)",
                          lineHeight: 1,
                        }}
                      >
                        {seqReplyRate}%
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--balboa-text-muted)",
                          marginTop: 2,
                        }}
                      >
                        Reply Rate
                      </div>
                    </div>

                    {/* Step progress bar */}
                    <div style={{ width: 80 }}>
                      <StepProgressBar
                        completedSteps={
                          seq.stats.completed || 0
                        }
                        totalSteps={totalSteps}
                        enrolledCount={enrolledCount}
                      />
                    </div>
                  </div>
                </button>

                {/* ── Expanded View: enrolled leads ────────────────────── */}
                {isExpanded && (
                  <div
                    className="fade-in"
                    style={{
                      borderTop: "1px solid var(--balboa-border-light)",
                    }}
                  >
                    {/* Step timeline preview */}
                    {seq.steps && seq.steps.length > 0 && (
                      <div
                        style={{
                          padding: "12px 18px",
                          borderBottom: "1px solid var(--balboa-border-light)",
                          background: "var(--balboa-bg-alt)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "var(--balboa-text-muted)",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            marginBottom: 8,
                          }}
                        >
                          Sequence Steps
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            flexWrap: "wrap",
                            alignItems: "center",
                          }}
                        >
                          {seq.steps.map((step, i) => (
                            <React.Fragment key={i}>
                              {i > 0 && (
                                <ArrowRight
                                  size={10}
                                  style={{
                                    color: "var(--balboa-text-light)",
                                    flexShrink: 0,
                                  }}
                                />
                              )}
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                  padding: "4px 10px",
                                  fontSize: 11,
                                  fontWeight: 500,
                                  borderRadius: 6,
                                  background:
                                    step.channel === "email"
                                      ? "#fef3e2"
                                      : step.channel === "linkedin"
                                      ? "#e8f4fd"
                                      : "#e8faf0",
                                  color:
                                    step.channel === "email"
                                      ? "#d97706"
                                      : step.channel === "linkedin"
                                      ? "#0077b5"
                                      : "#059669",
                                }}
                              >
                                <Mail size={10} />
                                <span>Day {step.delay_days}</span>
                              </div>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Enrolled leads table */}
                    <div style={{ padding: "0 18px 16px" }}>
                      {seqEnrollments.length === 0 ? (
                        <div
                          style={{
                            padding: "24px 0",
                            textAlign: "center",
                            color: "var(--balboa-text-muted)",
                            fontSize: 13,
                          }}
                        >
                          No leads enrolled in this sequence yet.
                        </div>
                      ) : (
                        <div
                          style={{
                            maxHeight: 320,
                            overflowY: "auto",
                            marginTop: 12,
                          }}
                        >
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Lead</th>
                                <th>Step</th>
                                <th>Status</th>
                                <th>Enrolled</th>
                                <th>Last Activity</th>
                              </tr>
                            </thead>
                            <tbody>
                              {seqEnrollments.map((enrollment) => (
                                <tr
                                  key={enrollment.id}
                                  style={{
                                    cursor: enrollment.lead_id
                                      ? "pointer"
                                      : "default",
                                  }}
                                  onClick={() => {
                                    if (enrollment.lead_id && handleLeadClick) {
                                      handleLeadClick(enrollment.lead_id);
                                    }
                                  }}
                                >
                                  <td>
                                    <div
                                      style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 2,
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontWeight: 600,
                                          color: "#151B42",
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 4,
                                        }}
                                      >
                                        {enrollment.lead_name || "Unknown Lead"}
                                        {enrollment.lead_id && (
                                          <ArrowRight
                                            size={10}
                                            style={{
                                              color: "var(--balboa-text-light)",
                                            }}
                                          />
                                        )}
                                      </span>
                                      {(enrollment.lead_company ||
                                        enrollment.lead_email) && (
                                        <span
                                          style={{
                                            fontSize: 11,
                                            color: "var(--balboa-text-muted)",
                                          }}
                                        >
                                          {enrollment.lead_company ||
                                            enrollment.lead_email}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td>
                                    <span
                                      style={{
                                        padding: "2px 8px",
                                        borderRadius: 4,
                                        fontSize: 12,
                                        fontWeight: 600,
                                        background: "var(--balboa-bg-alt)",
                                        color: "#151B42",
                                      }}
                                    >
                                      {enrollment.current_step}/
                                      {enrollment.total_steps || "?"}
                                    </span>
                                  </td>
                                  <td>
                                    <EnrollmentStatusBadge
                                      status={enrollment.status}
                                    />
                                  </td>
                                  <td>{formatDate(enrollment.enrolled_at)}</td>
                                  <td>{timeAgo(enrollment.last_step_at)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
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

// ─── Sub-components ───────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: "var(--balboa-radius)",
        border: "1px solid var(--balboa-border)",
        background: "white",
        boxShadow: "var(--balboa-shadow-sm)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
        }}
      >
        <span style={{ color, display: "flex" }}>{icon}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--balboa-text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.03em",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: "#151B42",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  const config: Record<string, { bg: string; text: string }> = {
    amplemarket: { bg: "rgba(59,91,219,0.1)", text: "#3B5BDB" },
    hubspot: { bg: "rgba(255,122,69,0.1)", text: "#ff7a45" },
    rocket: { bg: "rgba(223,127,64,0.1)", text: "#DF7F40" },
  };
  const c = config[source] || {
    bg: "var(--balboa-bg-alt)",
    text: "var(--balboa-text-muted)",
  };

  return (
    <span
      className="badge"
      style={{
        background: c.bg,
        color: c.text,
      }}
    >
      {source}
    </span>
  );
}

function SequenceStatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { icon: React.ReactNode; bg: string; text: string }
  > = {
    active: {
      icon: <Play size={9} />,
      bg: "#ecfdf5",
      text: "#059669",
    },
    paused: {
      icon: <Pause size={9} />,
      bg: "#fffbeb",
      text: "#d97706",
    },
    completed: {
      icon: <CheckCircle2 size={9} />,
      bg: "#f3f4f6",
      text: "#6b7280",
    },
    draft: {
      icon: null,
      bg: "var(--balboa-bg-alt)",
      text: "var(--balboa-text-muted)",
    },
  };
  const c = config[status] || config.draft;

  return (
    <span
      className="badge"
      style={{
        background: c.bg,
        color: c.text,
        gap: 3,
      }}
    >
      {c.icon}
      {status}
    </span>
  );
}

function EnrollmentStatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; bg: string }> = {
    active: { color: "#3B5BDB", bg: "rgba(59,91,219,0.1)" },
    replied: { color: "#2b8a3e", bg: "rgba(43,138,62,0.1)" },
    completed: { color: "#8b5cf6", bg: "rgba(139,92,246,0.1)" },
    paused: { color: "#d97706", bg: "rgba(217,119,6,0.1)" },
    bounced: { color: "#e03131", bg: "rgba(224,49,49,0.1)" },
    removed: { color: "#6b7280", bg: "rgba(107,114,128,0.1)" },
  };
  const c = config[status] || config.active;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        background: c.bg,
        color: c.color,
        textTransform: "capitalize",
      }}
    >
      {status}
    </span>
  );
}

function StepProgressBar({
  completedSteps,
  totalSteps,
  enrolledCount,
}: {
  completedSteps: number;
  totalSteps: number;
  enrolledCount: number;
}) {
  const pct =
    totalSteps > 0 && enrolledCount > 0
      ? Math.min(
          Math.round((completedSteps / (totalSteps * enrolledCount)) * 100),
          100
        )
      : 0;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: "var(--balboa-text-muted)",
          marginBottom: 3,
        }}
      >
        <span>Progress</span>
        <span style={{ fontWeight: 700 }}>{pct}%</span>
      </div>
      <div className="rate-bar-track">
        <div
          className="rate-bar-fill"
          style={{
            width: `${pct}%`,
            background:
              pct >= 75
                ? "var(--balboa-green)"
                : pct >= 40
                ? "#3B5BDB"
                : "var(--balboa-text-light)",
          }}
        />
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  const skeletonBar = (width: string, height = 12): React.CSSProperties => ({
    width,
    height,
    borderRadius: 4,
    background:
      "linear-gradient(90deg, var(--balboa-border-light) 25%, var(--balboa-bg-alt) 50%, var(--balboa-border-light) 75%)",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.5s infinite",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* Header skeleton */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={skeletonBar("180px", 18)} />
          <div style={{ ...skeletonBar("240px"), marginTop: 8 }} />
        </div>
        <div style={skeletonBar("90px", 32)} />
      </div>

      {/* Metrics skeleton */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 12,
        }}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              padding: "14px 16px",
              borderRadius: "var(--balboa-radius)",
              border: "1px solid var(--balboa-border-light)",
              background: "white",
            }}
          >
            <div style={skeletonBar("60px", 10)} />
            <div style={{ ...skeletonBar("50px", 22), marginTop: 10 }} />
          </div>
        ))}
      </div>

      {/* Filter skeleton */}
      <div style={{ display: "flex", gap: 8 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} style={skeletonBar("70px", 26)} />
        ))}
      </div>

      {/* Card skeletons */}
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="card"
          style={{ padding: "16px 18px" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={skeletonBar("14px", 14)} />
              <div>
                <div style={skeletonBar("200px", 14)} />
                <div style={{ ...skeletonBar("140px", 10), marginTop: 6 }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              <div style={skeletonBar("40px", 20)} />
              <div style={skeletonBar("40px", 20)} />
              <div style={skeletonBar("80px", 20)} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="card"
      style={{
        padding: "48px 32px",
        textAlign: "center",
        border: "1px dashed var(--balboa-border)",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: "var(--balboa-bg-alt)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 16px",
        }}
      >
        <Zap
          size={24}
          style={{ color: "var(--balboa-text-light)" }}
        />
      </div>
      <h4
        style={{
          margin: "0 0 8px",
          fontSize: 16,
          fontWeight: 700,
          color: "#151B42",
        }}
      >
        No sequences found
      </h4>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: "var(--balboa-text-muted)",
          lineHeight: 1.5,
          maxWidth: 380,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        Connect Amplemarket or HubSpot to sync sequences, or import from Rocket
        to start tracking your outreach.
      </p>
    </div>
  );
}
