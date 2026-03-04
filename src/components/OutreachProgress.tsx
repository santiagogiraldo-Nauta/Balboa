"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, RotateCcw } from "lucide-react";
import { MOCK_WEEKLY_HISTORY, MOCK_OUTREACH_LISTS, MOCK_CONVERSION_HEATMAP, computeWeeklyMetricsFromLeads } from "@/lib/mock-outreach-progress";
import type { Lead } from "@/lib/types";
import { EmptyOutreach } from "./EmptyState";
import { getClientConfig } from "@/lib/config-client";

// ── KPI Card ──

interface KPICardProps {
  label: string;
  value: number;
  prevValue?: number;
  suffix?: string;
  showComparison: boolean;
}

function KPICard({ label, value, prevValue, suffix = "", showComparison }: KPICardProps) {
  const delta = prevValue != null && prevValue > 0
    ? Math.round(((value - prevValue) / prevValue) * 100)
    : 0;
  const deltaColor = delta > 0 ? "#059669" : delta < 0 ? "#dc2626" : "#94a3b8";
  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;

  return (
    <div className="card" style={{
      padding: "12px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 2,
      minWidth: 0,
    }}>
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        color: "var(--balboa-text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{
          fontSize: 22,
          fontWeight: 800,
          color: "var(--balboa-navy)",
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
        }}>
          {value}{suffix}
        </span>
        {showComparison && prevValue != null && delta !== 0 && (
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: deltaColor,
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}>
            <DeltaIcon size={11} />
            {Math.abs(delta)}%
          </span>
        )}
      </div>
    </div>
  );
}

// ── Mini bar chart (4-week trend) ──

function WeeklyTrendChart({ data, label }: { data: number[]; label: string }) {
  const maxVal = Math.max(...data, 1);
  return (
    <div className="card" style={{ padding: 14 }}>
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        color: "var(--balboa-text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        display: "block",
        marginBottom: 10,
      }}>
        {label} — Last 4 Weeks
      </span>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 50 }}>
        {data.map((val, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--balboa-navy)" }}>{val}</span>
            <div style={{
              width: "100%",
              height: `${(val / maxVal) * 36}px`,
              minHeight: 4,
              background: i === data.length - 1 ? "var(--balboa-blue)" : "rgba(30,42,94,0.15)",
              borderRadius: 3,
              transition: "height 0.3s ease",
            }} />
            <span style={{ fontSize: 9, color: "var(--balboa-text-muted)" }}>
              W{i + 1}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Conversion Heatmap ──

function ConversionHeatmap() {
  const maxRate = Math.max(
    ...MOCK_CONVERSION_HEATMAP.map((c) => (c.total > 0 ? c.booked / c.total : 0)),
    0.01
  );

  return (
    <div className="card" style={{ padding: 14 }}>
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        color: "var(--balboa-text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        display: "block",
        marginBottom: 10,
      }}>
        Conversion by Persona & Industry
      </span>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "var(--balboa-text-muted)", fontSize: 10 }}>Industry</th>
              <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "var(--balboa-text-muted)", fontSize: 10 }}>Persona</th>
              <th style={{ padding: "6px 8px", textAlign: "center", fontWeight: 600, color: "var(--balboa-text-muted)", fontSize: 10 }}>Booked</th>
              <th style={{ padding: "6px 8px", textAlign: "center", fontWeight: 600, color: "var(--balboa-text-muted)", fontSize: 10 }}>Held</th>
              <th style={{ padding: "6px 8px", textAlign: "center", fontWeight: 600, color: "var(--balboa-text-muted)", fontSize: 10 }}>Qualified</th>
              <th style={{ padding: "6px 8px", textAlign: "center", fontWeight: 600, color: "var(--balboa-text-muted)", fontSize: 10 }}>Rate</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_CONVERSION_HEATMAP.map((row, i) => {
              const rate = row.total > 0 ? row.booked / row.total : 0;
              const intensity = rate / maxRate;
              return (
                <tr key={i} style={{ borderTop: "1px solid rgba(148,163,184,0.08)" }}>
                  <td style={{ padding: "6px 8px", fontWeight: 600, color: "var(--balboa-navy)" }}>{row.industry}</td>
                  <td style={{ padding: "6px 8px", color: "var(--balboa-text-muted)" }}>{row.persona}</td>
                  <td style={{
                    padding: "6px 8px",
                    textAlign: "center",
                    fontWeight: 600,
                    background: `rgba(5,150,105,${0.05 + intensity * 0.2})`,
                    color: "#059669",
                  }}>
                    {row.booked}
                  </td>
                  <td style={{
                    padding: "6px 8px",
                    textAlign: "center",
                    fontWeight: 600,
                    background: `rgba(37,99,235,${0.05 + (row.total > 0 ? row.held / row.total / maxRate : 0) * 0.2})`,
                    color: "#2563eb",
                  }}>
                    {row.held}
                  </td>
                  <td style={{
                    padding: "6px 8px",
                    textAlign: "center",
                    fontWeight: 600,
                    background: `rgba(124,58,237,${0.05 + (row.total > 0 ? row.qualified / row.total / maxRate : 0) * 0.2})`,
                    color: "#7c3aed",
                  }}>
                    {row.qualified}
                  </td>
                  <td style={{
                    padding: "6px 8px",
                    textAlign: "center",
                    fontWeight: 700,
                    fontSize: 11,
                    color: rate > 0.2 ? "#059669" : rate > 0.1 ? "#d97706" : "#dc2626",
                  }}>
                    {(rate * 100).toFixed(0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Active List Card ──

function ActiveListCard({ name, total, contacted, positive, meetings }: {
  name: string;
  total: number;
  contacted: number;
  positive: number;
  meetings: number;
}) {
  const pct = total > 0 ? Math.round((contacted / total) * 100) : 0;
  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-navy)" }}>{name}</span>
        <span style={{ fontSize: 11, color: "var(--balboa-text-muted)" }}>{pct}% reached</span>
      </div>
      <div style={{
        height: 4,
        background: "rgba(148,163,184,0.12)",
        borderRadius: 2,
        overflow: "hidden",
        marginBottom: 8,
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: pct >= 80 ? "#059669" : pct >= 50 ? "#2563eb" : "#d97706",
          borderRadius: 2,
        }} />
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--balboa-text-muted)" }}>
        <span><strong style={{ color: "var(--balboa-navy)" }}>{total}</strong> total</span>
        <span><strong style={{ color: "var(--balboa-blue)" }}>{contacted}</strong> contacted</span>
        <span><strong style={{ color: "#059669" }}>{positive}</strong> positive</span>
        <span><strong style={{ color: "#7c3aed" }}>{meetings}</strong> meetings</span>
      </div>
    </div>
  );
}

// ── Main Component ──

interface OutreachProgressProps {
  leads: Lead[];
}

export default function OutreachProgress({ leads }: OutreachProgressProps) {
  const { isSandbox } = getClientConfig();

  const [weekIndex, setWeekIndex] = useState(isSandbox ? MOCK_WEEKLY_HISTORY.length - 1 : 0);
  const [showComparison, setShowComparison] = useState(true);

  // Merge live computed data with mock history
  const allWeeks = useMemo(() => {
    if (!isSandbox) return [];
    const history = [...MOCK_WEEKLY_HISTORY];
    // Replace the last entry with live-computed data from leads
    const liveMetrics = computeWeeklyMetricsFromLeads(leads);
    if (history.length > 0) {
      history[history.length - 1] = {
        ...history[history.length - 1],
        // Use live data where it's non-zero, otherwise keep mock
        contactsReached: liveMetrics.contactsReached || history[history.length - 1].contactsReached,
        callsMade: liveMetrics.callsMade || history[history.length - 1].callsMade,
        emailsSent: liveMetrics.emailsSent || history[history.length - 1].emailsSent,
        linkedInConnections: liveMetrics.linkedInConnections || history[history.length - 1].linkedInConnections,
        meetingsBooked: liveMetrics.meetingsBooked || history[history.length - 1].meetingsBooked,
      };
    }
    return history;
  }, [leads, isSandbox]);

  if (!isSandbox) {
    return <EmptyOutreach />;
  }

  const currentWeek = allWeeks[weekIndex];
  const prevWeek = weekIndex > 0 ? allWeeks[weekIndex - 1] : undefined;

  const activeLists = MOCK_OUTREACH_LISTS.filter((l) => l.status === "active");

  const formatDateRange = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
  };

  // Trend data
  const meetingsTrend = allWeeks.map((w) => w.meetingsBooked);
  const contactsTrend = allWeeks.map((w) => w.contactsReached);

  return (
    <div>
      {/* ── Week Selector Bar ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        background: "rgba(30,42,94,0.03)",
        borderRadius: 10,
        marginBottom: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setWeekIndex(Math.max(0, weekIndex - 1))}
            disabled={weekIndex === 0}
            style={{
              padding: 4,
              background: "transparent",
              border: "1px solid var(--balboa-border-light)",
              borderRadius: 6,
              cursor: weekIndex > 0 ? "pointer" : "not-allowed",
              opacity: weekIndex > 0 ? 1 : 0.3,
              display: "flex",
              color: "var(--balboa-text)",
            }}
          >
            <ChevronLeft size={16} />
          </button>

          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--balboa-navy)", minWidth: 180, textAlign: "center" }}>
            {formatDateRange(currentWeek.weekStart, currentWeek.weekEnd)}
          </span>

          <button
            onClick={() => setWeekIndex(Math.min(allWeeks.length - 1, weekIndex + 1))}
            disabled={weekIndex === allWeeks.length - 1}
            style={{
              padding: 4,
              background: "transparent",
              border: "1px solid var(--balboa-border-light)",
              borderRadius: 6,
              cursor: weekIndex < allWeeks.length - 1 ? "pointer" : "not-allowed",
              opacity: weekIndex < allWeeks.length - 1 ? 1 : 0.3,
              display: "flex",
              color: "var(--balboa-text)",
            }}
          >
            <ChevronRight size={16} />
          </button>

          {weekIndex !== allWeeks.length - 1 && (
            <button
              onClick={() => setWeekIndex(allWeeks.length - 1)}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 600,
                background: "var(--balboa-navy)",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <RotateCcw size={11} />
              This Week
            </button>
          )}
        </div>

        <label style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: "var(--balboa-text-muted)",
          cursor: "pointer",
        }}>
          <input
            type="checkbox"
            checked={showComparison}
            onChange={(e) => setShowComparison(e.target.checked)}
            style={{ cursor: "pointer" }}
          />
          vs Last Week
        </label>
      </div>

      {/* ── KPI Grid (3×3) ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 10,
        marginBottom: 20,
      }}>
        <KPICard label="Contacts Reached" value={currentWeek.contactsReached} prevValue={prevWeek?.contactsReached} showComparison={showComparison} />
        <KPICard label="Calls Made" value={currentWeek.callsMade} prevValue={prevWeek?.callsMade} showComparison={showComparison} />
        <KPICard label="Emails Sent" value={currentWeek.emailsSent} prevValue={prevWeek?.emailsSent} showComparison={showComparison} />
        <KPICard label="LinkedIn Connections" value={currentWeek.linkedInConnections} prevValue={prevWeek?.linkedInConnections} showComparison={showComparison} />
        <KPICard label="Connect Rate" value={currentWeek.connectRate} prevValue={prevWeek?.connectRate} suffix="%" showComparison={showComparison} />
        <KPICard label="Meaningful Convos" value={currentWeek.meaningfulConversations} prevValue={prevWeek?.meaningfulConversations} showComparison={showComparison} />
        <KPICard label="Meetings Booked" value={currentWeek.meetingsBooked} prevValue={prevWeek?.meetingsBooked} showComparison={showComparison} />
        <KPICard label="Meetings Held" value={currentWeek.meetingsHeld} prevValue={prevWeek?.meetingsHeld} showComparison={showComparison} />
        <KPICard label="No Shows" value={currentWeek.noShows} prevValue={prevWeek?.noShows} showComparison={showComparison} />
      </div>

      {/* ── Active Lists ── */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{
          fontSize: 13,
          fontWeight: 700,
          color: "var(--balboa-navy)",
          marginBottom: 10,
          textTransform: "uppercase",
          letterSpacing: "0.03em",
        }}>
          Active Lists
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {activeLists.map((list) => (
            <ActiveListCard
              key={list.id}
              name={list.name}
              total={list.stats.total}
              contacted={list.stats.contacted}
              positive={list.stats.positive}
              meetings={list.stats.meetings}
            />
          ))}
        </div>
      </div>

      {/* ── Trend Charts + Heatmap (2 columns) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <WeeklyTrendChart data={meetingsTrend} label="Meetings Booked" />
        <WeeklyTrendChart data={contactsTrend} label="Contacts Reached" />
      </div>

      {/* ── Conversion Heatmap ── */}
      <ConversionHeatmap />
    </div>
  );
}
