"use client";

import { useState, useMemo } from "react";
import {
  Calendar,
  MapPin,
  Users,
  Target,
  ChevronRight,
  Search,
  Filter,
  Mail,
  Linkedin,
  Phone,
  BarChart3,
  Globe,
} from "lucide-react";
import type {
  SalesEvent,
  EventAttendee,
  Lead,
  SupportedLanguage,
  OutreachChannel,
} from "@/lib/types";

// ─── Props ──────────────────────────────────────────────────────

interface EventCommandCenterProps {
  events: SalesEvent[];
  leads: Lead[];
  onNavigateToLead: (leadId: string) => void;
  language: SupportedLanguage;
}

// ─── Constants ──────────────────────────────────────────────────

type SubTab = "overview" | "attendees" | "outreach" | "progress";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "attendees", label: "Attendees" },
  { key: "outreach", label: "Outreach" },
  { key: "progress", label: "Progress" },
];

const STATUS_COLORS: Record<SalesEvent["status"], string> = {
  upcoming: "#f59f00",
  in_progress: "#2b8a3e",
  completed: "#868e96",
};

const STATUS_LABELS: Record<SalesEvent["status"], string> = {
  upcoming: "Upcoming",
  in_progress: "In Progress",
  completed: "Completed",
};

const TYPE_COLORS: Record<SalesEvent["type"], string> = {
  conference: "#3b5bdb",
  tradeshow: "#1e2a5e",
  webinar: "#2b8a3e",
  meetup: "#f59f00",
  dinner: "#e03131",
  workshop: "#7048e8",
};

const TIER_COLORS: Record<string, string> = {
  hot: "#e03131",
  warm: "#f59f00",
  cold: "#3b5bdb",
};

const OUTREACH_STATUS_LABELS: Record<EventAttendee["outreachStatus"], { label: string; color: string }> = {
  not_started: { label: "Not Started", color: "#868e96" },
  scheduled: { label: "Scheduled", color: "#3b5bdb" },
  contacted: { label: "Contacted", color: "#f59f00" },
  meeting_booked: { label: "Meeting Booked", color: "#2b8a3e" },
  no_show: { label: "No Show", color: "#e03131" },
};

const CHANNEL_ICONS: Record<OutreachChannel, typeof Mail> = {
  email: Mail,
  linkedin: Linkedin,
  call: Phone,
  sms: Phone,
  whatsapp: Phone,
};

// ─── Helpers ────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

// ─── Component ──────────────────────────────────────────────────

export default function EventCommandCenter({
  events,
  leads,
  onNavigateToLead,
  language,
}: EventCommandCenterProps) {
  const [activeTab, setActiveTab] = useState<SubTab>("overview");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [territoryFilter, setTerritoryFilter] = useState<string>("all");
  const [sortByIcp, setSortByIcp] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);

  // Suppress unused-var lint for language (used in future i18n) and leads (used for navigation)
  void language;
  void leads;

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;

  // ─── Attendees filtering/sorting ─────────────────────────────

  const filteredAttendees = useMemo(() => {
    if (!selectedEvent) return [];
    let list = [...selectedEvent.attendees];

    if (territoryFilter !== "all") {
      list = list.filter((a) => a.territory === territoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (a) =>
          `${a.firstName} ${a.lastName}`.toLowerCase().includes(q) ||
          a.company.toLowerCase().includes(q) ||
          a.position.toLowerCase().includes(q)
      );
    }
    if (sortByIcp) {
      list.sort((a, b) => (b.icpScore ?? 0) - (a.icpScore ?? 0));
    }
    return list;
  }, [selectedEvent, territoryFilter, searchQuery, sortByIcp]);

  // ─── Generate outreach plan ──────────────────────────────────

  const handleGeneratePlan = async () => {
    if (!selectedEvent) return;
    setGeneratingPlan(true);
    try {
      const res = await fetch("/api/events/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: selectedEvent,
          attendees: selectedEvent.attendees,
          language,
        }),
      });
      if (res.ok) {
        const { plan } = await res.json();
        console.log("[EventCommandCenter] Plan generated:", plan);
        // In a real app we'd update state/store here
      }
    } catch (err) {
      console.error("Failed to generate plan:", err);
    } finally {
      setGeneratingPlan(false);
    }
  };

  // ─── Select event and switch to attendees ────────────────────

  const selectEvent = (id: string) => {
    setSelectedEventId(id);
    setActiveTab("attendees");
    setTerritoryFilter("all");
    setSearchQuery("");
  };

  // ─── Render helpers ──────────────────────────────────────────

  const renderOverview = () => (
    <div style={{ display: "grid", gap: 14 }}>
      {events.map((evt) => {
        const days = daysUntil(evt.date);
        const isSelected = evt.id === selectedEventId;
        return (
          <div
            key={evt.id}
            onClick={() => selectEvent(evt.id)}
            style={{
              padding: 16,
              borderRadius: 12,
              border: `1.5px solid ${isSelected ? "#3b5bdb" : "#e9ecef"}`,
              background: isSelected ? "#f0f4ff" : "#fff",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <h4 style={{ fontSize: 15, fontWeight: 700, color: "#1e2a5e", margin: 0 }}>
                    {evt.name}
                  </h4>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: TYPE_COLORS[evt.type] + "18",
                      color: TYPE_COLORS[evt.type],
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {evt.type}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, color: "#6c757d" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Calendar size={13} /> {formatDate(evt.date)}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <MapPin size={13} /> {evt.location}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: 20,
                    background: STATUS_COLORS[evt.status] + "20",
                    color: STATUS_COLORS[evt.status],
                  }}
                >
                  {STATUS_LABELS[evt.status]}
                </span>
                <ChevronRight size={16} style={{ color: "#adb5bd" }} />
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#495057" }}>
                <Users size={13} style={{ color: "#3b5bdb" }} />
                <span style={{ fontWeight: 600 }}>{evt.attendees.length}</span> attendees
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#495057" }}>
                <Target size={13} style={{ color: "#2b8a3e" }} />
                <span style={{ fontWeight: 600 }}>{evt.teamProgress.meetingsBooked}</span> meetings
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#495057" }}>
                <Globe size={13} style={{ color: "#f59f00" }} />
                {evt.territories.join(", ")}
              </div>
              {evt.status === "upcoming" && days > 0 && (
                <span style={{ color: "#f59f00", fontWeight: 600 }}>
                  {days} day{days !== 1 ? "s" : ""} away
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderAttendees = () => {
    if (!selectedEvent) {
      return (
        <div style={{ textAlign: "center", padding: 40, color: "#868e96" }}>
          <Users size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
          <p style={{ fontSize: 13 }}>Select an event from the Overview tab to view attendees.</p>
        </div>
      );
    }

    return (
      <div>
        {/* Toolbar */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#adb5bd" }} />
            <input
              type="text"
              placeholder="Search attendees..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px 8px 32px",
                fontSize: 12,
                border: "1px solid #dee2e6",
                borderRadius: 8,
                outline: "none",
                background: "#fff",
              }}
            />
          </div>

          {/* Territory filter */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Filter size={13} style={{ color: "#6c757d" }} />
            <select
              value={territoryFilter}
              onChange={(e) => setTerritoryFilter(e.target.value)}
              style={{
                fontSize: 12,
                padding: "7px 10px",
                border: "1px solid #dee2e6",
                borderRadius: 8,
                background: "#fff",
                color: "#495057",
                cursor: "pointer",
              }}
            >
              <option value="all">All Territories</option>
              {selectedEvent.territories.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Sort by ICP */}
          <button
            onClick={() => setSortByIcp(!sortByIcp)}
            style={{
              fontSize: 11,
              padding: "7px 12px",
              border: `1px solid ${sortByIcp ? "#3b5bdb" : "#dee2e6"}`,
              borderRadius: 8,
              background: sortByIcp ? "#3b5bdb10" : "#fff",
              color: sortByIcp ? "#3b5bdb" : "#495057",
              cursor: "pointer",
              fontWeight: sortByIcp ? 600 : 400,
            }}
          >
            Sort by ICP
          </button>
        </div>

        {/* Attendee list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filteredAttendees.length === 0 ? (
            <p style={{ textAlign: "center", color: "#868e96", fontSize: 13, padding: 20 }}>
              No attendees match your filters.
            </p>
          ) : (
            filteredAttendees.map((att) => {
              const status = OUTREACH_STATUS_LABELS[att.outreachStatus];
              return (
                <div
                  key={att.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #e9ecef",
                    background: "#fff",
                    fontSize: 12,
                  }}
                >
                  {/* Name & company */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "#1e2a5e", fontSize: 13 }}>
                      {att.firstName} {att.lastName}
                    </div>
                    <div style={{ color: "#6c757d", fontSize: 11 }}>
                      {att.position} at {att.company}
                    </div>
                  </div>

                  {/* Territory */}
                  <span
                    style={{
                      fontSize: 10,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: "#f1f3f5",
                      color: "#495057",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {att.territory}
                  </span>

                  {/* ICP */}
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: (att.icpScore ?? 0) >= 80 ? "#2b8a3e" : (att.icpScore ?? 0) >= 60 ? "#f59f00" : "#868e96",
                      minWidth: 30,
                      textAlign: "center",
                    }}
                  >
                    {att.icpScore ?? "--"}
                  </span>

                  {/* Tier badge */}
                  {att.tier && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: TIER_COLORS[att.tier] + "15",
                        color: TIER_COLORS[att.tier],
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      {att.tier}
                    </span>
                  )}

                  {/* Outreach status */}
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: status.color + "18",
                      color: status.color,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {status.label}
                  </span>

                  {/* Quick action buttons */}
                  <div style={{ display: "flex", gap: 4 }}>
                    {att.email && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(`mailto:${att.email}`, "_blank");
                        }}
                        title="Send email"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          border: "1px solid #dee2e6",
                          background: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: "#495057",
                        }}
                      >
                        <Mail size={13} />
                      </button>
                    )}
                    {att.linkedinUrl && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(att.linkedinUrl, "_blank");
                        }}
                        title="View LinkedIn"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          border: "1px solid #dee2e6",
                          background: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: "#0a66c2",
                        }}
                      >
                        <Linkedin size={13} />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Try to find matching lead
                        const matchedLead = leads.find(
                          (l) =>
                            l.firstName === att.firstName &&
                            l.lastName === att.lastName &&
                            l.company === att.company
                        );
                        if (matchedLead) {
                          onNavigateToLead(matchedLead.id);
                        }
                      }}
                      title="Call"
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        border: "1px solid #dee2e6",
                        background: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        color: "#2b8a3e",
                      }}
                    >
                      <Phone size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  const renderOutreach = () => {
    if (!selectedEvent) {
      return (
        <div style={{ textAlign: "center", padding: 40, color: "#868e96" }}>
          <Mail size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
          <p style={{ fontSize: 13 }}>Select an event from the Overview tab to view outreach plans.</p>
        </div>
      );
    }

    const plan = selectedEvent.outreachPlan;

    if (!plan) {
      return (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Target size={32} style={{ marginBottom: 12, color: "#adb5bd" }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: "#1e2a5e", marginBottom: 6 }}>
            No outreach plan yet
          </p>
          <p style={{ fontSize: 12, color: "#868e96", marginBottom: 16 }}>
            Generate an AI-powered outreach plan with pre-event, at-event, and post-event sequences.
          </p>
          <button
            onClick={handleGeneratePlan}
            disabled={generatingPlan}
            style={{
              padding: "10px 24px",
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              borderRadius: 8,
              background: generatingPlan ? "#adb5bd" : "linear-gradient(135deg, #3b5bdb, #1e2a5e)",
              color: "#fff",
              cursor: generatingPlan ? "not-allowed" : "pointer",
            }}
          >
            {generatingPlan ? "Generating..." : "Generate Outreach Plan"}
          </button>
        </div>
      );
    }

    const renderSequenceStep = (
      step: { step: number; channel: OutreachChannel; template: string; timing: string },
      idx: number
    ) => {
      const IconComp = CHANNEL_ICONS[step.channel] || Mail;
      return (
        <div
          key={idx}
          style={{
            display: "flex",
            gap: 12,
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #e9ecef",
            background: "#fff",
            alignItems: "flex-start",
          }}
        >
          {/* Step number */}
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "#3b5bdb15",
              color: "#3b5bdb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {step.step}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Channel + timing */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#3b5bdb",
                  textTransform: "capitalize",
                }}
              >
                <IconComp size={12} /> {step.channel}
              </span>
              <span style={{ fontSize: 10, color: "#868e96" }}>{step.timing}</span>
            </div>
            {/* Template preview */}
            <p style={{ fontSize: 12, color: "#495057", margin: 0, lineHeight: 1.5 }}>
              {step.template.length > 200 ? step.template.slice(0, 200) + "..." : step.template}
            </p>
          </div>
        </div>
      );
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Generate plan button */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={handleGeneratePlan}
            disabled={generatingPlan}
            style={{
              padding: "7px 16px",
              fontSize: 11,
              fontWeight: 600,
              border: "1px solid #3b5bdb",
              borderRadius: 8,
              background: generatingPlan ? "#f1f3f5" : "#fff",
              color: "#3b5bdb",
              cursor: generatingPlan ? "not-allowed" : "pointer",
            }}
          >
            {generatingPlan ? "Regenerating..." : "Regenerate Plan"}
          </button>
        </div>

        {/* Pre-event */}
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: "#1e2a5e", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59f00" }} />
            Pre-Event Sequence
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {plan.preEventSequence.map((s, i) => renderSequenceStep(s, i))}
          </div>
        </div>

        {/* At-event */}
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: "#1e2a5e", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2b8a3e" }} />
            At-Event Tasks
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {plan.atEventTasks.map((task, i) => (
              <div
                key={i}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid #e9ecef",
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 12,
                  color: "#495057",
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "#2b8a3e15",
                    color: "#2b8a3e",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
                {task}
              </div>
            ))}
          </div>
        </div>

        {/* Post-event */}
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: "#1e2a5e", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b5bdb" }} />
            Post-Event Sequence
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {plan.postEventSequence.map((s, i) => renderSequenceStep(s, i))}
          </div>
        </div>

        {/* Goals */}
        <div
          style={{
            padding: 14,
            borderRadius: 10,
            background: "#f8f9fa",
            border: "1px solid #e9ecef",
          }}
        >
          <h4 style={{ fontSize: 12, fontWeight: 700, color: "#1e2a5e", marginBottom: 8 }}>
            Event Goals
          </h4>
          <div style={{ display: "flex", gap: 24, fontSize: 12 }}>
            <div>
              <span style={{ color: "#868e96" }}>Meetings: </span>
              <span style={{ fontWeight: 700, color: "#2b8a3e" }}>{plan.goals.meetingsTarget}</span>
            </div>
            <div>
              <span style={{ color: "#868e96" }}>Leads: </span>
              <span style={{ fontWeight: 700, color: "#3b5bdb" }}>{plan.goals.leadsTarget}</span>
            </div>
            <div>
              <span style={{ color: "#868e96" }}>Connections: </span>
              <span style={{ fontWeight: 700, color: "#f59f00" }}>{plan.goals.connectionsTarget}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderProgress = () => {
    if (!selectedEvent) {
      return (
        <div style={{ textAlign: "center", padding: 40, color: "#868e96" }}>
          <BarChart3 size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
          <p style={{ fontSize: 13 }}>Select an event from the Overview tab to view progress.</p>
        </div>
      );
    }

    const tp = selectedEvent.teamProgress;
    const contactedPct = tp.totalAttendees > 0 ? Math.round((tp.contacted / tp.totalAttendees) * 100) : 0;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Overall stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {[
            { label: "Total Attendees", value: tp.totalAttendees, color: "#1e2a5e" },
            { label: "Contacted", value: `${contactedPct}%`, color: "#3b5bdb" },
            { label: "Meetings Booked", value: tp.meetingsBooked, color: "#2b8a3e" },
            { label: "No-Shows", value: tp.noShows, color: "#e03131" },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                textAlign: "center",
                padding: 14,
                borderRadius: 10,
                background: "#f8f9fa",
                border: "1px solid #e9ecef",
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: "#868e96", marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* By territory */}
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: "#1e2a5e", marginBottom: 10 }}>
            By Territory
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {tp.byTerritory.map((t) => {
              const contactPct = t.total > 0 ? Math.round((t.contacted / t.total) * 100) : 0;
              const meetingPct = t.total > 0 ? Math.round((t.meetings / t.total) * 100) : 0;
              return (
                <div key={t.territory} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #e9ecef", background: "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12 }}>
                    <span style={{ fontWeight: 600, color: "#1e2a5e" }}>{t.territory}</span>
                    <span style={{ color: "#868e96" }}>
                      {t.contacted}/{t.total} contacted | {t.meetings} meetings
                    </span>
                  </div>
                  {/* Contacted bar */}
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#868e96", marginBottom: 2 }}>
                      <span>Contacted</span>
                      <span>{contactPct}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: "#e9ecef" }}>
                      <div
                        style={{
                          height: "100%",
                          borderRadius: 3,
                          width: `${contactPct}%`,
                          background: "linear-gradient(90deg, #3b5bdb, #1e2a5e)",
                          transition: "width 0.3s",
                        }}
                      />
                    </div>
                  </div>
                  {/* Meetings bar */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#868e96", marginBottom: 2 }}>
                      <span>Meetings</span>
                      <span>{meetingPct}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: "#e9ecef" }}>
                      <div
                        style={{
                          height: "100%",
                          borderRadius: 3,
                          width: `${meetingPct}%`,
                          background: "linear-gradient(90deg, #2b8a3e, #099268)",
                          transition: "width 0.3s",
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Team member progress */}
        {selectedEvent.attendees.some((a) => a.assignedTo) && (
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: "#1e2a5e", marginBottom: 10 }}>
              Team Member Progress
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(() => {
                const memberMap = new Map<string, { total: number; contacted: number; meetings: number }>();
                selectedEvent.attendees.forEach((a) => {
                  const name = a.assignedTo || "Unassigned";
                  const prev = memberMap.get(name) || { total: 0, contacted: 0, meetings: 0 };
                  prev.total += 1;
                  if (a.outreachStatus !== "not_started") prev.contacted += 1;
                  if (a.outreachStatus === "meeting_booked") prev.meetings += 1;
                  memberMap.set(name, prev);
                });
                return Array.from(memberMap.entries()).map(([name, stats]) => (
                  <div
                    key={name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: "1px solid #e9ecef",
                      background: "#fff",
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "#1e2a5e", minWidth: 80 }}>{name}</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: "#e9ecef" }}>
                      <div
                        style={{
                          height: "100%",
                          borderRadius: 3,
                          width: `${stats.total > 0 ? Math.round((stats.contacted / stats.total) * 100) : 0}%`,
                          background: "linear-gradient(90deg, #3b5bdb, #1e2a5e)",
                        }}
                      />
                    </div>
                    <span style={{ color: "#868e96", whiteSpace: "nowrap" }}>
                      {stats.contacted}/{stats.total} contacted
                    </span>
                    <span style={{ color: "#2b8a3e", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {stats.meetings} mtg{stats.meetings !== 1 ? "s" : ""}
                    </span>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Main Render ─────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "linear-gradient(135deg, #3b5bdb15, #1e2a5e15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Calendar size={18} style={{ color: "#3b5bdb" }} />
          </div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1e2a5e", margin: 0 }}>
              Event Command Center
            </h2>
            <p style={{ fontSize: 12, color: "#868e96", margin: 0 }}>
              {events.length} event{events.length !== 1 ? "s" : ""}
              {selectedEvent ? ` | ${selectedEvent.name}` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 16, background: "#f1f3f5", borderRadius: 10, padding: 3 }}>
        {SUB_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              padding: "8px 0",
              fontSize: 12,
              fontWeight: activeTab === tab.key ? 600 : 400,
              border: "none",
              borderRadius: 8,
              background: activeTab === tab.key ? "#fff" : "transparent",
              color: activeTab === tab.key ? "#1e2a5e" : "#868e96",
              cursor: "pointer",
              transition: "all 0.15s",
              boxShadow: activeTab === tab.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && renderOverview()}
      {activeTab === "attendees" && renderAttendees()}
      {activeTab === "outreach" && renderOutreach()}
      {activeTab === "progress" && renderProgress()}
    </div>
  );
}
