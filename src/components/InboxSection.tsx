"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  Mail,
  Linkedin,
  MessageSquare,
  MessageCircle,
  Phone,
  Search,
  Filter,
  Send,
  Sparkles,
  ArrowRight,
  User,
  Clock,
  RefreshCw,
  CheckCircle,
  XCircle,
  Inbox,
} from "lucide-react";
import type {
  Lead,
  CommunicationThread,
  CommunicationMessage,
  OutreachChannel,
  SupportedLanguage,
} from "@/lib/types";
import { trackEventClient } from "@/lib/tracking";

// ─── Props ──────────────────────────────────────────────────────

interface InboxSectionProps {
  leads: Lead[];
  communications: Record<string, CommunicationThread[]>;
  onNavigateToLead: (leadId: string) => void;
  onAskVasco: (prompt: string) => void;
  onCopyMessage: (text: string) => void;
  onGenerateMessage: (lead: Lead, type: string, channel?: "email" | "linkedin") => Promise<void>;
  generatingForLeadId: string | null;
  contentLanguage: SupportedLanguage;
}

// ─── Derived conversation type ──────────────────────────────────

interface InboxConversation {
  threadId: string;
  leadId: string;
  leadName: string;
  leadCompany: string;
  leadPosition: string;
  leadTier: string;
  channel: OutreachChannel;
  subject?: string;
  lastMessage: string;
  lastMessageDate: string;
  lastMessageDirection: "inbound" | "outbound";
  unreadCount: number;
  messages: CommunicationMessage[];
}

// ─── Channel config ─────────────────────────────────────────────

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

const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  sent: { label: "Sent", color: "#6b7280" },
  delivered: { label: "Delivered", color: "#3b82f6" },
  read: { label: "Read", color: "#059669" },
  replied: { label: "Replied", color: "#2b8a3e" },
  bounced: { label: "Bounced", color: "#e03131" },
  failed: { label: "Failed", color: "#e03131" },
};

// ─── Helpers ────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.substring(0, max) + "...";
}

// ─── Filter types ───────────────────────────────────────────────

type ChannelTab = "all" | "linkedin" | "email" | "sms";
type StatusFilter = "all" | "unread" | "needs_reply";

// ─── Component ──────────────────────────────────────────────────

export default function InboxSection({
  leads,
  communications,
  onNavigateToLead,
  onAskVasco,
  onCopyMessage,
  onGenerateMessage,
  generatingForLeadId,
}: InboxSectionProps) {
  // State
  const [activeTab, setActiveTab] = useState<ChannelTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [composeMessage, setComposeMessage] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeChannel, setComposeChannel] = useState<OutreachChannel>("linkedin");
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [localMessages, setLocalMessages] = useState<Record<string, CommunicationMessage[]>>({});

  const threadEndRef = useRef<HTMLDivElement>(null);

  // Build a lead lookup map
  const leadMap = useMemo(() => {
    const map: Record<string, Lead> = {};
    for (const lead of leads) {
      map[lead.id] = lead;
    }
    return map;
  }, [leads]);

  // Build a flat conversation list from communications + draft messages
  const allConversations = useMemo<InboxConversation[]>(() => {
    const convos: InboxConversation[] = [];

    // 1. From communications threads
    for (const [leadId, threads] of Object.entries(communications)) {
      const lead = leadMap[leadId];
      if (!lead) continue;

      for (const thread of threads) {
        if (thread.messages.length === 0) continue;

        const lastMsg = thread.messages[thread.messages.length - 1];
        convos.push({
          threadId: thread.id,
          leadId: lead.id,
          leadName: `${lead.firstName} ${lead.lastName}`,
          leadCompany: lead.company,
          leadPosition: lead.position,
          leadTier: lead.icpScore?.tier || "cold",
          channel: thread.channel,
          subject: thread.subject,
          lastMessage: lastMsg.body,
          lastMessageDate: thread.lastMessageDate,
          lastMessageDirection: lastMsg.direction,
          unreadCount: thread.unreadCount,
          messages: thread.messages,
        });
      }
    }

    // 2. From lead.draftMessages that are sent (convert to conversation threads if not already present)
    for (const lead of leads) {
      if (!lead.draftMessages || lead.draftMessages.length === 0) continue;

      const sentDrafts = lead.draftMessages.filter(d => d.status === "sent");
      if (sentDrafts.length === 0) continue;

      // Group sent drafts by channel
      const draftsByChannel: Record<string, typeof sentDrafts> = {};
      for (const draft of sentDrafts) {
        const ch = draft.channel || "linkedin";
        if (!draftsByChannel[ch]) draftsByChannel[ch] = [];
        draftsByChannel[ch].push(draft);
      }

      for (const [channel, drafts] of Object.entries(draftsByChannel)) {
        // Check if we already have a thread for this lead+channel
        const existingThread = convos.find(
          c => c.leadId === lead.id && c.channel === channel
        );
        if (existingThread) continue;

        const sortedDrafts = [...drafts].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        const lastDraft = sortedDrafts[sortedDrafts.length - 1];

        const messages: CommunicationMessage[] = sortedDrafts.map((d) => ({
          id: d.id,
          leadId: lead.id,
          channel: (d.channel || "linkedin") as OutreachChannel,
          direction: "outbound" as const,
          subject: d.subject,
          body: d.body,
          date: d.createdAt,
          status: "sent" as const,
          threadId: `draft-thread-${lead.id}-${channel}`,
          sender: "Balboa Team",
        }));

        convos.push({
          threadId: `draft-thread-${lead.id}-${channel}`,
          leadId: lead.id,
          leadName: `${lead.firstName} ${lead.lastName}`,
          leadCompany: lead.company,
          leadPosition: lead.position,
          leadTier: lead.icpScore?.tier || "cold",
          channel: channel as OutreachChannel,
          subject: lastDraft.subject || undefined,
          lastMessage: lastDraft.body,
          lastMessageDate: lastDraft.createdAt,
          lastMessageDirection: "outbound",
          unreadCount: 0,
          messages,
        });
      }
    }

    // Sort by lastMessageDate DESC
    convos.sort(
      (a, b) =>
        new Date(b.lastMessageDate).getTime() - new Date(a.lastMessageDate).getTime()
    );

    return convos;
  }, [communications, leads, leadMap]);

  // Apply channel tab filter
  const channelFiltered = useMemo(() => {
    if (activeTab === "all") return allConversations;
    return allConversations.filter(c => c.channel === activeTab);
  }, [allConversations, activeTab]);

  // Apply status filter
  const statusFiltered = useMemo(() => {
    if (statusFilter === "all") return channelFiltered;
    if (statusFilter === "unread") return channelFiltered.filter(c => c.unreadCount > 0);
    if (statusFilter === "needs_reply") return channelFiltered.filter(c => c.lastMessageDirection === "inbound");
    return channelFiltered;
  }, [channelFiltered, statusFilter]);

  // Apply search filter
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return statusFiltered;
    const q = searchQuery.toLowerCase();
    return statusFiltered.filter(
      c =>
        c.leadName.toLowerCase().includes(q) ||
        c.leadCompany.toLowerCase().includes(q) ||
        c.lastMessage.toLowerCase().includes(q) ||
        (c.subject && c.subject.toLowerCase().includes(q)) ||
        c.messages.some(m => m.body.toLowerCase().includes(q))
    );
  }, [statusFiltered, searchQuery]);

  // Counts for tabs
  const tabCounts = useMemo(() => {
    return {
      all: allConversations.length,
      linkedin: allConversations.filter(c => c.channel === "linkedin").length,
      email: allConversations.filter(c => c.channel === "email").length,
      sms: allConversations.filter(c => c.channel === "sms").length,
    };
  }, [allConversations]);

  // Total unread
  const totalUnread = useMemo(() => {
    return allConversations.reduce((acc, c) => acc + c.unreadCount, 0);
  }, [allConversations]);

  // Selected conversation
  const selectedConversation = useMemo(() => {
    if (!selectedConversationId) return null;
    return filteredConversations.find(c => c.threadId === selectedConversationId) || null;
  }, [selectedConversationId, filteredConversations]);

  // Merged messages (thread messages + local optimistic messages)
  const mergedMessages = useMemo(() => {
    if (!selectedConversation) return [];
    const threadMsgs = [...selectedConversation.messages];
    const localMsgs = localMessages[selectedConversation.threadId] || [];
    return [...threadMsgs, ...localMsgs].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [selectedConversation, localMessages]);

  // Lead for the selected conversation
  const selectedLead = useMemo(() => {
    if (!selectedConversation) return null;
    return leadMap[selectedConversation.leadId] || null;
  }, [selectedConversation, leadMap]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (threadEndRef.current) {
      threadEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [mergedMessages]);

  // Set compose channel when selecting a conversation
  useEffect(() => {
    if (selectedConversation) {
      const ch = selectedConversation.channel;
      if (ch === "email" || ch === "linkedin") {
        setComposeChannel(ch);
      } else {
        setComposeChannel(ch);
      }
    }
  }, [selectedConversation]);

  // Auto-select first conversation on mount or filter change
  useEffect(() => {
    if (filteredConversations.length > 0 && !selectedConversationId) {
      setSelectedConversationId(filteredConversations[0].threadId);
    }
  }, [filteredConversations, selectedConversationId]);

  // Handle selecting a conversation
  const handleSelectConversation = useCallback((threadId: string) => {
    setSelectedConversationId(threadId);
    setComposeMessage("");
    setComposeSubject("");
    setSendStatus("idle");
  }, []);

  // Handle send message
  const handleSendMessage = useCallback(async () => {
    if (!selectedConversation || !selectedLead || !composeMessage.trim()) return;
    if (sendStatus === "sending") return;

    setSendStatus("sending");

    // Optimistic: add message locally
    const optimisticMsg: CommunicationMessage = {
      id: `local-${Date.now()}`,
      leadId: selectedLead.id,
      channel: composeChannel,
      direction: "outbound",
      subject: composeChannel === "email" ? composeSubject : undefined,
      body: composeMessage,
      date: new Date().toISOString(),
      status: "sent",
      threadId: selectedConversation.threadId,
      sender: "Balboa Team",
    };

    setLocalMessages(prev => ({
      ...prev,
      [selectedConversation.threadId]: [
        ...(prev[selectedConversation.threadId] || []),
        optimisticMsg,
      ],
    }));

    try {
      await fetch("/api/send-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: selectedLead.id,
          channel: composeChannel,
          message: composeMessage,
          subject: composeChannel === "email" ? composeSubject : undefined,
        }),
      });

      trackEventClient({
        eventCategory: "outreach",
        eventAction: "message_sent",
        leadId: selectedLead.id,
        channel: composeChannel as "email" | "linkedin" | "call" | "sms" | "whatsapp",
        leadTier: selectedLead.icpScore?.tier,
        metadata: { source: "inbox", threadId: selectedConversation.threadId },
      });

      setSendStatus("sent");
      setComposeMessage("");
      setComposeSubject("");
      setTimeout(() => setSendStatus("idle"), 2000);
    } catch {
      setSendStatus("error");
      setTimeout(() => setSendStatus("idle"), 2500);
    }
  }, [selectedConversation, selectedLead, composeMessage, composeSubject, composeChannel, sendStatus]);

  // Handle AI generate
  const handleAIGenerate = useCallback(async (type: string) => {
    if (!selectedLead) return;
    const channel = (composeChannel === "email" || composeChannel === "linkedin") ? composeChannel : undefined;
    await onGenerateMessage(selectedLead, type, channel);

    // After generation, check for the latest draft and populate compose
    const lead = leadMap[selectedLead.id];
    if (lead && lead.draftMessages.length > 0) {
      const latest = lead.draftMessages[lead.draftMessages.length - 1];
      setComposeMessage(latest.body);
      if (latest.subject) setComposeSubject(latest.subject);
    }
  }, [selectedLead, composeChannel, onGenerateMessage, leadMap]);

  // Vasco prompt for inbox analysis
  const handleAskVasco = useCallback(() => {
    onAskVasco(
      "Analyze my inbox across all channels. Which leads need follow-up today and why? Consider: leads with unanswered inbound messages, leads I haven't contacted in over 7 days, hot leads waiting for a response. Prioritize by ICP tier and urgency. For each recommendation, suggest the best channel and a brief message approach."
    );
  }, [onAskVasco]);

  // Tier badge component
  const TierBadge = ({ tier }: { tier: string }) => {
    const cls =
      tier === "hot"
        ? "badge-hot"
        : tier === "warm"
        ? "badge-warm"
        : "badge-cold";
    return (
      <span
        className={`badge ${cls}`}
        style={{ fontSize: 9, padding: "1px 6px", textTransform: "uppercase" }}
      >
        {tier}
      </span>
    );
  };

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 0, height: "100%" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px 12px 20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Inbox className="w-5 h-5" style={{ color: "var(--balboa-blue, #3b5bdb)" }} />
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "var(--balboa-navy, #1e2a5e)",
              margin: 0,
            }}
          >
            Inbox
          </h2>
          <button
            className="btn-ghost"
            onClick={handleAskVasco}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              fontWeight: 600,
              padding: "4px 10px",
              borderRadius: 16,
              border: "1px solid rgba(59,91,219,0.2)",
              background: "linear-gradient(135deg, rgba(59,91,219,0.06), rgba(99,102,241,0.04))",
              color: "#3b5bdb",
              cursor: "pointer",
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Ask Vasco
          </button>
        </div>
        {totalUnread > 0 && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: 12,
              background: "#3b82f6",
              color: "#ffffff",
            }}
          >
            {totalUnread} unread
          </span>
        )}
      </div>

      {/* Channel tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "0 20px 12px 20px",
        }}
      >
        {(
          [
            { key: "all" as ChannelTab, label: "All", icon: Inbox },
            { key: "linkedin" as ChannelTab, label: "LinkedIn", icon: Linkedin },
            { key: "email" as ChannelTab, label: "Email", icon: Mail },
            { key: "sms" as ChannelTab, label: "SMS", icon: MessageSquare },
          ] as const
        ).map((tab) => {
          const isActive = activeTab === tab.key;
          const count = tabCounts[tab.key];
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setSelectedConversationId(null);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 14px",
                borderRadius: 20,
                border: isActive ? "1px solid #3b5bdb" : "1px solid var(--balboa-border-light, #e5e7eb)",
                background: isActive ? "#3b5bdb" : "transparent",
                color: isActive ? "#ffffff" : "var(--balboa-text-secondary, #6b7280)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <TabIcon className="w-3.5 h-3.5" />
              {tab.label}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "0 6px",
                  borderRadius: 10,
                  background: isActive ? "rgba(255,255,255,0.25)" : "var(--balboa-bg-alt, #f0f0f0)",
                  color: isActive ? "#ffffff" : "var(--balboa-text-muted, #9ca3af)",
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search and filter row */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "0 20px 12px 20px",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: 1,
            padding: "7px 12px",
            background: "var(--balboa-bg-alt, #f8f9fa)",
            borderRadius: 8,
            border: "1px solid var(--balboa-border-light, #e5e7eb)",
          }}
        >
          <Search className="w-3.5 h-3.5" style={{ color: "#9ca3af", flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search conversations..."
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
        <div style={{ position: "relative" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "7px 12px",
              background: "var(--balboa-bg-alt, #f8f9fa)",
              borderRadius: 8,
              border: "1px solid var(--balboa-border-light, #e5e7eb)",
              cursor: "pointer",
            }}
          >
            <Filter className="w-3.5 h-3.5" style={{ color: "#9ca3af" }} />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: 12,
                color: "var(--balboa-navy, #1e2a5e)",
                cursor: "pointer",
                appearance: "none",
                paddingRight: 12,
              }}
            >
              <option value="all">All</option>
              <option value="unread">Unread</option>
              <option value="needs_reply">Needs Reply</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main content: two-panel layout */}
      <div
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          borderTop: "1px solid var(--balboa-border-light, #e5e7eb)",
        }}
      >
        {/* Left panel: Conversation list (40%) */}
        <div
          style={{
            width: "40%",
            borderRight: "1px solid var(--balboa-border-light, #e5e7eb)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {filteredConversations.length === 0 ? (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                color: "var(--balboa-text-muted, #9ca3af)",
                fontSize: 13,
              }}
            >
              {searchQuery.trim() ? (
                <>
                  <Search className="w-8 h-8" style={{ color: "#d1d5db", margin: "0 auto 12px" }} />
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>No conversations matching &ldquo;{searchQuery}&rdquo;</div>
                  <div style={{ fontSize: 12 }}>Try a different search term</div>
                </>
              ) : activeTab !== "all" ? (
                <>
                  <Inbox className="w-8 h-8" style={{ color: "#d1d5db", margin: "0 auto 12px" }} />
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    No {activeTab === "linkedin" ? "LinkedIn" : activeTab === "email" ? "email" : "SMS"} conversations yet
                  </div>
                  <div style={{ fontSize: 12 }}>Start a conversation from the Leads section.</div>
                </>
              ) : (
                <>
                  <Inbox className="w-8 h-8" style={{ color: "#d1d5db", margin: "0 auto 12px" }} />
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>No conversations yet</div>
                  <div style={{ fontSize: 12 }}>Start a conversation from the Leads section.</div>
                </>
              )}
            </div>
          ) : (
            filteredConversations.map((convo) => {
              const isSelected = selectedConversationId === convo.threadId;
              const channelConf = CHANNEL_CONFIG[convo.channel];
              const ChannelIcon = channelConf.icon;

              return (
                <button
                  key={convo.threadId}
                  onClick={() => handleSelectConversation(convo.threadId)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "12px 16px",
                    border: "none",
                    borderLeft: isSelected ? "3px solid #3b5bdb" : "3px solid transparent",
                    background: isSelected ? "rgba(59,91,219,0.06)" : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    borderBottom: "1px solid var(--balboa-border-light, #f0f0f0)",
                    transition: "all 0.12s ease",
                    width: "100%",
                  }}
                >
                  {/* Channel icon */}
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      flexShrink: 0,
                      background: `${channelConf.color}18`,
                      marginTop: 2,
                    }}
                  >
                    <ChannelIcon
                      className="w-4 h-4"
                      style={{ color: channelConf.color }}
                    />
                  </span>

                  {/* Conversation info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: convo.unreadCount > 0 ? 700 : 600,
                          color: "var(--balboa-navy, #1e2a5e)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {convo.leadName}
                      </span>
                      <TierBadge tier={convo.leadTier} />
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--balboa-text-secondary, #6b7280)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginBottom: 3,
                      }}
                    >
                      {truncate(`${convo.leadPosition} at ${convo.leadCompany}`, 40)}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: convo.unreadCount > 0 ? "var(--balboa-navy, #1e2a5e)" : "var(--balboa-text-muted, #9ca3af)",
                        fontWeight: convo.unreadCount > 0 ? 600 : 400,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {convo.lastMessageDirection === "outbound" ? "You: " : ""}
                      {truncate(convo.lastMessage.replace(/\n/g, " "), 60)}
                    </div>
                  </div>

                  {/* Right side: time + unread badge */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 4,
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--balboa-text-muted, #9ca3af)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {timeAgo(convo.lastMessageDate)}
                    </span>
                    {convo.unreadCount > 0 && (
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          background: "#3b82f6",
                          color: "#ffffff",
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        {convo.unreadCount}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right panel: Thread view (60%) */}
        <div
          style={{
            width: "60%",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          {!selectedConversation || !selectedLead ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--balboa-text-muted, #9ca3af)",
                gap: 12,
              }}
            >
              <Inbox className="w-12 h-12" style={{ color: "#e5e7eb" }} />
              <div style={{ fontSize: 14, fontWeight: 600 }}>Select a conversation</div>
              <div style={{ fontSize: 12 }}>Choose a conversation from the left to view messages</div>
            </div>
          ) : (
            <>
              {/* Lead mini-card */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--balboa-border-light, #e5e7eb)",
                  background: "var(--balboa-bg-alt, #fafbfc)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #3b5bdb, #6366f1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#ffffff",
                      fontSize: 14,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {selectedLead.firstName[0]}{selectedLead.lastName[0]}
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "var(--balboa-navy, #1e2a5e)",
                        }}
                      >
                        {selectedLead.firstName} {selectedLead.lastName}
                      </span>
                      <TierBadge tier={selectedLead.icpScore?.tier || "cold"} />
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--balboa-text-secondary, #6b7280)",
                      }}
                    >
                      {selectedLead.position} at {selectedLead.company}
                    </div>
                  </div>
                </div>
                <button
                  className="btn-secondary"
                  onClick={() => onNavigateToLead(selectedLead.id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "5px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--balboa-border-light, #e5e7eb)",
                    background: "#ffffff",
                    color: "var(--balboa-navy, #1e2a5e)",
                    cursor: "pointer",
                  }}
                >
                  <User className="w-3 h-3" />
                  View Full Profile
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {/* Message thread */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {mergedMessages.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: 40,
                      color: "var(--balboa-text-muted, #9ca3af)",
                      fontSize: 13,
                    }}
                  >
                    No messages in this thread yet
                  </div>
                ) : (
                  mergedMessages.map((msg) => {
                    const isOutbound = msg.direction === "outbound";
                    const statusInfo = STATUS_DISPLAY[msg.status];

                    return (
                      <div
                        key={msg.id}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: isOutbound ? "flex-end" : "flex-start",
                          maxWidth: "100%",
                        }}
                      >
                        {/* Sender label + time */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginBottom: 4,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: isOutbound ? "#3b5bdb" : "var(--balboa-text-secondary, #6b7280)",
                            }}
                          >
                            {isOutbound ? "You" : selectedLead.firstName}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              color: "var(--balboa-text-muted, #9ca3af)",
                            }}
                          >
                            {formatTimestamp(msg.date)}
                          </span>
                        </div>

                        {/* Message bubble */}
                        <div
                          style={{
                            maxWidth: "80%",
                            padding: "10px 14px",
                            borderRadius: isOutbound ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                            background: isOutbound ? "#3b5bdb" : "#f3f4f6",
                            color: isOutbound ? "#ffffff" : "#1f2937",
                            fontSize: 13,
                            lineHeight: 1.55,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {msg.subject && (
                            <div
                              style={{
                                fontWeight: 700,
                                marginBottom: 6,
                                fontSize: 12,
                                opacity: 0.9,
                                borderBottom: isOutbound ? "1px solid rgba(255,255,255,0.2)" : "1px solid #e5e7eb",
                                paddingBottom: 4,
                              }}
                            >
                              {msg.subject}
                            </div>
                          )}
                          {msg.body}
                        </div>

                        {/* Status badge */}
                        {isOutbound && statusInfo && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 3,
                              marginTop: 4,
                            }}
                          >
                            {msg.status === "read" || msg.status === "replied" ? (
                              <CheckCircle className="w-3 h-3" style={{ color: statusInfo.color }} />
                            ) : msg.status === "bounced" || msg.status === "failed" ? (
                              <XCircle className="w-3 h-3" style={{ color: statusInfo.color }} />
                            ) : (
                              <Clock className="w-3 h-3" style={{ color: statusInfo.color }} />
                            )}
                            <span style={{ fontSize: 10, color: statusInfo.color, fontWeight: 500 }}>
                              {statusInfo.label}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={threadEndRef} />
              </div>

              {/* Compose area */}
              <div
                style={{
                  borderTop: "1px solid var(--balboa-border-light, #e5e7eb)",
                  padding: "12px 16px",
                  background: "var(--balboa-bg-alt, #fafbfc)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {/* Channel selector + AI buttons row */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {/* Channel selector */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid var(--balboa-border-light, #e5e7eb)",
                      background: "#ffffff",
                    }}
                  >
                    {(() => {
                      const conf = CHANNEL_CONFIG[composeChannel];
                      const Icon = conf.icon;
                      return <Icon className="w-3.5 h-3.5" style={{ color: conf.color }} />;
                    })()}
                    <select
                      value={composeChannel}
                      onChange={(e) => setComposeChannel(e.target.value as OutreachChannel)}
                      style={{
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--balboa-navy, #1e2a5e)",
                        cursor: "pointer",
                        appearance: "none",
                        paddingRight: 8,
                      }}
                    >
                      <option value="linkedin">LinkedIn</option>
                      <option value="email">Email</option>
                      <option value="sms">SMS</option>
                      <option value="whatsapp">WhatsApp</option>
                    </select>
                  </div>

                  <div style={{ flex: 1 }} />

                  {/* AI quick-action buttons */}
                  <button
                    onClick={() => handleAIGenerate("connection_followup")}
                    disabled={generatingForLeadId === selectedLead.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid rgba(59,91,219,0.2)",
                      background: "rgba(59,91,219,0.04)",
                      color: "#3b5bdb",
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: generatingForLeadId === selectedLead.id ? "wait" : "pointer",
                      opacity: generatingForLeadId === selectedLead.id ? 0.6 : 1,
                    }}
                  >
                    {generatingForLeadId === selectedLead.id ? (
                      <RefreshCw className="w-3 h-3" style={{ animation: "spin 1s linear infinite" }} />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    Follow-up
                  </button>
                  <button
                    onClick={() => handleAIGenerate("value_share")}
                    disabled={generatingForLeadId === selectedLead.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid rgba(59,91,219,0.2)",
                      background: "rgba(59,91,219,0.04)",
                      color: "#3b5bdb",
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: generatingForLeadId === selectedLead.id ? "wait" : "pointer",
                      opacity: generatingForLeadId === selectedLead.id ? 0.6 : 1,
                    }}
                  >
                    Value Share
                  </button>
                  <button
                    onClick={() => handleAIGenerate("meeting_request")}
                    disabled={generatingForLeadId === selectedLead.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid rgba(59,91,219,0.2)",
                      background: "rgba(59,91,219,0.04)",
                      color: "#3b5bdb",
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: generatingForLeadId === selectedLead.id ? "wait" : "pointer",
                      opacity: generatingForLeadId === selectedLead.id ? 0.6 : 1,
                    }}
                  >
                    Meeting
                  </button>
                </div>

                {/* Subject line (email only) */}
                {composeChannel === "email" && (
                  <input
                    type="text"
                    placeholder="Subject..."
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "7px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--balboa-border-light, #e5e7eb)",
                      background: "#ffffff",
                      fontSize: 12,
                      color: "var(--balboa-navy, #1e2a5e)",
                      outline: "none",
                    }}
                  />
                )}

                {/* Message textarea + send button */}
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <textarea
                    placeholder="Type your message..."
                    value={composeMessage}
                    onChange={(e) => setComposeMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    rows={3}
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--balboa-border-light, #e5e7eb)",
                      background: "#ffffff",
                      fontSize: 12,
                      color: "var(--balboa-navy, #1e2a5e)",
                      resize: "vertical",
                      outline: "none",
                      lineHeight: 1.5,
                      minHeight: 60,
                    }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <button
                      onClick={() => handleAIGenerate("connection_followup")}
                      disabled={generatingForLeadId === selectedLead.id}
                      title="AI Generate"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        border: "1px solid rgba(59,91,219,0.2)",
                        background: "linear-gradient(135deg, rgba(59,91,219,0.08), rgba(99,102,241,0.06))",
                        color: "#3b5bdb",
                        cursor: generatingForLeadId === selectedLead.id ? "wait" : "pointer",
                        opacity: generatingForLeadId === selectedLead.id ? 0.6 : 1,
                      }}
                    >
                      {generatingForLeadId === selectedLead.id ? (
                        <RefreshCw className="w-4 h-4" style={{ animation: "spin 1s linear infinite" }} />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={handleSendMessage}
                      disabled={!composeMessage.trim() || sendStatus === "sending"}
                      className="btn-primary"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        border: "none",
                        background: sendStatus === "sent"
                          ? "#059669"
                          : sendStatus === "error"
                          ? "#e03131"
                          : composeMessage.trim()
                          ? "#3b5bdb"
                          : "#d1d5db",
                        color: "#ffffff",
                        cursor: !composeMessage.trim() || sendStatus === "sending" ? "not-allowed" : "pointer",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {sendStatus === "sending" ? (
                        <RefreshCw className="w-4 h-4" style={{ animation: "spin 1s linear infinite" }} />
                      ) : sendStatus === "sent" ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : sendStatus === "error" ? (
                        <XCircle className="w-4 h-4" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Send status helper text */}
                {sendStatus === "sent" && (
                  <div style={{ fontSize: 11, color: "#059669", fontWeight: 600, textAlign: "right" }}>
                    Message sent successfully
                  </div>
                )}
                {sendStatus === "error" && (
                  <div style={{ fontSize: 11, color: "#e03131", fontWeight: 600, textAlign: "right" }}>
                    Failed to send. Try again.
                  </div>
                )}

                {/* Keyboard shortcut hint */}
                <div style={{ fontSize: 10, color: "var(--balboa-text-muted, #9ca3af)", textAlign: "right" }}>
                  Press Cmd+Enter to send
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
