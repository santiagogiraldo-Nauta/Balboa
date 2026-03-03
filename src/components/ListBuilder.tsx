"use client";

import { useState, useCallback } from "react";
import { Search, Plus, X, Download, UserPlus, Loader2, Sparkles } from "lucide-react";

// ── Types ──

interface GeneratedContact {
  id: string;
  name: string;
  title: string;
  company: string;
  industry: string;
  employees: number;
  linkedinUrl: string;
  icpScore: number;
  selected: boolean;
}

// ── Mock generation ──

const MOCK_CONTACTS: Omit<GeneratedContact, "id" | "selected">[] = [
  { name: "Sarah Chen", title: "VP of Sales", company: "Streamline AI", industry: "SaaS", employees: 320, linkedinUrl: "https://linkedin.com/in/sarachen", icpScore: 92 },
  { name: "Marcus Rivera", title: "Head of Revenue", company: "Apex Fintech", industry: "FinTech", employees: 180, linkedinUrl: "https://linkedin.com/in/mrivera", icpScore: 88 },
  { name: "Diana Okafor", title: "CRO", company: "LogiTrack Solutions", industry: "Logistics", employees: 450, linkedinUrl: "https://linkedin.com/in/dokafor", icpScore: 95 },
  { name: "James Whitfield", title: "VP Sales & Marketing", company: "HealthBridge", industry: "Healthcare", employees: 220, linkedinUrl: "https://linkedin.com/in/jwhitfield", icpScore: 76 },
  { name: "Priya Sharma", title: "Director of Sales", company: "NovaPay", industry: "FinTech", employees: 140, linkedinUrl: "https://linkedin.com/in/psharma", icpScore: 84 },
  { name: "Tom Brennan", title: "VP of Growth", company: "CloudShift", industry: "SaaS", employees: 550, linkedinUrl: "https://linkedin.com/in/tbrennan", icpScore: 90 },
  { name: "Lucia Martínez", title: "Head of Business Dev", company: "FreightPulse", industry: "Logistics", employees: 380, linkedinUrl: "https://linkedin.com/in/lmartinez", icpScore: 87 },
  { name: "Andre Williams", title: "CRO", company: "MedSupply Pro", industry: "Healthcare", employees: 290, linkedinUrl: "https://linkedin.com/in/awilliams", icpScore: 79 },
  { name: "Kenji Tanaka", title: "VP of Revenue Operations", company: "DataForge", industry: "SaaS", employees: 410, linkedinUrl: "https://linkedin.com/in/ktanaka", icpScore: 91 },
  { name: "Emily Foster", title: "Director of Sales", company: "SupplyStack", industry: "Manufacturing", employees: 680, linkedinUrl: "https://linkedin.com/in/efoster", icpScore: 82 },
];

// ── Chip Input ──

function ChipInput({ label, chips, onAdd, onRemove, placeholder }: {
  label: string;
  chips: string[];
  onAdd: (val: string) => void;
  onRemove: (idx: number) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      onAdd(input.trim());
      setInput("");
    }
    if (e.key === "Backspace" && !input && chips.length > 0) {
      onRemove(chips.length - 1);
    }
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>
        {label}
      </label>
      <div style={{
        border: "1px solid var(--balboa-border-light)",
        borderRadius: 8,
        padding: "6px 8px",
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        alignItems: "center",
        minHeight: 36,
      }}>
        {chips.map((chip, i) => (
          <span key={i} style={{
            background: "rgba(30,42,94,0.08)",
            color: "var(--balboa-navy)",
            fontSize: 12,
            fontWeight: 600,
            padding: "3px 8px",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}>
            {chip}
            <X size={11} style={{ cursor: "pointer", opacity: 0.6 }} onClick={() => onRemove(i)} />
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={chips.length === 0 ? placeholder : ""}
          style={{
            border: "none",
            outline: "none",
            fontSize: 13,
            flex: 1,
            minWidth: 80,
            background: "transparent",
            color: "var(--balboa-text)",
          }}
        />
      </div>
    </div>
  );
}

// ── Component ──

export default function ListBuilder() {
  // Persona form state
  const [titles, setTitles] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [compMin, setCompMin] = useState("");
  const [compMax, setCompMax] = useState("");
  const [geography, setGeography] = useState("");
  const [additionalFilters, setAdditionalFilters] = useState("");

  // Results state
  const [contacts, setContacts] = useState<GeneratedContact[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  const handleGenerate = useCallback(() => {
    setGenerating(true);
    setTimeout(() => {
      const results = MOCK_CONTACTS.map((c, i) => ({
        ...c,
        id: `gen-${i}`,
        selected: false,
      }));
      setContacts(results);
      setGenerating(false);
      setGenerated(true);
    }, 2000);
  }, []);

  const toggleSelect = (id: string) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c))
    );
  };

  const toggleAll = () => {
    const allSelected = contacts.every((c) => c.selected);
    setContacts((prev) => prev.map((c) => ({ ...c, selected: !allSelected })));
  };

  const selectedCount = contacts.filter((c) => c.selected).length;

  const icpColor = (score: number) => {
    if (score >= 85) return "#059669";
    if (score >= 70) return "#d97706";
    return "#dc2626";
  };

  const canGenerate = titles.length > 0 || industries.length > 0;

  return (
    <div style={{ display: "flex", gap: 20, minHeight: 500 }}>
      {/* ── Left: Persona Form ── */}
      <div style={{ width: "38%", flexShrink: 0 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
            <Search size={16} style={{ color: "var(--balboa-blue)" }} />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--balboa-navy)", margin: 0 }}>
              Buyer Persona
            </h3>
          </div>

          <ChipInput
            label="Job Titles"
            chips={titles}
            onAdd={(v) => setTitles([...titles, v])}
            onRemove={(i) => setTitles(titles.filter((_, idx) => idx !== i))}
            placeholder="VP Sales, CRO, Head of Revenue..."
          />

          <ChipInput
            label="Industries"
            chips={industries}
            onAdd={(v) => setIndustries([...industries, v])}
            onRemove={(i) => setIndustries(industries.filter((_, idx) => idx !== i))}
            placeholder="SaaS, FinTech, Logistics..."
          />

          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>
                Min Employees
              </label>
              <input
                type="number"
                value={compMin}
                onChange={(e) => setCompMin(e.target.value)}
                placeholder="50"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "1px solid var(--balboa-border-light)",
                  borderRadius: 8,
                  fontSize: 13,
                  background: "transparent",
                  color: "var(--balboa-text)",
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>
                Max Employees
              </label>
              <input
                type="number"
                value={compMax}
                onChange={(e) => setCompMax(e.target.value)}
                placeholder="1000"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "1px solid var(--balboa-border-light)",
                  borderRadius: 8,
                  fontSize: 13,
                  background: "transparent",
                  color: "var(--balboa-text)",
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>
              Geography
            </label>
            <input
              value={geography}
              onChange={(e) => setGeography(e.target.value)}
              placeholder="North America, LATAM..."
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid var(--balboa-border-light)",
                borderRadius: 8,
                fontSize: 13,
                background: "transparent",
                color: "var(--balboa-text)",
              }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>
              Additional Filters
            </label>
            <textarea
              value={additionalFilters}
              onChange={(e) => setAdditionalFilters(e.target.value)}
              placeholder="Series B+, uses Salesforce, recently hired VP Eng..."
              rows={2}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid var(--balboa-border-light)",
                borderRadius: 8,
                fontSize: 13,
                resize: "vertical",
                background: "transparent",
                color: "var(--balboa-text)",
              }}
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={!canGenerate || generating}
            style={{
              width: "100%",
              padding: "10px 16px",
              background: canGenerate ? "var(--balboa-navy)" : "var(--balboa-border-light)",
              color: canGenerate ? "white" : "var(--balboa-text-muted)",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: canGenerate ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "all 0.15s ease",
            }}
          >
            {generating ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles size={14} />
                Generate List
              </>
            )}
          </button>

          {generated && (
            <p style={{ fontSize: 11, color: "var(--balboa-text-muted)", marginTop: 10, textAlign: "center" }}>
              🤖 Agent integration ready — connect your scraping agent to automate this step
            </p>
          )}
        </div>
      </div>

      {/* ── Right: Generated Contacts ── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!generated && !generating && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: 400,
            color: "var(--balboa-text-muted)",
            textAlign: "center",
            padding: 40,
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 8 }}>
              Define Your Buyer Persona
            </h3>
            <p style={{ fontSize: 13, maxWidth: 320, lineHeight: 1.5 }}>
              Add job titles and industries to start building a targeted prospect list. Your colleague&apos;s agent can plug in here to automate scraping.
            </p>
          </div>
        )}

        {generating && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: 400,
            color: "var(--balboa-text-muted)",
          }}>
            <Loader2 size={32} className="animate-spin" style={{ color: "var(--balboa-blue)", marginBottom: 16 }} />
            <p style={{ fontSize: 14, fontWeight: 600 }}>Generating prospect list...</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>Searching for matching contacts</p>
          </div>
        )}

        {generated && contacts.length > 0 && (
          <div>
            {/* Bulk actions bar */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
              padding: "8px 12px",
              background: "rgba(30,42,94,0.03)",
              borderRadius: 8,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-navy)" }}>
                  {contacts.length} contacts found
                </span>
                {selectedCount > 0 && (
                  <span style={{ fontSize: 12, color: "var(--balboa-blue)" }}>
                    ({selectedCount} selected)
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => { /* placeholder for add to outreach queue */ }}
                  disabled={selectedCount === 0}
                  style={{
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    background: selectedCount > 0 ? "var(--balboa-blue)" : "var(--balboa-border-light)",
                    color: selectedCount > 0 ? "white" : "var(--balboa-text-muted)",
                    border: "none",
                    borderRadius: 6,
                    cursor: selectedCount > 0 ? "pointer" : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <UserPlus size={12} />
                  Add to Queue
                </button>
                <button
                  onClick={() => { /* placeholder for save list */ }}
                  style={{
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    background: "transparent",
                    color: "var(--balboa-navy)",
                    border: "1px solid var(--balboa-border-light)",
                    borderRadius: 6,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Download size={12} />
                  Save List
                </button>
              </div>
            </div>

            {/* Contacts table */}
            <div className="card" style={{ overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--balboa-border-light)" }}>
                    <th style={{ padding: "10px 12px", textAlign: "left", width: 32 }}>
                      <input
                        type="checkbox"
                        checked={contacts.length > 0 && contacts.every((c) => c.selected)}
                        onChange={toggleAll}
                        style={{ cursor: "pointer" }}
                      />
                    </th>
                    <th style={{ padding: "10px 8px", textAlign: "left", fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}>Name</th>
                    <th style={{ padding: "10px 8px", textAlign: "left", fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}>Title</th>
                    <th style={{ padding: "10px 8px", textAlign: "left", fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}>Company</th>
                    <th style={{ padding: "10px 8px", textAlign: "left", fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}>Industry</th>
                    <th style={{ padding: "10px 8px", textAlign: "right", fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}>Size</th>
                    <th style={{ padding: "10px 8px", textAlign: "center", fontWeight: 600, color: "var(--balboa-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}>ICP</th>
                    <th style={{ padding: "10px 8px", width: 60 }} />
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr
                      key={c.id}
                      style={{
                        borderBottom: "1px solid rgba(148,163,184,0.08)",
                        background: c.selected ? "rgba(30,42,94,0.03)" : "transparent",
                        transition: "background 0.1s ease",
                      }}
                    >
                      <td style={{ padding: "8px 12px" }}>
                        <input
                          type="checkbox"
                          checked={c.selected}
                          onChange={() => toggleSelect(c.id)}
                          style={{ cursor: "pointer" }}
                        />
                      </td>
                      <td style={{ padding: "8px", fontWeight: 600, color: "var(--balboa-navy)" }}>{c.name}</td>
                      <td style={{ padding: "8px", color: "var(--balboa-text-muted)" }}>{c.title}</td>
                      <td style={{ padding: "8px", color: "var(--balboa-text)" }}>{c.company}</td>
                      <td style={{ padding: "8px" }}>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: "rgba(30,42,94,0.06)",
                          color: "var(--balboa-navy)",
                        }}>
                          {c.industry}
                        </span>
                      </td>
                      <td style={{ padding: "8px", textAlign: "right", color: "var(--balboa-text-muted)" }}>
                        {c.employees.toLocaleString()}
                      </td>
                      <td style={{ padding: "8px", textAlign: "center" }}>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: icpColor(c.icpScore),
                        }}>
                          {c.icpScore}
                        </span>
                      </td>
                      <td style={{ padding: "8px", textAlign: "center" }}>
                        <button
                          onClick={() => toggleSelect(c.id)}
                          style={{
                            padding: "4px 8px",
                            fontSize: 11,
                            background: "transparent",
                            border: "1px solid var(--balboa-border-light)",
                            borderRadius: 4,
                            cursor: "pointer",
                            color: "var(--balboa-blue)",
                            fontWeight: 600,
                          }}
                        >
                          <Plus size={11} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
