"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Mail,
  Linkedin,
  MessageSquare,
  MessageCircle,
  Phone,
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Clock,
} from "lucide-react";
import type {
  Lead,
  CommunicationThread,
  CommunicationMessage,
  OutreachChannel,
} from "@/lib/types";
import { trackEventClient } from "@/lib/tracking";

interface CommunicationHubProps {
  lead: Lead;
  communications: CommunicationThread[];
}

const CHANNEL_CONFIG: Record<
  OutreachChannel,
  { icon: typeof Mail; color: string; label: string }
> = {
  email: { icon: Mail, color: "#d97706", label: "Email" },
  linkedin: { icon: Linkedin, color: "#0077b5", label: "LinkedIn" },
  sms: { icon: MessageSquare, color: "#059669", label: "SMS" },
  whatsapp: { icon: MessageCircle, color: "#25D366", label: "WhatsApp" },
  call: { icon: Phone, color: "#7c3aed", label: "Calls" },
};

const STATUS_ICONS: Record<string, { label: string; color: string }> = {
  sent: { label: "Sent", color: "#6b7280" },
  delivered: { label: "Delivered", color: "#3b82f6" },
  read: { label: "Read", color: "#059669" },
  replied: { label: "Replied", color: "#2b8a3e" },
  bounced: { label: "Bounced", color: "#e03131" },
  failed: { label: "Failed", color: "#e03131" },
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type FilterChannel = "all" | OutreachChannel;

export default function CommunicationHub({
  lead,
  communications,
}: CommunicationHubProps) {
  const [activeChannel, setActiveChannel] = useState<FilterChannel>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    trackEventClient({ eventCategory: "communication", eventAction: "communication_hub_viewed" });
  }, []);

  const toggleThread = (threadId: string) => {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) {
        next.delete(threadId);
        trackEventClient({ eventCategory: "communication", eventAction: "communication_thread_collapsed", metadata: { threadId } });
      } else {
        next.add(threadId);
        const thread = communications.find((t) => t.id === threadId);
        trackEventClient({ eventCategory: "communication", eventAction: "communication_thread_expanded", metadata: { threadId, channel: thread?.channel } });
      }
      return next;
    });
  };

  // Count messages per channel
  const channelCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: 0,
      email: 0,
      linkedin: 0,
      sms: 0,
      whatsapp: 0,
      call: 0,
    };
    for (const thread of communications) {
      counts[thread.channel] += thread.messages.length;
      counts.all += thread.messages.length;
    }
    return counts;
  }, [communications]);

  // Filter threads
  const filteredThreads = useMemo(() => {
    let threads = communications;

    // Channel filter
    if (activeChannel !== "all") {
      threads = threads.filter((t) => t.channel === activeChannel);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      threads = threads.filter(
        (t) =>
          (t.subject && t.subject.toLowerCase().includes(q)) ||
          t.messages.some(
            (m) =>
              m.body.toLowerCase().includes(q) ||
              m.sender.toLowerCase().includes(q)
          )
      );
    }

    // Sort by last message date descending
    return [...threads].sort(
      (a, b) =>
        new Date(b.lastMessageDate).getTime() -
        new Date(a.lastMessageDate).getTime()
    );
  }, [communications, activeChannel, searchQuery]);

  const tabs: { key: FilterChannel; label: string }[] = [
    { key: "all", label: "All" },
    { key: "email", label: "Email" },
    { key: "linkedin", label: "LinkedIn" },
    { key: "sms", label: "SMS" },
    { key: "whatsapp", label: "WhatsApp" },
    { key: "call", label: "Calls" },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 0,
        maxHeight: 500,
        overflow: "hidden",
      }}
    >
      {/* Search bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "var(--balboa-bg-alt, #f8f9fa)",
          borderRadius: 8,
          marginBottom: 8,
          border: "1px solid var(--balboa-border-light, #e5e7eb)",
        }}
      >
        <Search
          className="w-3.5 h-3.5"
          style={{ color: "#9ca3af", flexShrink: 0 }}
        />
        <input
          type="text"
          placeholder="Search messages..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 12,
            color: "var(--balboa-navy, #1e2a5e)",
          }}
        />
      </div>

      {/* Channel filter tabs */}
      <div
        style={{
          display: "flex",
          gap: 2,
          marginBottom: 8,
          overflowX: "auto",
          paddingBottom: 2,
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeChannel === tab.key;
          const count = channelCounts[tab.key] || 0;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveChannel(tab.key);
                trackEventClient({ eventCategory: "communication", eventAction: "communication_channel_filtered", metadata: { channel: tab.key } });
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                borderRadius: 16,
                border: isActive
                  ? "1px solid #3b5bdb"
                  : "1px solid var(--balboa-border-light, #e5e7eb)",
                background: isActive ? "#3b5bdb" : "transparent",
                color: isActive
                  ? "#ffffff"
                  : "var(--balboa-text-secondary, #6b7280)",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
            >
              {tab.label}
              {count > 0 && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "0 5px",
                    borderRadius: 8,
                    background: isActive
                      ? "rgba(255,255,255,0.25)"
                      : "var(--balboa-bg-alt, #f0f0f0)",
                    color: isActive
                      ? "#ffffff"
                      : "var(--balboa-text-muted, #9ca3af)",
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Thread list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {filteredThreads.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "var(--balboa-text-muted, #9ca3af)",
              fontSize: 13,
              fontStyle: "italic",
            }}
          >
            No communications yet
          </div>
        ) : (
          filteredThreads.map((thread) => {
            const isExpanded = expandedThreads.has(thread.id);
            const channelConf = CHANNEL_CONFIG[thread.channel];
            const ChannelIcon = channelConf.icon;
            const lastMsg = thread.messages[thread.messages.length - 1];

            return (
              <div
                key={thread.id}
                style={{
                  borderRadius: 8,
                  border: "1px solid var(--balboa-border-light, #e5e7eb)",
                  background: "var(--balboa-bg-alt, #ffffff)",
                  overflow: "hidden",
                }}
              >
                {/* Thread header */}
                <button
                  onClick={() => toggleThread(thread.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "10px 12px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {/* Channel icon */}
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      flexShrink: 0,
                      background: `${channelConf.color}18`,
                    }}
                  >
                    <ChannelIcon
                      className="w-3.5 h-3.5"
                      style={{ color: channelConf.color }}
                    />
                  </span>

                  {/* Thread info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--balboa-navy, #1e2a5e)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {thread.subject || channelConf.label}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          padding: "1px 6px",
                          borderRadius: 8,
                          background: `${channelConf.color}18`,
                          color: channelConf.color,
                          textTransform: "uppercase",
                          flexShrink: 0,
                        }}
                      >
                        {channelConf.label}
                      </span>
                      {thread.unreadCount > 0 && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: "1px 5px",
                            borderRadius: 8,
                            background: "#e03131",
                            color: "#ffffff",
                            flexShrink: 0,
                          }}
                        >
                          {thread.unreadCount}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--balboa-text-muted, #9ca3af)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginTop: 2,
                      }}
                    >
                      {lastMsg
                        ? `${lastMsg.sender}: ${lastMsg.body.substring(0, 60)}${lastMsg.body.length > 60 ? "..." : ""}`
                        : "No messages"}
                    </div>
                  </div>

                  {/* Time + expand */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--balboa-text-muted, #9ca3af)",
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                      }}
                    >
                      <Clock className="w-2.5 h-2.5" />
                      {timeAgo(thread.lastMessageDate)}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--balboa-text-muted, #9ca3af)",
                      }}
                    >
                      {thread.messages.length} msg
                      {thread.messages.length !== 1 ? "s" : ""}
                    </span>
                    {isExpanded ? (
                      <ChevronUp
                        className="w-3.5 h-3.5"
                        style={{
                          color: "var(--balboa-text-muted, #9ca3af)",
                        }}
                      />
                    ) : (
                      <ChevronDown
                        className="w-3.5 h-3.5"
                        style={{
                          color: "var(--balboa-text-muted, #9ca3af)",
                        }}
                      />
                    )}
                  </div>
                </button>

                {/* Expanded messages */}
                {isExpanded && (
                  <div
                    style={{
                      padding: "4px 12px 12px 12px",
                      borderTop:
                        "1px solid var(--balboa-border-light, #e5e7eb)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      maxHeight: 300,
                      overflowY: "auto",
                    }}
                  >
                    {thread.messages.map((msg: CommunicationMessage) => {
                      const isOutbound = msg.direction === "outbound";
                      const msgChannelConf = CHANNEL_CONFIG[msg.channel];
                      const MsgIcon = msgChannelConf.icon;
                      const statusInfo = STATUS_ICONS[msg.status];

                      return (
                        <div
                          key={msg.id}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: isOutbound ? "flex-end" : "flex-start",
                          }}
                        >
                          {/* Sender + time */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              marginBottom: 3,
                            }}
                          >
                            <MsgIcon
                              className="w-2.5 h-2.5"
                              style={{ color: msgChannelConf.color }}
                            />
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                color: "var(--balboa-text-secondary, #6b7280)",
                              }}
                            >
                              {msg.sender}
                            </span>
                            <span
                              style={{
                                fontSize: 9,
                                color: "var(--balboa-text-muted, #9ca3af)",
                              }}
                            >
                              {formatDate(msg.date)}
                            </span>
                          </div>

                          {/* Message bubble */}
                          <div
                            style={{
                              maxWidth: "85%",
                              padding: "8px 12px",
                              borderRadius: isOutbound
                                ? "12px 12px 2px 12px"
                                : "12px 12px 12px 2px",
                              background: isOutbound ? "#3b5bdb" : "#f3f4f6",
                              color: isOutbound ? "#ffffff" : "#1f2937",
                              fontSize: 12,
                              lineHeight: 1.5,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {msg.subject && (
                              <div
                                style={{
                                  fontWeight: 600,
                                  marginBottom: 4,
                                  fontSize: 11,
                                  opacity: 0.9,
                                }}
                              >
                                Re: {msg.subject}
                              </div>
                            )}
                            {msg.body}
                          </div>

                          {/* Status */}
                          {statusInfo && (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                                marginTop: 3,
                              }}
                            >
                              {msg.status === "read" ||
                              msg.status === "replied" ? (
                                <CheckCircle
                                  className="w-2.5 h-2.5"
                                  style={{ color: statusInfo.color }}
                                />
                              ) : (
                                <Clock
                                  className="w-2.5 h-2.5"
                                  style={{ color: statusInfo.color }}
                                />
                              )}
                              <span
                                style={{
                                  fontSize: 9,
                                  color: statusInfo.color,
                                  fontWeight: 500,
                                }}
                              >
                                {statusInfo.label}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
