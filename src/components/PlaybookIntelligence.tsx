"use client";

import { useState, useEffect } from "react";
import { BookOpen, Loader2, BarChart3 } from "lucide-react";
import PlaybookDashboard from "./PlaybookDashboard";
import type { PlaybookDashboardData } from "@/lib/types";

export default function PlaybookIntelligence() {
  const [data, setData] = useState<PlaybookDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [insufficient, setInsufficient] = useState(false);
  const [insufficientMessage, setInsufficientMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchPlaybookData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/playbook/analyze");
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `Failed to fetch (${res.status})`);
        }
        const result = await res.json();
        if (cancelled) return;

        if (result.insufficient) {
          setInsufficient(true);
          setInsufficientMessage(result.message);
          setData(null);
        } else {
          setInsufficient(false);
          setData(result);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Playbook fetch error:", err);
        setError(err instanceof Error ? err.message : "Failed to load playbook data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPlaybookData();
    return () => { cancelled = true; };
  }, []);

  // Loading skeleton
  if (loading) {
    return (
      <div className="p-6">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, var(--balboa-navy), var(--balboa-blue))", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BookOpen className="w-4.5 h-4.5" style={{ color: "white" }} />
          </div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)" }}>Playbook Intelligence</h2>
            <p style={{ fontSize: 12, color: "var(--balboa-text-muted)" }}>
              Analyzing your outreach data...
            </p>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 24px", gap: 12 }}>
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--balboa-blue)" }} />
          <p style={{ fontSize: 13, color: "var(--balboa-text-muted)" }}>
            Analyzing outreach patterns with AI...
          </p>
          {/* Skeleton cards */}
          <div style={{ width: "100%", maxWidth: 600, marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{
                height: 72,
                borderRadius: 10,
                background: "var(--balboa-bg-alt, #f5f5f5)",
                animation: "pulse 1.5s ease-in-out infinite",
                opacity: 1 - (i * 0.15),
              }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, var(--balboa-navy), var(--balboa-blue))", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BookOpen className="w-4.5 h-4.5" style={{ color: "white" }} />
          </div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)" }}>Playbook Intelligence</h2>
            <p style={{ fontSize: 12, color: "var(--balboa-text-muted)" }}>
              Auto-detected patterns across messaging, calls, demos, timing, and personas
            </p>
          </div>
        </div>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px",
          textAlign: "center",
          maxWidth: 420,
          margin: "0 auto",
        }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: "var(--balboa-bg-alt)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
            color: "var(--balboa-text-muted)",
          }}>
            <BarChart3 size={28} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 6 }}>
            Unable to load insights
          </h3>
          <p style={{ fontSize: 13, color: "var(--balboa-text-muted)", lineHeight: 1.5 }}>
            {error}
          </p>
        </div>
      </div>
    );
  }

  // Insufficient data state
  if (insufficient) {
    return (
      <div className="p-6">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, var(--balboa-navy), var(--balboa-blue))", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BookOpen className="w-4.5 h-4.5" style={{ color: "white" }} />
          </div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)" }}>Playbook Intelligence</h2>
            <p style={{ fontSize: 12, color: "var(--balboa-text-muted)" }}>
              Auto-detected patterns across messaging, calls, demos, timing, and personas
            </p>
          </div>
        </div>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px",
          textAlign: "center",
          maxWidth: 480,
          margin: "0 auto",
        }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: "linear-gradient(135deg, var(--balboa-bg-alt), rgba(59, 91, 219, 0.08))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
            color: "var(--balboa-blue)",
          }}>
            <BarChart3 size={28} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 6 }}>
            Building your playbook
          </h3>
          <p style={{ fontSize: 13, color: "var(--balboa-text-muted)", lineHeight: 1.6, marginBottom: 0 }}>
            {insufficientMessage}
          </p>
        </div>
      </div>
    );
  }

  // Dashboard with real data
  if (!data) return null;

  return (
    <div className="p-6">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, var(--balboa-navy), var(--balboa-blue))", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <BookOpen className="w-4.5 h-4.5" style={{ color: "white" }} />
        </div>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)" }}>Playbook Intelligence</h2>
          <p style={{ fontSize: 12, color: "var(--balboa-text-muted)" }}>
            Auto-detected patterns across messaging, calls, demos, timing, and personas
          </p>
        </div>
      </div>
      <PlaybookDashboard data={data} />
    </div>
  );
}
