"use client";

import { useState, useMemo } from "react";
import { Plus, Filter, Bot, ChevronRight, CheckSquare, Layers, Trash2 } from "lucide-react";
import { MOCK_OUTREACH_LISTS } from "@/lib/mock-outreach-progress";
import type { OutreachList, Lead } from "@/lib/types";

// ── Mock contacts for the selected list ──

interface ListContact {
  id: string;
  name: string;
  company: string;
  title: string;
  icpTier: "hot" | "warm" | "cold";
  status: "not_contacted" | "contacted" | "positive" | "negative" | "meeting_booked";
  sequence?: string;
  selected: boolean;
}

function generateMockContacts(list: OutreachList): ListContact[] {
  const names = [
    { name: "Alex Johnson", company: "TechFlow", title: "VP Sales" },
    { name: "Maria Garcia", company: "DataPrime", title: "CRO" },
    { name: "Chris Lee", company: "CloudBase", title: "Head of Revenue" },
    { name: "Aisha Patel", company: "NexGen", title: "Director of Sales" },
    { name: "Ryan Kim", company: "ScaleUp AI", title: "VP Growth" },
    { name: "Sophie Brown", company: "FinEdge", title: "CFO" },
    { name: "David Chen", company: "LogiPro", title: "VP Operations" },
    { name: "Laura Martinez", company: "MedRoute", title: "Director Supply Chain" },
    { name: "James Wilson", company: "PacketShip", title: "COO" },
    { name: "Nina Roberts", company: "OptiChain", title: "VP Logistics" },
  ];

  const tiers: ListContact["icpTier"][] = ["hot", "warm", "cold"];
  const statuses: ListContact["status"][] = ["not_contacted", "contacted", "positive", "negative", "meeting_booked"];
  const sequences = [undefined, "SaaS Outbound", "Event Follow-up", "Cold to Warm"];

  return names.slice(0, Math.min(list.stats.total, 10)).map((n, i) => ({
    id: `${list.id}-c-${i}`,
    ...n,
    icpTier: tiers[i % 3],
    status: statuses[i % 5],
    sequence: sequences[i % 4],
    selected: false,
  }));
}

// ── ICP Tier badge ──

function TierBadge({ tier }: { tier: "hot" | "warm" | "cold" }) {
  const config = {
    hot: { bg: "rgba(220,38,38,0.1)", color: "#dc2626", label: "Hot" },
    warm: { bg: "rgba(217,119,6,0.1)", color: "#d97706", label: "Warm" },
    cold: { bg: "rgba(100,116,139,0.1)", color: "#64748b", label: "Cold" },
  };
  const c = config[tier];
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 700,
      padding: "2px 8px",
      borderRadius: 4,
      background: c.bg,
      color: c.color,
      textTransform: "uppercase",
    }}>
      {c.label}
    </span>
  );
}

// ── Status badge ──

function StatusBadge({ status }: { status: ListContact["status"] }) {
  const config: Record<ListContact["status"], { bg: string; color: string; label: string }> = {
    not_contacted: { bg: "rgba(148,163,184,0.1)", color: "#94a3b8", label: "Not Contacted" },
    contacted: { bg: "rgba(37,99,235,0.1)", color: "#2563eb", label: "Contacted" },
    positive: { bg: "rgba(5,150,105,0.1)", color: "#059669", label: "Positive" },
    negative: { bg: "rgba(220,38,38,0.08)", color: "#dc2626", label: "Negative" },
    meeting_booked: { bg: "rgba(124,58,237,0.1)", color: "#7c3aed", label: "Meeting" },
  };
  const c = config[status];
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 600,
      padding: "2px 8px",
      borderRadius: 4,
      background: c.bg,
      color: c.color,
    }}>
      {c.label}
    </span>
  );
}

// ── Component ──

interface BDRCenterProps {
  leads: Lead[];
}

export default function BDRCenter({ leads }: BDRCenterProps) {
  const [lists] = useState<OutreachList[]>(MOCK_OUTREACH_LISTS);
  const [selectedListId, setSelectedListId] = useState<string>(lists[0]?.id ?? "");
  const [contacts, setContacts] = useState<ListContact[]>(() =>
    lists[0] ? generateMockContacts(lists[0]) : []
  );
  const [filterTier, setFilterTier] = useState<"all" | "hot" | "warm" | "cold">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | ListContact["status"]>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newListName, setNewListName] = useState("");

  // ── void usage warning fix ──
  void leads;

  const selectedList = lists.find((l) => l.id === selectedListId);

  const handleSelectList = (listId: string) => {
    setSelectedListId(listId);
    const list = lists.find((l) => l.id === listId);
    if (list) setContacts(generateMockContacts(list));
  };

  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      if (filterTier !== "all" && c.icpTier !== filterTier) return false;
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q);
      }
      return true;
    });
  }, [contacts, filterTier, filterStatus, searchQuery]);

  const toggleSelect = (id: string) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)));
  };

  const toggleAll = () => {
    const allSelected = filteredContacts.every((c) => c.selected);
    const filteredIds = new Set(filteredContacts.map((c) => c.id));
    setContacts((prev) =>
      prev.map((c) => (filteredIds.has(c.id) ? { ...c, selected: !allSelected } : c))
    );
  };

  const selectedCount = contacts.filter((c) => c.selected).length;

  const listStatusColor = (status: OutreachList["status"]) => {
    if (status === "active") return "#059669";
    if (status === "paused") return "#d97706";
    return "#94a3b8";
  };

  return (
    <div style={{ display: "flex", gap: 16, minHeight: 500 }}>
      {/* ── Left: List Manager ── */}
      <div style={{ width: "32%", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--balboa-navy)", margin: 0 }}>
            Outreach Lists
          </h3>
          <button
            onClick={() => setShowCreateModal(!showCreateModal)}
            style={{
              padding: "5px 10px",
              fontSize: 11,
              fontWeight: 600,
              background: "var(--balboa-navy)",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Plus size={12} />
            New List
          </button>
        </div>

        {/* Create list modal */}
        {showCreateModal && (
          <div className="card" style={{ padding: 14, marginBottom: 10 }}>
            <input
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="List name..."
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid var(--balboa-border-light)",
                borderRadius: 6,
                fontSize: 12,
                marginBottom: 8,
                background: "transparent",
                color: "var(--balboa-text)",
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => { setShowCreateModal(false); setNewListName(""); }}
                style={{
                  flex: 1,
                  padding: "6px",
                  fontSize: 11,
                  fontWeight: 600,
                  background: "transparent",
                  border: "1px solid var(--balboa-border-light)",
                  borderRadius: 6,
                  cursor: "pointer",
                  color: "var(--balboa-text-muted)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowCreateModal(false); setNewListName(""); }}
                disabled={!newListName.trim()}
                style={{
                  flex: 1,
                  padding: "6px",
                  fontSize: 11,
                  fontWeight: 600,
                  background: newListName.trim() ? "var(--balboa-blue)" : "var(--balboa-border-light)",
                  color: newListName.trim() ? "white" : "var(--balboa-text-muted)",
                  border: "none",
                  borderRadius: 6,
                  cursor: newListName.trim() ? "pointer" : "not-allowed",
                }}
              >
                Create
              </button>
            </div>
          </div>
        )}

        {/* List cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {lists.map((list) => (
            <div
              key={list.id}
              onClick={() => handleSelectList(list.id)}
              className="card"
              style={{
                padding: 12,
                cursor: "pointer",
                borderLeft: selectedListId === list.id ? "3px solid var(--balboa-navy)" : "3px solid transparent",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-navy)" }}>
                  {list.name}
                </span>
                <ChevronRight size={14} style={{ color: "var(--balboa-text-muted)" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: listStatusColor(list.status),
                  textTransform: "uppercase",
                }}>
                  ● {list.status}
                </span>
                <span style={{ fontSize: 11, color: "var(--balboa-text-muted)" }}>
                  {list.stats.total} contacts
                </span>
              </div>
              {/* Progress bar */}
              <div style={{
                height: 4,
                background: "rgba(148,163,184,0.15)",
                borderRadius: 2,
                overflow: "hidden",
                marginBottom: 4,
              }}>
                <div style={{
                  height: "100%",
                  width: `${list.stats.total > 0 ? (list.stats.contacted / list.stats.total) * 100 : 0}%`,
                  background: "var(--balboa-blue)",
                  borderRadius: 2,
                  transition: "width 0.3s ease",
                }} />
              </div>
              <div style={{ display: "flex", gap: 10, fontSize: 10, color: "var(--balboa-text-muted)" }}>
                <span>{list.stats.contacted} contacted</span>
                <span>{list.stats.positive} positive</span>
                <span>{list.stats.meetings} meetings</span>
              </div>
            </div>
          ))}
        </div>

        {/* Agent integration button */}
        <button
          onClick={() => { /* placeholder for agent integration */ }}
          style={{
            width: "100%",
            marginTop: 14,
            padding: "10px",
            fontSize: 12,
            fontWeight: 600,
            background: "rgba(124,58,237,0.06)",
            color: "#7c3aed",
            border: "1px dashed rgba(124,58,237,0.3)",
            borderRadius: 8,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Bot size={14} />
          Run ICP Cleaning Agent
        </button>
      </div>

      {/* ── Right: Contact Grid ── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {selectedList && (
          <>
            {/* Header + filters */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--balboa-navy)", margin: 0 }}>
                {selectedList.name}
              </h3>
              {selectedCount > 0 && (
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-blue)" }}>
                  {selectedCount} selected
                </span>
              )}
            </div>

            {/* Filter row */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
              flexWrap: "wrap",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Filter size={12} style={{ color: "var(--balboa-text-muted)" }} />
                <select
                  value={filterTier}
                  onChange={(e) => setFilterTier(e.target.value as typeof filterTier)}
                  style={{
                    padding: "5px 8px",
                    fontSize: 11,
                    border: "1px solid var(--balboa-border-light)",
                    borderRadius: 6,
                    background: "transparent",
                    color: "var(--balboa-text)",
                    cursor: "pointer",
                  }}
                >
                  <option value="all">All Tiers</option>
                  <option value="hot">Hot</option>
                  <option value="warm">Warm</option>
                  <option value="cold">Cold</option>
                </select>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
                  style={{
                    padding: "5px 8px",
                    fontSize: 11,
                    border: "1px solid var(--balboa-border-light)",
                    borderRadius: 6,
                    background: "transparent",
                    color: "var(--balboa-text)",
                    cursor: "pointer",
                  }}
                >
                  <option value="all">All Statuses</option>
                  <option value="not_contacted">Not Contacted</option>
                  <option value="contacted">Contacted</option>
                  <option value="positive">Positive</option>
                  <option value="negative">Negative</option>
                  <option value="meeting_booked">Meeting Booked</option>
                </select>
              </div>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name or company..."
                style={{
                  padding: "5px 10px",
                  fontSize: 12,
                  border: "1px solid var(--balboa-border-light)",
                  borderRadius: 6,
                  flex: 1,
                  minWidth: 140,
                  background: "transparent",
                  color: "var(--balboa-text)",
                }}
              />
            </div>

            {/* Bulk actions bar */}
            {selectedCount > 0 && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 10,
                padding: "8px 12px",
                background: "rgba(30,42,94,0.04)",
                borderRadius: 8,
              }}>
                <button style={{
                  padding: "5px 10px", fontSize: 11, fontWeight: 600,
                  background: "var(--balboa-blue)", color: "white",
                  border: "none", borderRadius: 5, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  <Layers size={11} />
                  Assign Sequence
                </button>
                <button style={{
                  padding: "5px 10px", fontSize: 11, fontWeight: 600,
                  background: "transparent", color: "var(--balboa-navy)",
                  border: "1px solid var(--balboa-border-light)", borderRadius: 5, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  <CheckSquare size={11} />
                  Change Tier
                </button>
                <button style={{
                  padding: "5px 10px", fontSize: 11, fontWeight: 600,
                  background: "transparent", color: "#dc2626",
                  border: "1px solid rgba(220,38,38,0.2)", borderRadius: 5, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  <Trash2 size={11} />
                  Remove
                </button>
              </div>
            )}

            {/* Contact table */}
            <div className="card" style={{ overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--balboa-border-light)" }}>
                    <th style={{ padding: "10px 12px", textAlign: "left", width: 32 }}>
                      <input type="checkbox" checked={filteredContacts.length > 0 && filteredContacts.every((c) => c.selected)} onChange={toggleAll} style={{ cursor: "pointer" }} />
                    </th>
                    <th style={{ padding: "10px 8px", textAlign: "left", fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}>Name</th>
                    <th style={{ padding: "10px 8px", textAlign: "left", fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}>Company</th>
                    <th style={{ padding: "10px 8px", textAlign: "left", fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}>Title</th>
                    <th style={{ padding: "10px 8px", textAlign: "center", fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}>ICP</th>
                    <th style={{ padding: "10px 8px", textAlign: "center", fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}>Status</th>
                    <th style={{ padding: "10px 8px", textAlign: "left", fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}>Sequence</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map((c) => (
                    <tr
                      key={c.id}
                      style={{
                        borderBottom: "1px solid rgba(148,163,184,0.08)",
                        background: c.selected ? "rgba(30,42,94,0.03)" : "transparent",
                      }}
                    >
                      <td style={{ padding: "8px 12px" }}>
                        <input type="checkbox" checked={c.selected} onChange={() => toggleSelect(c.id)} style={{ cursor: "pointer" }} />
                      </td>
                      <td style={{ padding: "8px", fontWeight: 600, color: "var(--balboa-navy)" }}>{c.name}</td>
                      <td style={{ padding: "8px", color: "var(--balboa-text)" }}>{c.company}</td>
                      <td style={{ padding: "8px", color: "var(--balboa-text-muted)" }}>{c.title}</td>
                      <td style={{ padding: "8px", textAlign: "center" }}><TierBadge tier={c.icpTier} /></td>
                      <td style={{ padding: "8px", textAlign: "center" }}><StatusBadge status={c.status} /></td>
                      <td style={{ padding: "8px", color: "var(--balboa-text-muted)", fontSize: 11 }}>
                        {c.sequence || <span style={{ opacity: 0.4 }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredContacts.length === 0 && (
                <div style={{ padding: 30, textAlign: "center", color: "var(--balboa-text-muted)", fontSize: 13 }}>
                  No contacts match your filters
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
