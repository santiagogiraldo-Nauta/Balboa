"use client";

import { useState } from "react";
import { Sparkles, X, TrendingUp, Target, Users } from "lucide-react";

export default function AnalyzerPanel({ onDismiss }: { onDismiss: () => void }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleAnalyze = async (type: "lead" | "deal" | "pipeline") => {
    setAnalyzing(true);
    setResult(null);
    try {
      const res = await fetch(`/api/analyze/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setResult(JSON.stringify(data, null, 2));
      } else {
        setResult("Analysis failed. Try again.");
      }
    } catch {
      setResult("Network error. Try again.");
    }
    setAnalyzing(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onDismiss}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white", borderRadius: 16, padding: "28px 32px",
          width: "100%", maxWidth: 440, boxShadow: "0 24px 48px rgba(0,0,0,0.15)",
          border: "1px solid var(--balboa-border-light)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Sparkles style={{ width: 20, height: 20, color: "var(--balboa-blue)" }} />
            <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--balboa-navy)", letterSpacing: "-0.02em" }}>
              Analyzer
            </h3>
          </div>
          <button onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X style={{ width: 18, height: 18, color: "var(--balboa-text-muted)" }} />
          </button>
        </div>

        <p style={{ fontSize: 13, color: "var(--balboa-text-muted)", marginBottom: 20, lineHeight: 1.5 }}>
          Get AI-powered recommendations for your pipeline, deals, or individual leads.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={() => handleAnalyze("pipeline")}
            disabled={analyzing}
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "12px 16px", borderRadius: 10, border: "1px solid var(--balboa-border-light)",
              background: "var(--balboa-bg-alt)", cursor: analyzing ? "wait" : "pointer",
              opacity: analyzing ? 0.6 : 1, fontSize: 13, fontWeight: 600,
              color: "var(--balboa-navy)", textAlign: "left" as const,
            }}
          >
            <TrendingUp style={{ width: 18, height: 18, color: "var(--balboa-blue)" }} />
            <div>
              <div>{analyzing ? "Analyzing..." : "Analyze Pipeline"}</div>
              <div style={{ fontSize: 11, fontWeight: 400, color: "var(--balboa-text-muted)", marginTop: 2 }}>
                Prioritize your entire deal pipeline by close probability
              </div>
            </div>
          </button>

          <button
            onClick={() => handleAnalyze("deal")}
            disabled={analyzing}
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "12px 16px", borderRadius: 10, border: "1px solid var(--balboa-border-light)",
              background: "var(--balboa-bg-alt)", cursor: analyzing ? "wait" : "pointer",
              opacity: analyzing ? 0.6 : 1, fontSize: 13, fontWeight: 600,
              color: "var(--balboa-navy)", textAlign: "left" as const,
            }}
          >
            <Target style={{ width: 18, height: 18, color: "#f59f00" }} />
            <div>
              <div>{analyzing ? "Analyzing..." : "Analyze Deal"}</div>
              <div style={{ fontSize: 11, fontWeight: 400, color: "var(--balboa-text-muted)", marginTop: 2 }}>
                Get AI strategy and next actions for a specific deal
              </div>
            </div>
          </button>

          <button
            onClick={() => handleAnalyze("lead")}
            disabled={analyzing}
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "12px 16px", borderRadius: 10, border: "1px solid var(--balboa-border-light)",
              background: "var(--balboa-bg-alt)", cursor: analyzing ? "wait" : "pointer",
              opacity: analyzing ? 0.6 : 1, fontSize: 13, fontWeight: 600,
              color: "var(--balboa-navy)", textAlign: "left" as const,
            }}
          >
            <Users style={{ width: 18, height: 18, color: "var(--balboa-green)" }} />
            <div>
              <div>{analyzing ? "Analyzing..." : "Analyze Lead"}</div>
              <div style={{ fontSize: 11, fontWeight: 400, color: "var(--balboa-text-muted)", marginTop: 2 }}>
                Best channel, timing, and expected outcomes for a lead
              </div>
            </div>
          </button>
        </div>

        {result && (
          <div style={{
            marginTop: 16, padding: "12px 14px", borderRadius: 10,
            background: "var(--balboa-bg-alt)", border: "1px solid var(--balboa-border-light)",
            maxHeight: 200, overflowY: "auto",
          }}>
            <pre style={{ fontSize: 11, color: "var(--balboa-text-secondary)", whiteSpace: "pre-wrap", margin: 0 }}>
              {result}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
