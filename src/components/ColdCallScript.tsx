"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Phone,
  PhoneCall,
  PhoneOff,
  Clock,
  Play,
  Pause,
  Square,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Copy,
  Mic,
} from "lucide-react";
import type { Lead, SupportedLanguage, ColdCallScript as ColdCallScriptType } from "@/lib/types";
import { trackEventClient } from "@/lib/tracking";

// ─── Props ──────────────────────────────────────────────────────

interface ColdCallScriptProps {
  lead: Lead;
  language: SupportedLanguage;
  onCallStarted?: (lead: Lead) => void;
}

// ─── Helpers ────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type CallOutcomeType = "connected" | "voicemail" | "gatekeeper" | "no_answer" | "callback_scheduled";

const OUTCOME_OPTIONS: { value: CallOutcomeType; label: string; color: string }[] = [
  { value: "connected", label: "Connected", color: "#2b8a3e" },
  { value: "voicemail", label: "Voicemail", color: "#f59f00" },
  { value: "gatekeeper", label: "Gatekeeper", color: "#3b5bdb" },
  { value: "no_answer", label: "No Answer", color: "#868e96" },
  { value: "callback_scheduled", label: "Callback Scheduled", color: "#7048e8" },
];

// ─── Component ──────────────────────────────────────────────────

export default function ColdCallScript({
  lead,
  language,
  onCallStarted,
}: ColdCallScriptProps) {
  // Script state
  const [script, setScript] = useState<ColdCallScriptType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Script view mode
  const [scriptTab, setScriptTab] = useState<"main" | "voicemail" | "gatekeeper">("main");

  // Objection handler expand state
  const [expandedObjections, setExpandedObjections] = useState<Set<number>>(new Set());

  // Call timer state
  const [timerState, setTimerState] = useState<"idle" | "running" | "paused" | "stopped">("idle");
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Call outcome state
  const [showOutcome, setShowOutcome] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<CallOutcomeType | null>(null);
  const [callNotes, setCallNotes] = useState("");

  // Toast state
  const [toast, setToast] = useState<string | null>(null);

  // Collapsible lead panel
  const [leadExpanded, setLeadExpanded] = useState(false);

  // Clipboard helper
  const copyToClipboard = useCallback((text: string, section?: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setToast("Copied to clipboard");
      setTimeout(() => setToast(null), 2000);
      if (section) {
        trackEventClient({ eventCategory: "call", eventAction: "call_script_section_copied", leadId: lead.id, channel: "call", metadata: { section } });
      }
    });
  }, [lead.id]);

  // ─── Timer logic ─────────────────────────────────────────────

  useEffect(() => {
    if (timerState === "running") {
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerState]);

  const startTimer = () => {
    setTimerState("running");
    setElapsed(0);
    setShowOutcome(false);
    setSelectedOutcome(null);
    setCallNotes("");
    if (onCallStarted) onCallStarted(lead);
    trackEventClient({ eventCategory: "call", eventAction: "call_timer_started", leadId: lead.id, channel: "call" });
  };

  const pauseTimer = () => {
    setTimerState("paused");
    trackEventClient({ eventCategory: "call", eventAction: "call_timer_paused", leadId: lead.id, channel: "call", numericValue: elapsed });
  };
  const resumeTimer = () => {
    setTimerState("running");
    trackEventClient({ eventCategory: "call", eventAction: "call_timer_resumed", leadId: lead.id, channel: "call" });
  };

  const stopTimer = () => {
    setTimerState("stopped");
    setShowOutcome(true);
    trackEventClient({ eventCategory: "call", eventAction: "call_timer_stopped", leadId: lead.id, channel: "call", numericValue: elapsed });
  };

  // ─── Generate script ─────────────────────────────────────────

  const generateScript = async () => {
    const isRegenerate = !!script;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-call-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead, language }),
      });
      if (!res.ok) throw new Error("Failed to generate script");
      const { script: generatedScript } = await res.json();
      setScript(generatedScript);
      setScriptTab("main");
      trackEventClient({ eventCategory: "call", eventAction: isRegenerate ? "call_script_regenerated" : "call_script_requested", leadId: lead.id, channel: "call" });
    } catch (err) {
      console.error("Script generation error:", err);
      setError("Failed to generate script. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Dialer stubs ────────────────────────────────────────────

  const showDialerToast = (provider: string) => {
    setToast(`${provider} integration coming soon`);
    setTimeout(() => setToast(null), 3000);
    trackEventClient({ eventCategory: "call", eventAction: "call_dialer_clicked", leadId: lead.id, channel: "call", metadata: { platform: provider.toLowerCase().includes("aircall") ? "aircall" : "amplemarket" } });
  };

  // ─── Objection toggle ────────────────────────────────────────

  const toggleObjection = (idx: number) => {
    setExpandedObjections((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // ─── Save outcome ────────────────────────────────────────────

  const saveOutcome = () => {
    if (!script || !selectedOutcome) return;
    // In a real app, this would persist the call log
    console.log("[ColdCallScript] Call saved:", {
      leadId: lead.id,
      outcome: selectedOutcome,
      duration: elapsed,
      notes: callNotes,
      scriptId: script.id,
    });
    trackEventClient({ eventCategory: "call", eventAction: "call_outcome_saved", leadId: lead.id, channel: "call", metadata: { outcome: selectedOutcome, notes: callNotes } });
    setToast("Call logged successfully");
    setTimeout(() => setToast(null), 2000);
    setShowOutcome(false);
    setTimerState("idle");
    setElapsed(0);
  };

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 20,
            padding: "10px 20px",
            borderRadius: 8,
            background: "#1e2a5e",
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            zIndex: 9999,
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            animation: "fadeIn 0.2s ease",
          }}
        >
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "linear-gradient(135deg, #2b8a3e15, #099268 15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Phone size={18} style={{ color: "#2b8a3e" }} />
        </div>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1e2a5e", margin: 0 }}>
            Cold Call Script
          </h3>
          <p style={{ fontSize: 12, color: "#868e96", margin: 0 }}>
            {lead.firstName} {lead.lastName} at {lead.company}
          </p>
        </div>
      </div>

      {/* Collapsible Lead Detail Panel */}
      <div
        style={{
          borderRadius: 10,
          border: "1px solid #e9ecef",
          background: "#f8f9fa",
          overflow: "hidden",
        }}
      >
        <button
          onClick={() => setLeadExpanded(!leadExpanded)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            color: "#1e2a5e",
          }}
        >
          <span>Lead Details</span>
          {leadExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {leadExpanded && (
          <div style={{ padding: "0 14px 12px 14px", fontSize: 12, color: "#495057", display: "flex", flexDirection: "column", gap: 4 }}>
            <div><span style={{ color: "#868e96" }}>Position: </span>{lead.position}</div>
            <div><span style={{ color: "#868e96" }}>Company: </span>{lead.company}</div>
            {lead.companyIntel?.industry && (
              <div><span style={{ color: "#868e96" }}>Industry: </span>{lead.companyIntel.industry}</div>
            )}
            {lead.companyIntel?.estimatedRevenue && (
              <div><span style={{ color: "#868e96" }}>Revenue: </span>{lead.companyIntel.estimatedRevenue}</div>
            )}
            {lead.icpScore && (
              <div><span style={{ color: "#868e96" }}>ICP Score: </span>{lead.icpScore.overall}/100 ({lead.icpScore.tier})</div>
            )}
            {lead.email && (
              <div><span style={{ color: "#868e96" }}>Email: </span>{lead.email}</div>
            )}
            {lead.companyIntel?.painPoints && lead.companyIntel.painPoints.length > 0 && (
              <div>
                <span style={{ color: "#868e96" }}>Pain Points: </span>
                {lead.companyIntel.painPoints.join(", ")}
              </div>
            )}
            {lead.notes && (
              <div><span style={{ color: "#868e96" }}>Notes: </span>{lead.notes}</div>
            )}
          </div>
        )}
      </div>

      {/* Dialer Buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => showDialerToast("Aircall dialer")}
          style={{
            flex: 1,
            minWidth: 140,
            padding: "10px 16px",
            fontSize: 12,
            fontWeight: 600,
            border: "none",
            borderRadius: 8,
            background: "linear-gradient(135deg, #2b8a3e, #099268)",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <PhoneCall size={14} /> Call via Aircall
        </button>
        <button
          onClick={() => showDialerToast("Amplemarket dialer")}
          style={{
            flex: 1,
            minWidth: 140,
            padding: "10px 16px",
            fontSize: 12,
            fontWeight: 600,
            border: "none",
            borderRadius: 8,
            background: "linear-gradient(135deg, #3b5bdb, #1e2a5e)",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <PhoneCall size={14} /> Call via Amplemarket
        </button>
        {lead.email && (
          <a
            href={`tel:${lead.email}`}
            style={{
              flex: "0 0 auto",
              padding: "10px 16px",
              fontSize: 12,
              fontWeight: 600,
              border: "1px solid #dee2e6",
              borderRadius: 8,
              background: "#fff",
              color: "#495057",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              textDecoration: "none",
            }}
          >
            <Phone size={14} /> Call via Phone
          </a>
        )}
      </div>

      {/* Call Timer */}
      <div
        style={{
          padding: 14,
          borderRadius: 10,
          border: "1px solid #e9ecef",
          background: timerState === "running" ? "#e8faf0" : timerState === "paused" ? "#fff9db" : "#fff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Clock size={16} style={{ color: timerState === "running" ? "#2b8a3e" : "#868e96" }} />
            <span
              style={{
                fontSize: 24,
                fontWeight: 700,
                fontFamily: "monospace",
                color: timerState === "running" ? "#2b8a3e" : timerState === "paused" ? "#f59f00" : "#1e2a5e",
              }}
            >
              {formatTime(elapsed)}
            </span>
            {timerState === "running" && (
              <Mic size={14} style={{ color: "#e03131", animation: "pulse 1.5s infinite" }} />
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {timerState === "idle" && (
              <button
                onClick={startTimer}
                style={{
                  padding: "7px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  border: "none",
                  borderRadius: 8,
                  background: "#2b8a3e",
                  color: "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Play size={12} /> Start Call Timer
              </button>
            )}
            {timerState === "running" && (
              <>
                <button
                  onClick={pauseTimer}
                  style={{
                    padding: "7px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    border: "1px solid #f59f00",
                    borderRadius: 8,
                    background: "#fff",
                    color: "#f59f00",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Pause size={12} /> Pause
                </button>
                <button
                  onClick={stopTimer}
                  style={{
                    padding: "7px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    border: "1px solid #e03131",
                    borderRadius: 8,
                    background: "#fff",
                    color: "#e03131",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Square size={12} /> Stop
                </button>
              </>
            )}
            {timerState === "paused" && (
              <>
                <button
                  onClick={resumeTimer}
                  style={{
                    padding: "7px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    border: "none",
                    borderRadius: 8,
                    background: "#2b8a3e",
                    color: "#fff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Play size={12} /> Resume
                </button>
                <button
                  onClick={stopTimer}
                  style={{
                    padding: "7px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    border: "1px solid #e03131",
                    borderRadius: 8,
                    background: "#fff",
                    color: "#e03131",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Square size={12} /> Stop
                </button>
              </>
            )}
            {timerState === "stopped" && !showOutcome && (
              <button
                onClick={startTimer}
                style={{
                  padding: "7px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  border: "none",
                  borderRadius: 8,
                  background: "#2b8a3e",
                  color: "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Play size={12} /> New Call
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Call Outcome Panel */}
      {showOutcome && (
        <div
          style={{
            padding: 16,
            borderRadius: 10,
            border: "1px solid #e9ecef",
            background: "#fff",
          }}
        >
          <h4 style={{ fontSize: 13, fontWeight: 700, color: "#1e2a5e", marginBottom: 10 }}>
            Call Outcome
          </h4>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {OUTCOME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setSelectedOutcome(opt.value); trackEventClient({ eventCategory: "call", eventAction: "call_outcome_selected", leadId: lead.id, channel: "call", metadata: { outcome: opt.value } }); }}
                style={{
                  padding: "6px 14px",
                  fontSize: 11,
                  fontWeight: selectedOutcome === opt.value ? 600 : 400,
                  border: `1.5px solid ${selectedOutcome === opt.value ? opt.color : "#dee2e6"}`,
                  borderRadius: 8,
                  background: selectedOutcome === opt.value ? opt.color + "15" : "#fff",
                  color: selectedOutcome === opt.value ? opt.color : "#495057",
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <textarea
            rows={3}
            placeholder="Call notes..."
            value={callNotes}
            onChange={(e) => setCallNotes(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: 12,
              border: "1px solid #dee2e6",
              borderRadius: 8,
              resize: "vertical",
              outline: "none",
              fontFamily: "inherit",
              marginBottom: 10,
            }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => { setShowOutcome(false); setTimerState("idle"); setElapsed(0); }}
              style={{
                padding: "8px 16px",
                fontSize: 12,
                border: "1px solid #dee2e6",
                borderRadius: 8,
                background: "#fff",
                color: "#495057",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={saveOutcome}
              disabled={!selectedOutcome}
              style={{
                padding: "8px 16px",
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                borderRadius: 8,
                background: selectedOutcome ? "#2b8a3e" : "#adb5bd",
                color: "#fff",
                cursor: selectedOutcome ? "pointer" : "not-allowed",
              }}
            >
              <PhoneOff size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />
              Save Call Log
            </button>
          </div>
        </div>
      )}

      {/* Generate Script Button */}
      {!script && !loading && (
        <button
          onClick={generateScript}
          style={{
            padding: "12px 24px",
            fontSize: 13,
            fontWeight: 600,
            border: "none",
            borderRadius: 10,
            background: "linear-gradient(135deg, #3b5bdb, #1e2a5e)",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <RefreshCw size={14} /> Generate Script
        </button>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 30, color: "#3b5bdb" }}>
          <RefreshCw size={20} style={{ animation: "spin 1s linear infinite", marginBottom: 8 }} />
          <p style={{ fontSize: 13, margin: 0 }}>Generating personalized call script...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: 12, borderRadius: 8, background: "#e0313115", color: "#e03131", fontSize: 12 }}>
          {error}
          <button
            onClick={generateScript}
            style={{
              marginLeft: 10,
              padding: "4px 10px",
              fontSize: 11,
              border: "1px solid #e03131",
              borderRadius: 6,
              background: "#fff",
              color: "#e03131",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Script Content */}
      {script && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Script tabs */}
          <div style={{ display: "flex", gap: 2, background: "#f1f3f5", borderRadius: 10, padding: 3 }}>
            {[
              { key: "main" as const, label: "Main Script" },
              { key: "voicemail" as const, label: "Voicemail" },
              { key: "gatekeeper" as const, label: "Gatekeeper" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setScriptTab(tab.key); trackEventClient({ eventCategory: "call", eventAction: "call_script_tab_viewed", leadId: lead.id, channel: "call", metadata: { tab: tab.key } }); }}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  fontSize: 12,
                  fontWeight: scriptTab === tab.key ? 600 : 400,
                  border: "none",
                  borderRadius: 8,
                  background: scriptTab === tab.key ? "#fff" : "transparent",
                  color: scriptTab === tab.key ? "#1e2a5e" : "#868e96",
                  cursor: "pointer",
                  boxShadow: scriptTab === tab.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Regenerate button */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={generateScript}
              className="btn-ghost"
              style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4, color: "#3b5bdb" }}
            >
              <RefreshCw size={12} /> Regenerate
            </button>
          </div>

          {/* Main Script */}
          {scriptTab === "main" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Opener */}
              <div
                style={{
                  padding: 16,
                  borderRadius: 10,
                  background: "linear-gradient(135deg, #1e2a5e08, #3b5bdb08)",
                  border: "1.5px solid #3b5bdb30",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#3b5bdb", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Opener
                  </span>
                  <button
                    onClick={() => copyToClipboard(script.opener, "opener")}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#868e96", padding: 2 }}
                    title="Copy opener"
                  >
                    <Copy size={13} />
                  </button>
                </div>
                <p style={{ fontSize: 15, fontWeight: 600, color: "#1e2a5e", margin: 0, lineHeight: 1.6 }}>
                  {script.opener}
                </p>
              </div>

              {/* Value Proposition */}
              <div style={{ padding: 14, borderRadius: 10, border: "1px solid #e9ecef", background: "#fff" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#2b8a3e", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Value Proposition
                  </span>
                  <button
                    onClick={() => copyToClipboard(script.valueProposition, "valueProposition")}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#868e96", padding: 2 }}
                    title="Copy value prop"
                  >
                    <Copy size={13} />
                  </button>
                </div>
                <p style={{ fontSize: 13, color: "#495057", margin: 0, lineHeight: 1.6 }}>
                  {script.valueProposition}
                </p>
              </div>

              {/* Talking Points */}
              <div style={{ padding: 14, borderRadius: 10, border: "1px solid #e9ecef", background: "#fff" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#1e2a5e", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8, display: "block" }}>
                  Talking Points
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {script.talkingPoints.map((point, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "#495057" }}>
                      <span
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: "#3b5bdb15",
                          color: "#3b5bdb",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          fontWeight: 700,
                          flexShrink: 0,
                          marginTop: 1,
                        }}
                      >
                        {i + 1}
                      </span>
                      <span style={{ lineHeight: 1.5 }}>{point}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Key Questions */}
              <div style={{ padding: 14, borderRadius: 10, border: "1px solid #e9ecef", background: "#fff" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#f59f00", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8, display: "block" }}>
                  Key Questions to Ask
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {script.questions.map((q, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "#495057" }}>
                      <span style={{ color: "#f59f00", fontWeight: 700, flexShrink: 0 }}>Q{i + 1}.</span>
                      <span style={{ lineHeight: 1.5 }}>{q}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Objection Handlers */}
              <div style={{ padding: 14, borderRadius: 10, border: "1px solid #e9ecef", background: "#fff" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#e03131", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8, display: "block" }}>
                  Objection Handlers
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {script.objectionHandlers.map((oh, i) => (
                    <div key={i} style={{ borderRadius: 8, border: "1px solid #f1f3f5", overflow: "hidden" }}>
                      <button
                        onClick={() => toggleObjection(i)}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          background: expandedObjections.has(i) ? "#fff5f5" : "#f8f9fa",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#e03131",
                          textAlign: "left",
                        }}
                      >
                        <span>{oh.objection}</span>
                        {expandedObjections.has(i) ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                      {expandedObjections.has(i) && (
                        <div style={{ padding: "8px 12px", fontSize: 12, color: "#495057", lineHeight: 1.6, background: "#fff" }}>
                          {oh.response}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Close Attempt */}
              <div
                style={{
                  padding: 14,
                  borderRadius: 10,
                  background: "#2b8a3e08",
                  border: "1.5px solid #2b8a3e30",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#2b8a3e", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Close Attempt
                  </span>
                  <button
                    onClick={() => copyToClipboard(script.closeAttempt, "closeAttempt")}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#868e96", padding: 2 }}
                    title="Copy close"
                  >
                    <Copy size={13} />
                  </button>
                </div>
                <p style={{ fontSize: 13, fontWeight: 500, color: "#2b8a3e", margin: 0, lineHeight: 1.6 }}>
                  {script.closeAttempt}
                </p>
              </div>
            </div>
          )}

          {/* Voicemail Script */}
          {scriptTab === "voicemail" && (
            <div
              style={{
                padding: 16,
                borderRadius: 10,
                border: "1px solid #e9ecef",
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#f59f00" }}>
                  Voicemail Script (~30 seconds)
                </span>
                <button
                  onClick={() => copyToClipboard(script.voicemailScript, "voicemail")}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#868e96", padding: 2 }}
                  title="Copy voicemail script"
                >
                  <Copy size={13} />
                </button>
              </div>
              <p style={{ fontSize: 14, color: "#495057", margin: 0, lineHeight: 1.7 }}>
                {script.voicemailScript}
              </p>
            </div>
          )}

          {/* Gatekeeper Script */}
          {scriptTab === "gatekeeper" && (
            <div
              style={{
                padding: 16,
                borderRadius: 10,
                border: "1px solid #e9ecef",
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#3b5bdb" }}>
                  Gatekeeper Script
                </span>
                <button
                  onClick={() => copyToClipboard(script.gatekeeperScript, "gatekeeper")}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#868e96", padding: 2 }}
                  title="Copy gatekeeper script"
                >
                  <Copy size={13} />
                </button>
              </div>
              <p style={{ fontSize: 14, color: "#495057", margin: 0, lineHeight: 1.7 }}>
                {script.gatekeeperScript}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
