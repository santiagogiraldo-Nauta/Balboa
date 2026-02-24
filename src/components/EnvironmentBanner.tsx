"use client";

import { getClientConfig } from "@/lib/config-client";

export default function EnvironmentBanner() {
  const { isSandbox } = getClientConfig();

  if (!isSandbox) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "linear-gradient(90deg, #f59e0b, #d97706)",
        color: "#1a1a2e",
        textAlign: "center",
        fontSize: 12,
        fontWeight: 700,
        padding: "5px 16px",
        letterSpacing: "0.05em",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }}
    >
      SANDBOX MODE — All data is simulated. Outreach actions are safe to test.
    </div>
  );
}
