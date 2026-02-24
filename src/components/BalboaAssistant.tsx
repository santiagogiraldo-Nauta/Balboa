"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, MessageSquare, ChevronDown, Zap } from "lucide-react";
import type { Lead, Deal, Account, SupportedLanguage } from "@/lib/types";
import { buildAssistantContext } from "@/lib/assistant-context";
import { trackEventClient } from "@/lib/tracking";

interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface BalboaAssistantProps {
  leads: Lead[];
  deals: Deal[];
  accounts: Account[];
  selectedLead: Lead | null;
  currentSection: string;
  onNavigateToLead: (leadId: string) => void;
  onGenerateMessage: (lead: Lead, type: string, channel?: "email" | "linkedin") => void;
  language: SupportedLanguage;
}

const SUGGESTED_PROMPTS = [
  { icon: "\uD83C\uDFAF", text: "Who should I prioritize today?", category: "action" },
  { icon: "\uD83D\uDCCA", text: "How is my pipeline looking?", category: "analysis" },
  { icon: "\uD83D\uDD25", text: "Which deals are at risk?", category: "deals" },
  { icon: "\u2709\uFE0F", text: "Draft an outreach for my hottest lead", category: "outreach" },
  { icon: "\uD83D\uDCA1", text: "What's working best in my outreach?", category: "playbook" },
  { icon: "\uD83D\uDCCB", text: "Give me my action plan for this week", category: "action" },
];

// Inline Eye SVG component (avoids unused lucide import)
function EyeIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function BalboaAssistant({
  leads,
  deals,
  accounts,
  selectedLead,
  currentSection,
  onNavigateToLead,
  onGenerateMessage,
}: BalboaAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isThinking) return;

    const userMsg: AssistantMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsThinking(true);

    try {
      const context = buildAssistantContext({
        leads,
        deals,
        accounts,
        selectedLead,
        currentSection,
      });

      const resp = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          context,
        }),
      });

      const data = await resp.json();

      const assistantMsg: AssistantMessage = {
        id: `msg-${Date.now()}-resp`,
        role: "assistant",
        content: data.message || "I couldn't process that. Try again?",
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      trackEventClient({
        eventCategory: "analysis",
        eventAction: "research_query",
        metadata: { source: "assistant", messageCount: newMessages.length + 1 },
      });
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-err`,
          role: "assistant",
          content: "Sorry, I'm having trouble connecting. Try again in a moment.",
          timestamp: new Date().toISOString(),
        },
      ]);
    }

    setIsThinking(false);
  };

  // Parse action tags from assistant messages
  const renderMessage = (content: string) => {
    const parts = content.split(/(\[ACTION:[^\]]+\])/g);
    return parts.map((part, i) => {
      const actionMatch = part.match(/\[ACTION:([^:]+):([^\]]+)\]/);
      if (actionMatch) {
        const [, leadId, actionType] = actionMatch;
        const lead = leads.find((l) => l.id === leadId);
        const leadName = lead ? `${lead.firstName} ${lead.lastName}` : "Lead";

        if (actionType === "view") {
          return (
            <button
              key={i}
              onClick={() => {
                onNavigateToLead(leadId);
                setIsOpen(false);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 10px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                background: "rgba(59,91,219,0.1)",
                color: "#3b5bdb",
                border: "1px solid rgba(59,91,219,0.2)",
                cursor: "pointer",
                margin: "2px 0",
              }}
            >
              <EyeIcon style={{ width: 12, height: 12 }} /> View {leadName}
            </button>
          );
        }
        if (actionType === "send_email" && lead) {
          return (
            <button
              key={i}
              onClick={() => {
                onNavigateToLead(leadId);
                onGenerateMessage(lead, "email_initial", "email");
                setIsOpen(false);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 10px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                background: "rgba(43,138,62,0.1)",
                color: "#2b8a3e",
                border: "1px solid rgba(43,138,62,0.2)",
                cursor: "pointer",
                margin: "2px 0",
              }}
            >
              <Zap style={{ width: 12, height: 12 }} /> Email {leadName}
            </button>
          );
        }
        if (actionType === "send_linkedin" && lead) {
          return (
            <button
              key={i}
              onClick={() => {
                onNavigateToLead(leadId);
                onGenerateMessage(lead, "connection_followup", "linkedin");
                setIsOpen(false);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 10px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                background: "rgba(0,119,181,0.1)",
                color: "#0077b5",
                border: "1px solid rgba(0,119,181,0.2)",
                cursor: "pointer",
                margin: "2px 0",
              }}
            >
              <MessageSquare style={{ width: 12, height: 12 }} /> LinkedIn{" "}
              {leadName}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      }
      // Render plain text
      return (
        <span key={i} style={{ whiteSpace: "pre-wrap" }}>
          {part}
        </span>
      );
    });
  };

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 1000,
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #1e2a5e 0%, #3b5bdb 100%)",
            color: "white",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow:
              "0 4px 20px rgba(30,42,94,0.35), 0 0 0 3px rgba(59,91,219,0.15)",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.08)";
            e.currentTarget.style.boxShadow =
              "0 6px 24px rgba(30,42,94,0.45), 0 0 0 4px rgba(59,91,219,0.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow =
              "0 4px 20px rgba(30,42,94,0.35), 0 0 0 3px rgba(59,91,219,0.15)";
          }}
        >
          <Sparkles style={{ width: 24, height: 24 }} />
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 1000,
            width: 420,
            height: 600,
            maxHeight: "calc(100vh - 48px)",
            background: "white",
            borderRadius: 16,
            boxShadow:
              "0 8px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05)",
            display: "flex",
            flexDirection: "column",
            animation: "slideUp 0.25s ease-out",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid #f1f3f5",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "linear-gradient(135deg, #1e2a5e 0%, #3b5bdb 100%)",
              borderRadius: "16px 16px 0 0",
              color: "white",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Sparkles style={{ width: 18, height: 18 }} />
              <div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 14,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Balboa AI
                </div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>
                  Your sales intelligence assistant
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  setMessages([]);
                }}
                style={{
                  background: "rgba(255,255,255,0.15)",
                  border: "none",
                  borderRadius: 6,
                  padding: "4px 8px",
                  color: "white",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                New Chat
              </button>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: "rgba(255,255,255,0.15)",
                  border: "none",
                  borderRadius: 6,
                  padding: 4,
                  color: "white",
                  cursor: "pointer",
                }}
              >
                <ChevronDown style={{ width: 16, height: 16 }} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px 16px 8px",
            }}
          >
            {messages.length === 0 && !isThinking && (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>
                  {"\uD83E\uDD16"}
                </div>
                <h3
                  style={{
                    fontWeight: 700,
                    fontSize: 15,
                    color: "#1e2a5e",
                    marginBottom: 4,
                  }}
                >
                  How can I help?
                </h3>
                <p
                  style={{
                    fontSize: 12,
                    color: "#868e96",
                    marginBottom: 20,
                    lineHeight: 1.5,
                  }}
                >
                  I know everything about your pipeline. Ask me anything.
                </p>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {SUGGESTED_PROMPTS.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(p.text)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 14px",
                        borderRadius: 10,
                        background: "#f8f9fa",
                        border: "1px solid #e9ecef",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 500,
                        color: "#495057",
                        textAlign: "left",
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#e9ecef";
                        e.currentTarget.style.borderColor = "#dee2e6";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#f8f9fa";
                        e.currentTarget.style.borderColor = "#e9ecef";
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{p.icon}</span>
                      {p.text}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  justifyContent:
                    msg.role === "user" ? "flex-end" : "flex-start",
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "10px 14px",
                    borderRadius: 12,
                    background:
                      msg.role === "user"
                        ? "linear-gradient(135deg, #1e2a5e 0%, #3b5bdb 100%)"
                        : "#f8f9fa",
                    color: msg.role === "user" ? "white" : "#212529",
                    fontSize: 13,
                    lineHeight: 1.5,
                    borderBottomRightRadius: msg.role === "user" ? 4 : 12,
                    borderBottomLeftRadius: msg.role === "assistant" ? 4 : 12,
                  }}
                >
                  {msg.role === "assistant"
                    ? renderMessage(msg.content)
                    : msg.content}
                </div>
              </div>
            ))}

            {isThinking && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-start",
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    background: "#f8f9fa",
                    borderBottomLeftRadius: 4,
                    display: "flex",
                    gap: 4,
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#adb5bd",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  />
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#adb5bd",
                      animation: "pulse 1.5s ease-in-out 0.3s infinite",
                    }}
                  />
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#adb5bd",
                      animation: "pulse 1.5s ease-in-out 0.6s infinite",
                    }}
                  />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: "12px 16px", borderTop: "1px solid #f1f3f5" }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(input);
              }}
              style={{ display: "flex", gap: 8 }}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about your pipeline..."
                disabled={isThinking}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #e9ecef",
                  fontSize: 13,
                  outline: "none",
                  background: isThinking ? "#f8f9fa" : "white",
                  color: "#212529",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#3b5bdb";
                  e.currentTarget.style.boxShadow =
                    "0 0 0 2px rgba(59,91,219,0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#e9ecef";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              <button
                type="submit"
                disabled={!input.trim() || isThinking}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background:
                    input.trim() && !isThinking
                      ? "linear-gradient(135deg, #1e2a5e 0%, #3b5bdb 100%)"
                      : "#e9ecef",
                  border: "none",
                  cursor:
                    input.trim() && !isThinking ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color:
                    input.trim() && !isThinking ? "white" : "#adb5bd",
                  transition: "all 0.15s ease",
                }}
              >
                <Send style={{ width: 16, height: 16 }} />
              </button>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}
