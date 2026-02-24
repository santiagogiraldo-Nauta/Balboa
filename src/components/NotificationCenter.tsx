"use client";

import { useState, useMemo } from "react";
import {
  Bell, Mail, Eye, Clock, AlertTriangle,
  TrendingUp, User, Settings, CheckCircle,
  Smartphone,
} from "lucide-react";
import type { Lead } from "@/lib/types";

// ── Local types (will move to types.ts) ─────────────────────────────────────

interface BalboaNotification {
  id: string;
  title: string;
  body: string;
  priority: "urgent" | "high" | "normal" | "low";
  channel: "email" | "whatsapp" | "in_app";
  relatedLeadId?: string;
  read: boolean;
  sentAt: string;
}

type NotificationFilter = "all" | "unread" | "urgent";

type UrgencyThreshold = "urgent_only" | "high_and_above" | "all";

interface NotificationPreferences {
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  urgencyThreshold: UrgencyThreshold;
  signalTypes: {
    emailOpened: boolean;
    profileViewed: boolean;
    dealStageChange: boolean;
    followUpNeeded: boolean;
    newSignal: boolean;
    meetingBooked: boolean;
  };
}

// ── Mock data generator ─────────────────────────────────────────────────────

function generateMockNotifications(leads: Lead[]): BalboaNotification[] {
  const now = new Date();
  const notifications: BalboaNotification[] = [];

  // Generate notifications based on available leads
  if (leads.length > 0) {
    const lead0 = leads[0];
    notifications.push({
      id: "notif-1",
      title: `Hot lead ${lead0.firstName} ${lead0.lastName} opened your email`,
      body: `${lead0.firstName} from ${lead0.company} opened your "Supply Chain Optimization" email 12 minutes ago. They also clicked the case study link. Strike while the iron is hot!`,
      priority: "urgent",
      channel: "in_app",
      relatedLeadId: lead0.id,
      read: false,
      sentAt: new Date(now.getTime() - 12 * 60 * 1000).toISOString(),
    });
  }

  if (leads.length > 1) {
    const lead1 = leads[1];
    notifications.push({
      id: "notif-2",
      title: `Follow up needed: ${lead1.firstName} ${lead1.lastName} hasn't responded in 7 days`,
      body: `Your last email to ${lead1.firstName} at ${lead1.company} was sent 7 days ago with no response. Consider sending a follow-up or trying a different channel.`,
      priority: "high",
      channel: "in_app",
      relatedLeadId: lead1.id,
      read: false,
      sentAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    });
  }

  if (leads.length > 2) {
    const lead2 = leads[2];
    notifications.push({
      id: "notif-3",
      title: `Deal ${lead2.company} moved to Negotiation stage`,
      body: `The deal with ${lead2.company} has been moved to Negotiation. Estimated value: $250K. Next step: prepare contract terms and pricing matrix.`,
      priority: "normal",
      channel: "in_app",
      relatedLeadId: lead2.id,
      read: false,
      sentAt: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
    });
  }

  if (leads.length > 3) {
    const lead3 = leads[3];
    notifications.push({
      id: "notif-4",
      title: `New signal: ${lead3.firstName} ${lead3.lastName} viewed your LinkedIn profile`,
      body: `${lead3.firstName} (${lead3.position} at ${lead3.company}) viewed your LinkedIn profile. This could indicate interest -- consider sending a personalized connection message.`,
      priority: "high",
      channel: "in_app",
      relatedLeadId: lead3.id,
      read: false,
      sentAt: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
    });
  }

  // Add some generic notifications
  notifications.push({
    id: "notif-5",
    title: "Weekly performance report ready",
    body: "Your weekly outreach report shows 23% reply rate (up 5% from last week). Top performing sequence: Hot Lead Outreach with 35% reply rate.",
    priority: "normal",
    channel: "email",
    read: true,
    sentAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
  });

  if (leads.length > 4) {
    const lead4 = leads[4];
    notifications.push({
      id: "notif-6",
      title: `Meeting booked: ${lead4.firstName} ${lead4.lastName} confirmed for Thursday`,
      body: `${lead4.firstName} from ${lead4.company} confirmed a 30-minute discovery call for Thursday at 2pm EST. Prep kit has been auto-generated.`,
      priority: "high",
      channel: "in_app",
      relatedLeadId: lead4.id,
      read: true,
      sentAt: new Date(now.getTime() - 28 * 60 * 60 * 1000).toISOString(),
    });
  }

  notifications.push({
    id: "notif-7",
    title: "Sequence 'Re-engagement' completed for 5 leads",
    body: "The Re-engagement sequence has completed for 5 leads. Results: 2 replies received, 1 meeting booked, 2 no response. Consider adjusting messaging for non-responders.",
    priority: "normal",
    channel: "in_app",
    read: true,
    sentAt: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
  });

  if (leads.length > 5) {
    const lead5 = leads[5];
    notifications.push({
      id: "notif-8",
      title: `Competitor alert: ${lead5.company} evaluating FourKites`,
      body: `Market intelligence suggests ${lead5.company} is also evaluating FourKites for their supply chain visibility needs. Battle card has been updated with latest competitive intel.`,
      priority: "high",
      channel: "in_app",
      relatedLeadId: lead5.id,
      read: false,
      sentAt: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(),
    });
  }

  return notifications;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = new Date().getTime();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  return `${diffDays}d ago`;
}

// ── Style config ────────────────────────────────────────────────────────────

const priorityConfig: Record<string, { color: string; bg: string; border: string; label: string; icon: typeof AlertTriangle }> = {
  urgent: { color: "#e03131", bg: "#fef2f2", border: "#ffa8a8", label: "URGENT", icon: AlertTriangle },
  high: { color: "#d97706", bg: "#fffbeb", border: "#ffe066", label: "HIGH", icon: TrendingUp },
  normal: { color: "#3b5bdb", bg: "#eff6ff", border: "#bac8ff", label: "NORMAL", icon: Bell },
  low: { color: "#868e96", bg: "#f8f9fa", border: "#dee2e6", label: "LOW", icon: Clock },
};

const notifTypeIcons: Record<string, { icon: typeof Mail; color: string }> = {
  email_opened: { icon: Eye, color: "#3b5bdb" },
  follow_up: { icon: Clock, color: "#d97706" },
  deal_stage: { icon: TrendingUp, color: "#2b8a3e" },
  profile_viewed: { icon: User, color: "#7c3aed" },
  meeting: { icon: CheckCircle, color: "#059669" },
  report: { icon: Mail, color: "#868e96" },
  sequence: { icon: Bell, color: "#3b5bdb" },
  competitor: { icon: AlertTriangle, color: "#e03131" },
};

function getNotifIcon(title: string): { icon: typeof Mail; color: string } {
  if (title.toLowerCase().includes("opened")) return notifTypeIcons.email_opened;
  if (title.toLowerCase().includes("follow up")) return notifTypeIcons.follow_up;
  if (title.toLowerCase().includes("deal") || title.toLowerCase().includes("moved")) return notifTypeIcons.deal_stage;
  if (title.toLowerCase().includes("viewed") || title.toLowerCase().includes("profile")) return notifTypeIcons.profile_viewed;
  if (title.toLowerCase().includes("meeting") || title.toLowerCase().includes("booked")) return notifTypeIcons.meeting;
  if (title.toLowerCase().includes("report") || title.toLowerCase().includes("weekly")) return notifTypeIcons.report;
  if (title.toLowerCase().includes("sequence") || title.toLowerCase().includes("completed")) return notifTypeIcons.sequence;
  if (title.toLowerCase().includes("competitor") || title.toLowerCase().includes("alert")) return notifTypeIcons.competitor;
  return { icon: Bell, color: "#868e96" };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function NotificationCenter({ leads }: { leads: Lead[] }) {
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [showSettings, setShowSettings] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const [preferences, setPreferences] = useState<NotificationPreferences>({
    emailEnabled: true,
    whatsappEnabled: false,
    urgencyThreshold: "high_and_above",
    signalTypes: {
      emailOpened: true,
      profileViewed: true,
      dealStageChange: true,
      followUpNeeded: true,
      newSignal: true,
      meetingBooked: true,
    },
  });

  const allNotifications = useMemo(() => generateMockNotifications(leads), [leads]);

  // Apply read state from local state
  const notifications = useMemo(() => {
    return allNotifications.map((n) => ({
      ...n,
      read: n.read || readIds.has(n.id),
    }));
  }, [allNotifications, readIds]);

  const filteredNotifications = useMemo(() => {
    switch (filter) {
      case "unread":
        return notifications.filter((n) => !n.read);
      case "urgent":
        return notifications.filter((n) => n.priority === "urgent" || n.priority === "high");
      default:
        return notifications;
    }
  }, [notifications, filter]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAsRead = (notifId: string) => {
    setReadIds((prev) => new Set(prev).add(notifId));
  };

  const handleMarkAllRead = () => {
    const newSet = new Set(readIds);
    notifications.forEach((n) => newSet.add(n.id));
    setReadIds(newSet);
  };

  const cardStyle: React.CSSProperties = {
    background: "white",
    borderRadius: 12,
    border: "1px solid #f1f3f5",
    boxShadow: "0 1px 4px rgba(30,42,94,0.04)",
    padding: "20px 24px",
  };

  const urgencyThresholdLabels: Record<UrgencyThreshold, string> = {
    urgent_only: "Urgent only",
    high_and_above: "High & above",
    all: "All notifications",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, #1e2a5e, #3b5bdb)",
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative",
          }}>
            <Bell style={{ width: 18, height: 18, color: "white" }} />
            {unreadCount > 0 && (
              <span style={{
                position: "absolute", top: -4, right: -4,
                width: 18, height: 18, borderRadius: "50%",
                background: "#e03131", color: "white",
                fontSize: 9, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "2px solid white",
              }}>
                {unreadCount}
              </span>
            )}
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1e2a5e", margin: 0 }}>
              Notification Center
            </h3>
            <p style={{ fontSize: 12, color: "#868e96", margin: "2px 0 0" }}>
              {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              style={{
                padding: "8px 14px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                background: "white", color: "#3b5bdb", border: "1px solid #bac8ff",
                cursor: "pointer",
              }}
            >
              Mark all read
            </button>
          )}
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 8, fontSize: 11, fontWeight: 600,
              background: showSettings ? "#1e2a5e" : "white",
              color: showSettings ? "white" : "#1e2a5e",
              border: `1px solid ${showSettings ? "#1e2a5e" : "#f1f3f5"}`,
              cursor: "pointer",
            }}
          >
            <Settings style={{ width: 12, height: 12 }} />
            Settings
          </button>
        </div>
      </div>

      {/* ── Settings Panel ────────────────────────────────────────────── */}
      {showSettings && (
        <div style={{
          ...cardStyle,
          border: "2px solid #3b5bdb",
          background: "linear-gradient(135deg, #f8f9ff, #ffffff)",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: "#868e96",
            textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16,
          }}>
            Notification Preferences
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Channel toggles */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1e2a5e", marginBottom: 12 }}>
                Notification Channels
              </div>

              {/* Email toggle */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 14px", borderRadius: 10, background: "#f8f9fa",
                border: "1px solid #f1f3f5", marginBottom: 8,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Mail style={{ width: 16, height: 16, color: "#3b5bdb" }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1e2a5e" }}>Email Notifications</span>
                </div>
                <button
                  onClick={() => setPreferences((p) => ({ ...p, emailEnabled: !p.emailEnabled }))}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                    background: preferences.emailEnabled ? "#2b8a3e" : "#dee2e6",
                    position: "relative", transition: "background 0.2s ease",
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%", background: "white",
                    position: "absolute", top: 3,
                    left: preferences.emailEnabled ? 23 : 3,
                    transition: "left 0.2s ease",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </button>
              </div>

              {/* WhatsApp toggle */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 14px", borderRadius: 10, background: "#f8f9fa",
                border: "1px solid #f1f3f5",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Smartphone style={{ width: 16, height: 16, color: "#25d366" }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1e2a5e" }}>WhatsApp Notifications</span>
                  <span style={{
                    fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                    background: "#eff6ff", color: "#3b5bdb", letterSpacing: "0.05em",
                  }}>
                    COMING SOON
                  </span>
                </div>
                <button
                  disabled
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: "none",
                    background: "#dee2e6", position: "relative", opacity: 0.5,
                    cursor: "not-allowed",
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%", background: "white",
                    position: "absolute", top: 3, left: 3,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </button>
              </div>

              {/* Urgency Threshold */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1e2a5e", marginBottom: 8 }}>
                  Urgency Threshold
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {(["urgent_only", "high_and_above", "all"] as UrgencyThreshold[]).map((threshold) => (
                    <button
                      key={threshold}
                      onClick={() => setPreferences((p) => ({ ...p, urgencyThreshold: threshold }))}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 12px", borderRadius: 8,
                        background: preferences.urgencyThreshold === threshold ? "#1e2a5e" : "white",
                        color: preferences.urgencyThreshold === threshold ? "white" : "#1e2a5e",
                        border: `1px solid ${preferences.urgencyThreshold === threshold ? "#1e2a5e" : "#f1f3f5"}`,
                        cursor: "pointer", fontSize: 12, fontWeight: 500,
                        textAlign: "left",
                      }}
                    >
                      <div style={{
                        width: 14, height: 14, borderRadius: "50%",
                        border: `2px solid ${preferences.urgencyThreshold === threshold ? "white" : "#dee2e6"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {preferences.urgencyThreshold === threshold && (
                          <div style={{
                            width: 6, height: 6, borderRadius: "50%", background: "white",
                          }} />
                        )}
                      </div>
                      {urgencyThresholdLabels[threshold]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Signal type checkboxes */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1e2a5e", marginBottom: 12 }}>
                Signal Types to Notify
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {([
                  { key: "emailOpened" as const, label: "Email opened / clicked" },
                  { key: "profileViewed" as const, label: "LinkedIn profile viewed" },
                  { key: "dealStageChange" as const, label: "Deal stage changes" },
                  { key: "followUpNeeded" as const, label: "Follow-up reminders" },
                  { key: "newSignal" as const, label: "New buying signals" },
                  { key: "meetingBooked" as const, label: "Meeting booked / confirmed" },
                ]).map((signal) => (
                  <label
                    key={signal.key}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                      background: preferences.signalTypes[signal.key] ? "#f8f9fa" : "white",
                      border: "1px solid #f1f3f5",
                      transition: "background 0.1s ease",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={preferences.signalTypes[signal.key]}
                      onChange={() =>
                        setPreferences((p) => ({
                          ...p,
                          signalTypes: {
                            ...p.signalTypes,
                            [signal.key]: !p.signalTypes[signal.key],
                          },
                        }))
                      }
                      style={{
                        width: 16, height: 16, borderRadius: 4,
                        accentColor: "#3b5bdb", cursor: "pointer",
                      }}
                    />
                    <span style={{ fontSize: 12, color: "#1e2a5e", fontWeight: 500 }}>
                      {signal.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Filter Tabs ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8 }}>
        {([
          { key: "all" as const, label: "All", count: notifications.length },
          { key: "unread" as const, label: "Unread", count: unreadCount },
          { key: "urgent" as const, label: "Urgent / High", count: notifications.filter((n) => n.priority === "urgent" || n.priority === "high").length },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: "1px solid",
              cursor: "pointer", transition: "all 0.15s ease",
              background: filter === tab.key ? "#1e2a5e" : "white",
              color: filter === tab.key ? "white" : "#1e2a5e",
              borderColor: filter === tab.key ? "#1e2a5e" : "#f1f3f5",
            }}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* ── Notification List ────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filteredNotifications.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: "center", padding: 40, color: "#868e96", fontSize: 13 }}>
            {filter === "unread" ? "No unread notifications" :
             filter === "urgent" ? "No urgent notifications" :
             "No notifications yet"}
          </div>
        ) : (
          filteredNotifications.map((notif) => {
            const pc = priorityConfig[notif.priority];
            const iconInfo = getNotifIcon(notif.title);
            const NotifIcon = iconInfo.icon;

            return (
              <div
                key={notif.id}
                onClick={() => handleMarkAsRead(notif.id)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 14,
                  padding: "16px 20px", borderRadius: 12,
                  background: notif.read ? "white" : "#fafbff",
                  border: `1px solid ${notif.read ? "#f1f3f5" : "#e8ecff"}`,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  boxShadow: notif.read ? "none" : "0 1px 4px rgba(59,91,219,0.06)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(30,42,94,0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = notif.read ? "none" : "0 1px 4px rgba(59,91,219,0.06)";
                }}
              >
                {/* Unread dot */}
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: notif.read ? "transparent" : "#3b5bdb",
                  flexShrink: 0, marginTop: 6,
                  border: notif.read ? "1px solid #dee2e6" : "none",
                }} />

                {/* Icon */}
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: pc.bg, border: `1px solid ${pc.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <NotifIcon style={{ width: 16, height: 16, color: iconInfo.color }} />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{
                      fontSize: 13, fontWeight: notif.read ? 500 : 700,
                      color: "#1e2a5e", lineHeight: 1.4,
                    }}>
                      {notif.title}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <span style={{
                        fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                        background: pc.bg, color: pc.color, border: `1px solid ${pc.border}`,
                        letterSpacing: "0.05em",
                      }}>
                        {pc.label}
                      </span>
                    </div>
                  </div>
                  <div style={{
                    fontSize: 11, color: "#868e96", lineHeight: 1.5,
                    marginTop: 4, maxHeight: 44, overflow: "hidden",
                  }}>
                    {notif.body}
                  </div>
                  <div style={{
                    fontSize: 10, color: "#adb5bd", marginTop: 6,
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <Clock style={{ width: 10, height: 10 }} />
                    {timeAgo(notif.sentAt)}
                    {notif.channel !== "in_app" && (
                      <span style={{
                        fontSize: 9, padding: "1px 6px", borderRadius: 4,
                        background: "#f8f9fa", color: "#868e96",
                      }}>
                        via {notif.channel}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
