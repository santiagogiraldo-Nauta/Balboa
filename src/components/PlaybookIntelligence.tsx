"use client";

import { BookOpen } from "lucide-react";
import PlaybookDashboard from "./PlaybookDashboard";
import { MOCK_PLAYBOOK_DASHBOARD } from "@/lib/mock-data";

export default function PlaybookIntelligence() {
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
      <PlaybookDashboard data={MOCK_PLAYBOOK_DASHBOARD} />
    </div>
  );
}
