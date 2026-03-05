"use client";

import { useState, useRef } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, Rocket, X } from "lucide-react";

interface RocketImportProps {
  onImportComplete?: (summary: ImportSummary) => void;
}

interface ImportSummary {
  total: number;
  created: number;
  updated: number;
  enrolled: number;
  sequenceId: string | null;
  errors: number;
}

export default function RocketImport({ onImportComplete }: RocketImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedLeads, setParsedLeads] = useState<Record<string, string>[]>([]);
  const [sequenceName, setSequenceName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "done">("upload");
  const fileRef = useRef<HTMLInputElement>(null);

  // Parse CSV
  function parseCSV(text: string): Record<string, string>[] {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/["\s]/g, "_"));
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((h, j) => {
        row[h] = values[j]?.trim() || "";
      });
      rows.push(row);
    }

    return rows;
  }

  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  // Handle file selection
  function handleFile(f: File) {
    setFile(f);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        // Try JSON first
        if (f.name.endsWith(".json")) {
          const data = JSON.parse(text);
          const leads = Array.isArray(data) ? data : data.leads || [];
          setParsedLeads(leads);
        } else {
          // CSV
          const leads = parseCSV(text);
          setParsedLeads(leads);
        }
        setStep("preview");
      } catch (err) {
        setError("Failed to parse file. Please check the format.");
        console.error("Parse error:", err);
      }
    };
    reader.readAsText(f);
  }

  // Handle drag & drop
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".csv") || f.name.endsWith(".json"))) {
      handleFile(f);
    } else {
      setError("Please upload a CSV or JSON file");
    }
  }

  // Map CSV columns to lead fields
  function mapLeadFromRow(row: Record<string, string>) {
    return {
      first_name: row.first_name || row.firstname || row.name?.split(" ")[0] || "",
      last_name: row.last_name || row.lastname || row.name?.split(" ").slice(1).join(" ") || "",
      email: row.email || row.email_address || "",
      company: row.company || row.company_name || row.organization || "",
      title: row.title || row.position || row.job_title || row.jobtitle || "",
      linkedin_url: row.linkedin_url || row.linkedin || row.linkedin_profile || "",
      phone: row.phone || row.phone_number || "",
      industry: row.industry || "",
      revenue: row.revenue || row.estimated_revenue || "",
      employee_count: row.employee_count || row.employees || row.company_size || "",
      sp_category: row.sp_category || row.strategic_priority || row.sp || "",
      bc_category: row.bc_category || row.business_challenge || row.bc || "",
      icp_score: row.icp_score || row.score || "",
      segment: row.segment || row.category || "",
      signal: row.signal || "",
      metric: row.metric || "",
      talking_point: row.talking_point || row.talkingpoint || "",
    };
  }

  // Import
  async function handleImport() {
    setImporting(true);
    setStep("importing");
    setError(null);

    try {
      const mappedLeads = parsedLeads.map(mapLeadFromRow);

      const response = await fetch("/api/rocket/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: mappedLeads,
          sequence: sequenceName ? {
            name: sequenceName,
            description: `Imported from Rocket on ${new Date().toLocaleDateString()}`,
          } : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Import failed");
      }

      setResult(data.summary);
      setStep("done");
      onImportComplete?.(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setStep("preview");
    }

    setImporting(false);
  }

  // Reset
  function reset() {
    setFile(null);
    setParsedLeads([]);
    setSequenceName("");
    setResult(null);
    setError(null);
    setStep("upload");
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Rocket size={18} style={{ color: "#DF7F40" }} />
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
          Rocket Import
        </h3>
      </div>

      {error && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          marginBottom: 16,
          borderRadius: 8,
          background: "rgba(239,68,68,0.1)",
          color: "#ef4444",
          fontSize: 13,
        }}>
          <AlertCircle size={14} />
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: "2px dashed var(--border-primary)",
            borderRadius: 12,
            padding: "40px 20px",
            textAlign: "center",
            cursor: "pointer",
            background: "var(--bg-secondary)",
            transition: "border-color 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#DF7F40")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-primary)")}
        >
          <Upload size={32} style={{ color: "var(--text-secondary)", marginBottom: 12 }} />
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
            Drop Rocket export here or click to browse
          </p>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
            Supports CSV and JSON files
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>
      )}

      {/* Step 2: Preview */}
      {step === "preview" && (
        <div>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            marginBottom: 16,
            borderRadius: 8,
            background: "rgba(59,91,219,0.1)",
          }}>
            <FileText size={14} style={{ color: "#3B5BDB" }} />
            <span style={{ fontSize: 13, color: "var(--text-primary)" }}>
              {file?.name} — {parsedLeads.length} leads found
            </span>
          </div>

          {/* Sequence name */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 4 }}>
              Sequence Name (optional — groups leads for tracking)
            </label>
            <input
              type="text"
              value={sequenceName}
              onChange={(e) => setSequenceName(e.target.value)}
              placeholder="e.g. Q1 Wholesale Distributors — SP Fill Rate"
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: 13,
                border: "1px solid var(--border-primary)",
                borderRadius: 6,
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {/* Preview table */}
          <div style={{ maxHeight: 250, overflowY: "auto", marginBottom: 16, borderRadius: 8, border: "1px solid var(--border-primary)" }}>
            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-tertiary)", position: "sticky", top: 0 }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500 }}>Name</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500 }}>Email</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500 }}>Company</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500 }}>Title</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500 }}>SP/BC</th>
                </tr>
              </thead>
              <tbody>
                {parsedLeads.slice(0, 20).map((row, i) => {
                  const mapped = mapLeadFromRow(row);
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border-primary)" }}>
                      <td style={{ padding: "6px 8px" }}>{mapped.first_name} {mapped.last_name}</td>
                      <td style={{ padding: "6px 8px" }}>{mapped.email}</td>
                      <td style={{ padding: "6px 8px" }}>{mapped.company}</td>
                      <td style={{ padding: "6px 8px" }}>{mapped.title}</td>
                      <td style={{ padding: "6px 8px" }}>
                        {mapped.sp_category && <span style={{ color: "#3B5BDB" }}>{mapped.sp_category}</span>}
                        {mapped.sp_category && mapped.bc_category && " / "}
                        {mapped.bc_category && <span style={{ color: "#DF7F40" }}>{mapped.bc_category}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {parsedLeads.length > 20 && (
              <div style={{ padding: "8px", textAlign: "center", fontSize: 11, color: "var(--text-secondary)" }}>
                ...and {parsedLeads.length - 20} more leads
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={reset}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                border: "1px solid var(--border-primary)",
                borderRadius: 6,
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={importing}
              style={{
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: 500,
                border: "none",
                borderRadius: 6,
                background: "#DF7F40",
                color: "#fff",
                cursor: "pointer",
                opacity: importing ? 0.6 : 1,
              }}
            >
              {importing ? "Importing..." : `Import ${parsedLeads.length} Leads`}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Importing */}
      {step === "importing" && (
        <div style={{ padding: 40, textAlign: "center" }}>
          <div className="animate-spin" style={{ width: 32, height: 32, border: "3px solid var(--border-primary)", borderTopColor: "#DF7F40", borderRadius: "50%", margin: "0 auto 16px" }} />
          <p style={{ fontSize: 14, color: "var(--text-primary)" }}>
            Importing {parsedLeads.length} leads...
          </p>
        </div>
      )}

      {/* Step 4: Done */}
      {step === "done" && result && (
        <div style={{
          padding: "24px",
          borderRadius: 12,
          background: "rgba(34,197,94,0.05)",
          border: "1px solid rgba(34,197,94,0.2)",
          textAlign: "center",
        }}>
          <CheckCircle size={32} style={{ color: "#22c55e", marginBottom: 12 }} />
          <h4 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
            Import Complete
          </h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>{result.total}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Total</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#22c55e" }}>{result.created}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Created</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#3B5BDB" }}>{result.updated}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Updated</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#DF7F40" }}>{result.enrolled}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Enrolled</div>
            </div>
          </div>
          {result.errors > 0 && (
            <p style={{ fontSize: 12, color: "#ef4444", marginBottom: 12 }}>
              {result.errors} leads had errors and were skipped
            </p>
          )}
          <button
            onClick={reset}
            style={{
              padding: "8px 20px",
              fontSize: 13,
              border: "1px solid var(--border-primary)",
              borderRadius: 6,
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              cursor: "pointer",
            }}
          >
            Import Another
          </button>
        </div>
      )}
    </div>
  );
}
