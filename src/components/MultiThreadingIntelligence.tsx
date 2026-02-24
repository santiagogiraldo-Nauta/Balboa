"use client";

import { useState, useMemo } from "react";
import {
  Users, Building, AlertTriangle, CheckCircle, User,
  Shield, Eye, Star, Lightbulb, ChevronDown, ChevronUp,
  UserPlus, Activity,
} from "lucide-react";
import type { Lead, Deal, Account } from "@/lib/types";

// ── Props ────────────────────────────────────────────────────────────────────

interface MultiThreadingIntelligenceProps {
  leads: Lead[];
  deals: Deal[];
  accounts: Account[];
  onNavigateToLead: (leadId: string) => void;
}

// ── Role detection & types ──────────────────────────────────────────────────

type StakeholderRole =
  | "Champion"
  | "Economic Buyer"
  | "Technical Validator"
  | "Influencer"
  | "Blocker"
  | "End User";

type EngagementLevel = "high" | "medium" | "low" | "none";

interface StakeholderContact {
  leadId: string;
  name: string;
  position: string;
  role: StakeholderRole;
  engagementLevel: EngagementLevel;
  touchpoints: number;
  lastTouch: string | null;
  email?: string;
}

interface AccountThread {
  accountId: string;
  companyName: string;
  industry?: string;
  contacts: StakeholderContact[];
  healthScore: number; // 0-100
  healthLabel: "Excellent" | "Good" | "Medium" | "Poor";
  isSingleThreaded: boolean;
  missingRoles: StakeholderRole[];
  suggestion: string;
  dealCount: number;
  totalDealValue: number;
}

// ── Role detection logic ────────────────────────────────────────────────────

function detectRole(position: string): StakeholderRole {
  const pos = position.toLowerCase();

  // Economic Buyer: CFO, Controller, Finance leadership
  if (
    pos.includes("cfo") ||
    pos.includes("chief financial") ||
    pos.includes("controller") ||
    pos.includes("vp of finance") ||
    pos.includes("head of finance")
  ) {
    return "Economic Buyer";
  }

  // Technical Validator: CTO, CIO, IT Director, Engineering leadership
  if (
    pos.includes("cto") ||
    pos.includes("cio") ||
    pos.includes("chief technology") ||
    pos.includes("chief information") ||
    pos.includes("it director") ||
    pos.includes("engineering")
  ) {
    return "Technical Validator";
  }

  // Champion / Economic Buyer: VP/Director of Operations, Supply Chain, Procurement
  if (
    (pos.includes("vp") || pos.includes("vice president") || pos.includes("director") || pos.includes("head of")) &&
    (pos.includes("supply chain") || pos.includes("procurement") || pos.includes("operations") ||
     pos.includes("logistics") || pos.includes("sourcing") || pos.includes("commercial"))
  ) {
    return "Champion";
  }

  // Economic Buyer: C-suite that isn't CTO/CIO/CFO
  if (
    pos.includes("ceo") ||
    pos.includes("chief executive") ||
    pos.includes("chief operating") ||
    pos.includes("coo") ||
    pos.includes("president") ||
    pos.includes("svp") ||
    pos.includes("senior vice president") ||
    pos.includes("general manager")
  ) {
    return "Economic Buyer";
  }

  // VP/Director without specific supply chain context -> Influencer
  if (pos.includes("vp") || pos.includes("vice president") || pos.includes("director")) {
    return "Influencer";
  }

  // Manager / Senior roles -> Influencer
  if (pos.includes("manager") || pos.includes("senior") || pos.includes("lead")) {
    return "Influencer";
  }

  // Analyst / Specialist / Coordinator -> End User
  if (
    pos.includes("analyst") ||
    pos.includes("specialist") ||
    pos.includes("coordinator") ||
    pos.includes("associate")
  ) {
    return "End User";
  }

  // Default
  return "End User";
}

function getEngagementLevel(lead: Lead): EngagementLevel {
  const touchpoints = lead.touchpointTimeline.length;
  if (touchpoints >= 5) return "high";
  if (touchpoints >= 3) return "medium";
  if (touchpoints >= 1) return "low";
  return "none";
}

// ── Styles ──────────────────────────────────────────────────────────────────

const roleConfig: Record<StakeholderRole, { icon: typeof User; color: string; bg: string }> = {
  "Champion": { icon: Star, color: "#2b8a3e", bg: "#ecfdf5" },
  "Economic Buyer": { icon: Shield, color: "#3b5bdb", bg: "#eff6ff" },
  "Technical Validator": { icon: Eye, color: "#7c3aed", bg: "#f5f3ff" },
  "Influencer": { icon: Lightbulb, color: "#d97706", bg: "#fffbeb" },
  "Blocker": { icon: AlertTriangle, color: "#e03131", bg: "#fef2f2" },
  "End User": { icon: User, color: "#868e96", bg: "#f8f9fa" },
};

const engagementConfig: Record<EngagementLevel, { label: string; color: string; dot: string }> = {
  high: { label: "High", color: "#2b8a3e", dot: "#40c057" },
  medium: { label: "Medium", color: "#d97706", dot: "#fcc419" },
  low: { label: "Low", color: "#e67700", dot: "#ff922b" },
  none: { label: "None", color: "#868e96", dot: "#dee2e6" },
};

const healthColors: Record<string, { color: string; bg: string; border: string }> = {
  Excellent: { color: "#2b8a3e", bg: "#ecfdf5", border: "#b2f2bb" },
  Good: { color: "#3b5bdb", bg: "#eff6ff", border: "#bac8ff" },
  Medium: { color: "#d97706", bg: "#fffbeb", border: "#ffe066" },
  Poor: { color: "#e03131", bg: "#fef2f2", border: "#ffa8a8" },
};

const ALL_ROLES: StakeholderRole[] = [
  "Champion", "Economic Buyer", "Technical Validator", "Influencer", "End User",
];

// ── Component ────────────────────────────────────────────────────────────────

export default function MultiThreadingIntelligence({
  leads,
  deals,
  accounts,
  onNavigateToLead,
}: MultiThreadingIntelligenceProps) {
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
  const [filterHealth, setFilterHealth] = useState<"all" | "single-threaded" | "missing-roles">("all");

  // ── Build account threads ─────────────────────────────────────────────

  const accountThreads: AccountThread[] = useMemo(() => {
    // Group leads by company
    const companyMap = new Map<string, Lead[]>();
    leads.forEach((lead) => {
      const company = lead.company.trim();
      if (!company) return;
      const existing = companyMap.get(company) || [];
      existing.push(lead);
      companyMap.set(company, existing);
    });

    // Build thread objects
    const threads: AccountThread[] = [];

    companyMap.forEach((companyLeads, companyName) => {
      // Match to account
      const account = accounts.find(
        (a) => a.companyName.toLowerCase() === companyName.toLowerCase()
      );

      // Build contacts
      const contacts: StakeholderContact[] = companyLeads.map((lead) => ({
        leadId: lead.id,
        name: `${lead.firstName} ${lead.lastName}`,
        position: lead.position,
        role: detectRole(lead.position),
        engagementLevel: getEngagementLevel(lead),
        touchpoints: lead.touchpointTimeline.length,
        lastTouch:
          lead.touchpointTimeline.length > 0
            ? lead.touchpointTimeline[lead.touchpointTimeline.length - 1].date
            : null,
        email: lead.email,
      }));

      // Determine covered and missing roles
      const coveredRoles = new Set(contacts.map((c) => c.role));
      const missingRoles = ALL_ROLES.filter((r) => !coveredRoles.has(r));

      // Company deals
      const companyDeals = deals.filter(
        (d) =>
          d.dealName.toLowerCase().includes(companyName.toLowerCase()) ||
          (account && d.accountId === account.id)
      );
      const totalDealValue = companyDeals.reduce((s, d) => s + (d.amount || 0), 0);

      // Health score: contacts (40%), roles covered (35%), engagement (25%)
      const contactScore = Math.min(contacts.length / 5, 1) * 40;
      const roleScore = ((ALL_ROLES.length - missingRoles.length) / ALL_ROLES.length) * 35;
      const engagementScore =
        (contacts.filter((c) => c.engagementLevel === "high" || c.engagementLevel === "medium").length /
          Math.max(contacts.length, 1)) * 25;
      const healthScore = Math.round(contactScore + roleScore + engagementScore);

      const healthLabel: AccountThread["healthLabel"] =
        healthScore >= 80 ? "Excellent" :
        healthScore >= 60 ? "Good" :
        healthScore >= 35 ? "Medium" : "Poor";

      const isSingleThreaded = contacts.length <= 1;

      // Suggestion
      let suggestion = "";
      if (isSingleThreaded) {
        suggestion = `You only have ${contacts.length} contact at ${companyName}. Consider reaching out to their VP of Procurement or Operations.`;
      } else if (missingRoles.length > 0) {
        suggestion = `Missing ${missingRoles[0]} perspective. Find a ${missingRoles[0].toLowerCase()} to strengthen this account.`;
      } else if (contacts.filter((c) => c.engagementLevel === "none").length > 0) {
        const unengaged = contacts.filter((c) => c.engagementLevel === "none");
        suggestion = `Re-engage ${unengaged[0].name} -- they have no recent touchpoints.`;
      } else {
        suggestion = "Good coverage. Keep nurturing all stakeholders.";
      }

      threads.push({
        accountId: account?.id || companyName,
        companyName,
        industry: account?.industry,
        contacts,
        healthScore,
        healthLabel,
        isSingleThreaded,
        missingRoles,
        suggestion,
        dealCount: companyDeals.length,
        totalDealValue,
      });
    });

    // Sort: single-threaded first, then by health score ascending (worst first)
    threads.sort((a, b) => {
      if (a.isSingleThreaded && !b.isSingleThreaded) return -1;
      if (!a.isSingleThreaded && b.isSingleThreaded) return 1;
      return a.healthScore - b.healthScore;
    });

    return threads;
  }, [leads, deals, accounts]);

  // ── Filtered threads ──────────────────────────────────────────────────

  const filteredThreads = useMemo(() => {
    switch (filterHealth) {
      case "single-threaded":
        return accountThreads.filter((t) => t.isSingleThreaded);
      case "missing-roles":
        return accountThreads.filter((t) => t.missingRoles.length > 0);
      default:
        return accountThreads;
    }
  }, [accountThreads, filterHealth]);

  // ── Summary stats ─────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = accountThreads.length;
    const singleThreaded = accountThreads.filter((t) => t.isSingleThreaded).length;
    const avgHealth = total > 0
      ? Math.round(accountThreads.reduce((s, t) => s + t.healthScore, 0) / total)
      : 0;
    const totalContacts = accountThreads.reduce((s, t) => s + t.contacts.length, 0);
    return { total, singleThreaded, avgHealth, totalContacts };
  }, [accountThreads]);

  // ── Styles ────────────────────────────────────────────────────────────

  const cardStyle: React.CSSProperties = {
    background: "white",
    borderRadius: 12,
    border: "1px solid #f1f3f5",
    boxShadow: "0 1px 4px rgba(30,42,94,0.04)",
    padding: "20px 24px",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Summary Row ────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Building style={{ width: 16, height: 16, color: "#3b5bdb" }} />
            </div>
            <span style={{ fontSize: 11, color: "#868e96", fontWeight: 500 }}>Accounts</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#1e2a5e", letterSpacing: "-0.03em" }}>
            {stats.total}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Users style={{ width: 16, height: 16, color: "#2b8a3e" }} />
            </div>
            <span style={{ fontSize: 11, color: "#868e96", fontWeight: 500 }}>Total Contacts</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#1e2a5e", letterSpacing: "-0.03em" }}>
            {stats.totalContacts}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <AlertTriangle style={{ width: 16, height: 16, color: "#e03131" }} />
            </div>
            <span style={{ fontSize: 11, color: "#868e96", fontWeight: 500 }}>Single-Threaded</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#e03131", letterSpacing: "-0.03em" }}>
            {stats.singleThreaded}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#fffbeb", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Activity style={{ width: 16, height: 16, color: "#d97706" }} />
            </div>
            <span style={{ fontSize: 11, color: "#868e96", fontWeight: 500 }}>Avg Health</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#1e2a5e", letterSpacing: "-0.03em" }}>
            {stats.avgHealth}%
          </div>
        </div>
      </div>

      {/* ── Filter Tabs ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8 }}>
        {(
          [
            { key: "all" as const, label: "All Accounts", count: accountThreads.length },
            { key: "single-threaded" as const, label: "Single-Threaded", count: accountThreads.filter((t) => t.isSingleThreaded).length },
            { key: "missing-roles" as const, label: "Missing Roles", count: accountThreads.filter((t) => t.missingRoles.length > 0).length },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterHealth(tab.key)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              border: "1px solid",
              cursor: "pointer",
              transition: "all 0.15s ease",
              background: filterHealth === tab.key ? "#1e2a5e" : "white",
              color: filterHealth === tab.key ? "white" : "#1e2a5e",
              borderColor: filterHealth === tab.key ? "#1e2a5e" : "#f1f3f5",
            }}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* ── Account Cards ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {filteredThreads.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: "center", padding: 40, color: "#868e96", fontSize: 13 }}>
            No accounts match this filter
          </div>
        ) : (
          filteredThreads.map((thread) => {
            const isExpanded = expandedAccountId === thread.accountId;
            const hc = healthColors[thread.healthLabel];

            return (
              <div key={thread.accountId} style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
                {/* Account header */}
                <div
                  onClick={() => setExpandedAccountId(isExpanded ? null : thread.accountId)}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "16px 20px", cursor: "pointer",
                    borderLeft: `4px solid ${hc.color}`,
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: hc.bg, border: `1px solid ${hc.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Building style={{ width: 18, height: 18, color: hc.color }} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#1e2a5e" }}>
                        {thread.companyName}
                      </span>
                      <span style={{ fontSize: 11, color: "#868e96" }}>
                        ({thread.contacts.length} contact{thread.contacts.length !== 1 ? "s" : ""})
                      </span>
                      {thread.isSingleThreaded && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                          background: "#fef2f2", color: "#e03131", letterSpacing: "0.05em",
                          display: "flex", alignItems: "center", gap: 3,
                        }}>
                          <AlertTriangle style={{ width: 10, height: 10 }} /> SINGLE-THREADED
                        </span>
                      )}
                    </div>
                    {thread.industry && (
                      <div style={{ fontSize: 11, color: "#868e96", marginTop: 2 }}>
                        {thread.industry}
                        {thread.dealCount > 0 && ` -- ${thread.dealCount} deal${thread.dealCount !== 1 ? "s" : ""}`}
                        {thread.totalDealValue > 0 && ` ($${(thread.totalDealValue / 1000).toFixed(0)}K)`}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: "#868e96", fontWeight: 500 }}>Health</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: hc.color }}>{thread.healthLabel}</div>
                    </div>
                    <div style={{
                      width: 40, height: 40, borderRadius: "50%",
                      background: `conic-gradient(${hc.color} ${thread.healthScore * 3.6}deg, #f1f3f5 0deg)`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: "50%", background: "white",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, fontWeight: 700, color: hc.color,
                      }}>
                        {thread.healthScore}
                      </div>
                    </div>
                    {isExpanded
                      ? <ChevronUp style={{ width: 16, height: 16, color: "#868e96" }} />
                      : <ChevronDown style={{ width: 16, height: 16, color: "#868e96" }} />
                    }
                  </div>
                </div>

                {/* Expanded: Org chart + suggestions */}
                {isExpanded && (
                  <div style={{ padding: "0 20px 20px", borderTop: "1px solid #f1f3f5" }}>
                    {/* Org chart grid */}
                    <div style={{ marginTop: 16, marginBottom: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#868e96", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                        Stakeholder Map
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                        {thread.contacts.map((contact) => {
                          const rc = roleConfig[contact.role];
                          const ec = engagementConfig[contact.engagementLevel];
                          const RoleIcon = rc.icon;

                          return (
                            <div
                              key={contact.leadId}
                              onClick={() => onNavigateToLead(contact.leadId)}
                              style={{
                                padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                                background: rc.bg, border: `1px solid ${rc.color}22`,
                                transition: "box-shadow 0.15s ease, transform 0.15s ease",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.boxShadow = "0 2px 8px rgba(30,42,94,0.1)";
                                e.currentTarget.style.transform = "translateY(-1px)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.boxShadow = "none";
                                e.currentTarget.style.transform = "translateY(0)";
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                <div style={{
                                  width: 8, height: 8, borderRadius: "50%", background: ec.dot,
                                }} />
                                <span style={{ fontSize: 13, fontWeight: 700, color: "#1e2a5e" }}>
                                  {contact.name}
                                </span>
                              </div>
                              <div style={{ fontSize: 11, color: "#868e96", marginBottom: 6 }}>
                                {contact.position}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <span style={{
                                  fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                                  background: "white", color: rc.color, display: "inline-flex",
                                  alignItems: "center", gap: 4,
                                }}>
                                  <RoleIcon style={{ width: 10, height: 10 }} />
                                  {contact.role}
                                </span>
                                <span style={{ fontSize: 10, color: ec.color, fontWeight: 600 }}>
                                  {ec.label} ({contact.touchpoints} tp)
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Missing roles & suggestions */}
                    {(thread.missingRoles.length > 0 || thread.isSingleThreaded) && (
                      <div style={{
                        padding: "14px 16px", borderRadius: 10,
                        background: thread.isSingleThreaded ? "#fef2f2" : "#fffbeb",
                        border: `1px solid ${thread.isSingleThreaded ? "#ffa8a8" : "#ffe066"}`,
                        marginBottom: 12,
                      }}>
                        {thread.missingRoles.length > 0 && (
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                            <AlertTriangle style={{
                              width: 14, height: 14, flexShrink: 0, marginTop: 1,
                              color: thread.isSingleThreaded ? "#e03131" : "#d97706",
                            }} />
                            <div style={{ fontSize: 12, color: "#1e2a5e", fontWeight: 600 }}>
                              Missing: {thread.missingRoles.join(", ")} perspective{thread.missingRoles.length !== 1 ? "s" : ""}
                            </div>
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <UserPlus style={{
                            width: 14, height: 14, flexShrink: 0, marginTop: 1,
                            color: "#3b5bdb",
                          }} />
                          <div style={{ fontSize: 12, color: "#3b5bdb", fontWeight: 600 }}>
                            {thread.suggestion}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Good coverage message */}
                    {thread.missingRoles.length === 0 && !thread.isSingleThreaded && (
                      <div style={{
                        padding: "14px 16px", borderRadius: 10,
                        background: "#ecfdf5", border: "1px solid #b2f2bb",
                        display: "flex", alignItems: "center", gap: 8,
                      }}>
                        <CheckCircle style={{ width: 14, height: 14, color: "#2b8a3e" }} />
                        <span style={{ fontSize: 12, color: "#2b8a3e", fontWeight: 600 }}>
                          {thread.suggestion}
                        </span>
                      </div>
                    )}
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
