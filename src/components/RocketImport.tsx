"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowRight,
  RefreshCw,
  Table,
  Clock,
  Zap,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Database,
} from "lucide-react";
import { trackEventClient } from "@/lib/tracking";

// ─── Types ───────────────────────────────────────────────────────

interface RocketImportProps {
  userId?: string;
  onImportComplete?: (summary: {
    leads: number;
    sequences: number;
    errors: number;
  }) => void;
}

type Step = "upload" | "preview" | "importing" | "done";
type ViewMode = "import" | "history";

interface ColumnMapping {
  name: string | null;
  email: string | null;
  company: string | null;
  position: string | null;
  sequence: string | null;
  classification: string | null;
}

interface ImportResult {
  leads: number;
  sequences: number;
  errors: number;
  errorDetails: string[];
  skipped: number;
  qualityScore: { overall: number; pctWithEmail: number; pctWithCompany: number; pctWithLinkedin: number; pctWithClassification: number; pctWithPhone: number };
  importId: string | null;
  durationMs: number;
}

interface ImportHistoryRecord {
  id: string;
  filename: string;
  file_type: string;
  total_rows: number;
  created_count: number;
  updated_count: number;
  error_count: number;
  enrolled_count: number;
  sequence_name: string | null;
  quality_score: { overall: number; pctWithEmail: number; pctWithCompany: number };
  enrichment_status: string;
  enriched_count: number;
  source_platform: string | null;
  duration_ms: number;
  created_at: string;
}

interface ImportStats {
  totalImports: number;
  totalLeadsImported: number;
  totalCreated: number;
  totalUpdated: number;
  totalErrors: number;
  avgQualityScore: number;
}

type SourcePlatform = "sales_navigator" | "clay" | "apify" | "hubspot" | "manual" | "other";

// ─── Column detection aliases ────────────────────────────────────

const COLUMN_ALIASES: Record<keyof ColumnMapping, string[]> = {
  name: ["name", "full_name", "fullname", "contact_name", "contactname", "lead_name", "first_name", "firstname"],
  email: ["email", "email_address", "emailaddress", "e-mail", "contact_email"],
  company: ["company", "company_name", "companyname", "organization", "org", "account"],
  position: ["position", "title", "job_title", "jobtitle", "role", "designation"],
  sequence: ["sequence", "sequence_name", "sequencename", "campaign", "cadence", "workflow"],
  classification: ["classification", "sp", "bc", "sp_category", "bc_category", "strategic_priority", "business_challenge", "category", "segment", "type"],
};

const SOURCE_PLATFORMS: { value: SourcePlatform; label: string }[] = [
  { value: "sales_navigator", label: "Sales Navigator" },
  { value: "clay", label: "Clay" },
  { value: "apify", label: "Apify" },
  { value: "hubspot", label: "HubSpot Export" },
  { value: "manual", label: "Manual List" },
  { value: "other", label: "Other" },
];

// ─── Helpers ─────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/^["']|["']$/g, "").replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "")
  );
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = values[j] ?? ""; });
    rows.push(row);
  }
  return rows;
}

function parseJSON(text: string): Record<string, string>[] {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : data.leads ?? data.data ?? data.records ?? [];
  if (!Array.isArray(arr)) throw new Error("Could not find a leads array in the JSON file.");
  return arr.map((item: Record<string, unknown>) => {
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(item)) {
      row[k.toLowerCase().replace(/[\s-]+/g, "_")] = v != null ? String(v) : "";
    }
    return row;
  });
}

function detectColumns(headers: string[]): { mapping: ColumnMapping; detectedCount: number } {
  const mapping: ColumnMapping = { name: null, email: null, company: null, position: null, sequence: null, classification: null };
  let detectedCount = 0;
  const normalizedHeaders = headers.map((h) => h.toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, ""));
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [keyof ColumnMapping, string[]][]) {
    for (const alias of aliases) {
      const idx = normalizedHeaders.findIndex((h) => h === alias);
      if (idx !== -1 && mapping[field] === null) {
        mapping[field] = headers[idx];
        detectedCount++;
        break;
      }
    }
  }
  if (!mapping.name) {
    const hasFirst = normalizedHeaders.some((h) => ["first_name", "firstname"].includes(h));
    if (hasFirst) { mapping.name = "first_name+last_name"; detectedCount++; }
  }
  return { mapping, detectedCount };
}

function resolveValue(row: Record<string, string>, mappedHeader: string | null): string {
  if (!mappedHeader) return "";
  if (mappedHeader === "first_name+last_name") {
    const firstName = row["first_name"] || row["firstname"] || "";
    const lastName = row["last_name"] || row["lastname"] || "";
    return `${firstName} ${lastName}`.trim();
  }
  const normalized = mappedHeader.toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");
  return row[normalized] ?? row[mappedHeader] ?? "";
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ─── Component ───────────────────────────────────────────────────

export default function RocketImport({ userId, onImportComplete }: RocketImportProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("import");
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({ name: null, email: null, company: null, position: null, sequence: null, classification: null });
  const [detectedCount, setDetectedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [sourcePlatform, setSourcePlatform] = useState<SourcePlatform | "">("");
  const [enriching, setEnriching] = useState(false);

  // History state
  const [importHistory, setImportHistory] = useState<ImportHistoryRecord[]>([]);
  const [historyStats, setHistoryStats] = useState<ImportStats | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedImport, setExpandedImport] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load import history ─────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/rocket/imports?limit=20");
      if (res.ok) {
        const data = await res.json();
        setImportHistory(data.imports || []);
        setHistoryStats(data.stats || null);
      }
    } catch (err) {
      console.error("Failed to load import history:", err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === "history") loadHistory();
  }, [viewMode, loadHistory]);

  // ── File handling ──────────────────────────────────────────────
  const processFile = useCallback((f: File) => {
    setFile(f);
    setError(null);
    const isCSV = f.name.toLowerCase().endsWith(".csv");
    const isJSON = f.name.toLowerCase().endsWith(".json");
    if (!isCSV && !isJSON) {
      setError("Unsupported file type. Please upload a .csv or .json file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const parsed = isJSON ? parseJSON(text) : parseCSV(text);
        if (parsed.length === 0) { setError("No data rows found in the file."); return; }
        const detectedHeaders = Object.keys(parsed[0]);
        setHeaders(detectedHeaders);
        setRows(parsed);
        const { mapping, detectedCount: count } = detectColumns(detectedHeaders);
        setColumnMapping(mapping);
        setDetectedCount(count);
        setStep("preview");
      } catch (err) {
        setError(err instanceof Error ? `Parse error: ${err.message}` : "Failed to parse file.");
      }
    };
    reader.onerror = () => setError("Failed to read the file.");
    reader.readAsText(f);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) processFile(droppedFile);
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) processFile(selected);
  }, [processFile]);

  const updateMapping = useCallback((field: keyof ColumnMapping, header: string) => {
    setColumnMapping((prev) => {
      const next = { ...prev, [field]: header || null };
      setDetectedCount(Object.values(next).filter(Boolean).length);
      return next;
    });
  }, []);

  // ── Import ─────────────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    setStep("importing");
    setProgress(0);
    setProcessedCount(0);
    setError(null);

    try {
      const mappedLeads = rows.map((row) => {
        const nameValue = resolveValue(row, columnMapping.name);
        const nameParts = nameValue.split(" ");
        return {
          first_name: nameParts[0] || "",
          last_name: nameParts.slice(1).join(" ") || "",
          email: resolveValue(row, columnMapping.email),
          company: resolveValue(row, columnMapping.company),
          title: resolveValue(row, columnMapping.position),
          sp_category: resolveValue(row, columnMapping.classification),
          sequence_name: resolveValue(row, columnMapping.sequence),
          ...row,
        };
      });

      const sequenceNames = [...new Set(mappedLeads.map((l) => l.sequence_name).filter((s) => s && s.trim() !== ""))];
      const sequenceInfo = sequenceNames.length > 0
        ? {
            name: sequenceNames.length === 1 ? sequenceNames[0] : `Rocket Import ${new Date().toISOString().split("T")[0]}`,
            description: `Imported ${mappedLeads.length} leads from Rocket on ${new Date().toLocaleDateString()}`,
          }
        : undefined;

      const progressInterval = setInterval(() => {
        setProgress((prev) => prev >= 90 ? prev : Math.min(prev + Math.random() * 15 + 5, 90));
        setProcessedCount((prev) => Math.min(prev + Math.floor(Math.random() * 3 + 1), rows.length - 1));
      }, 300);

      const response = await fetch("/api/rocket/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: mappedLeads,
          sequence: sequenceInfo,
          userId,
          filename: file?.name || "unknown.csv",
          fileType: file?.name?.split(".").pop() || "csv",
          columnMapping,
          sourcePlatform: sourcePlatform || null,
        }),
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Import failed with status ${response.status}`);
      }

      const data = await response.json();
      setProgress(100);
      setProcessedCount(rows.length);

      const result: ImportResult = {
        leads: (data.summary?.created ?? 0) + (data.summary?.updated ?? 0),
        sequences: data.summary?.enrolled ?? 0,
        errors: data.summary?.errors ?? 0,
        errorDetails: data.errors ?? [],
        skipped: data.summary?.skipped ?? 0,
        qualityScore: data.summary?.qualityScore ?? { overall: 0 },
        importId: data.summary?.importId ?? null,
        durationMs: data.summary?.durationMs ?? 0,
      };

      await new Promise((resolve) => setTimeout(resolve, 500));
      setImportResult(result);
      setStep("done");

      trackEventClient({
        eventCategory: "lead",
        eventAction: "csv_imported",
        numericValue: result.leads,
        metadata: { step: "ui_completed", importId: result.importId },
        source: "frontend",
      });

      onImportComplete?.({ leads: result.leads, sequences: result.sequences, errors: result.errors });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed. Please try again.");
      setStep("preview");
    }
  }, [rows, columnMapping, userId, onImportComplete, file, sourcePlatform]);

  // ── AI Enrichment ──────────────────────────────────────────────
  const handleEnrich = useCallback(async (importId: string) => {
    setEnriching(true);
    try {
      const res = await fetch("/api/rocket/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importId }),
      });
      if (res.ok) {
        const data = await res.json();
        // Refresh history to show updated enrichment status
        loadHistory();
        return data;
      }
    } catch (err) {
      console.error("Enrichment failed:", err);
    } finally {
      setEnriching(false);
    }
  }, [loadHistory]);

  // ── Reset ──────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setStep("upload"); setFile(null); setRows([]); setHeaders([]);
    setColumnMapping({ name: null, email: null, company: null, position: null, sequence: null, classification: null });
    setDetectedCount(0); setError(null); setIsDragOver(false);
    setProgress(0); setProcessedCount(0); setImportResult(null); setSourcePlatform("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // ── Render helpers ─────────────────────────────────────────────
  const previewRows = rows.slice(0, 5);
  const mappingFields: { key: keyof ColumnMapping; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "company", label: "Company" },
    { key: "position", label: "Position" },
    { key: "sequence", label: "Sequence" },
    { key: "classification", label: "Classification (SP/BC)" },
  ];

  const qualityColor = (pct: number) => pct >= 80 ? "text-green-600" : pct >= 50 ? "text-amber-600" : "text-red-500";
  const qualityBg = (pct: number) => pct >= 80 ? "bg-green-50 border-green-100" : pct >= 50 ? "bg-amber-50 border-amber-100" : "bg-red-50 border-red-100";

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Header with view toggle */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "#151B42" }}>Rocket Import</h2>
          <p className="text-sm text-gray-500 mt-1">Import, enrich, and track your prospect lists</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode("import")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === "import" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            <Upload size={12} className="inline mr-1" />
            Import
          </button>
          <button
            onClick={() => setViewMode("history")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === "history" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            <Clock size={12} className="inline mr-1" />
            History
          </button>
        </div>
      </div>

      {/* ── HISTORY VIEW ──────────────────────────────────────────── */}
      {viewMode === "history" && (
        <div>
          {/* Stats bar */}
          {historyStats && historyStats.totalImports > 0 && (
            <div className="grid grid-cols-4 gap-3 mb-5">
              {[
                { label: "Imports", value: historyStats.totalImports, icon: <Database size={14} /> },
                { label: "Leads Added", value: historyStats.totalLeadsImported, icon: <Upload size={14} /> },
                { label: "Avg Quality", value: `${historyStats.avgQualityScore}%`, icon: <BarChart3 size={14} /> },
                { label: "Error Rate", value: historyStats.totalLeadsImported > 0 ? `${Math.round((historyStats.totalErrors / historyStats.totalLeadsImported) * 100)}%` : "0%", icon: <AlertCircle size={14} /> },
              ].map((stat) => (
                <div key={stat.label} className="px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="flex items-center gap-1.5 text-gray-400 mb-1">{stat.icon}<span className="text-[10px] uppercase tracking-wide">{stat.label}</span></div>
                  <div className="text-lg font-bold" style={{ color: "#151B42" }}>{stat.value}</div>
                </div>
              ))}
            </div>
          )}

          {loadingHistory ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={20} className="animate-spin text-gray-400" />
            </div>
          ) : importHistory.length === 0 ? (
            <div className="text-center py-12">
              <Database size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-500">No imports yet</p>
              <button onClick={() => setViewMode("import")} className="mt-3 text-sm font-medium" style={{ color: "#3B5BDB" }}>Start your first import</button>
            </div>
          ) : (
            <div className="space-y-2">
              {importHistory.map((imp) => (
                <div key={imp.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedImport(expandedImport === imp.id ? null : imp.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    <FileText size={16} className="text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800 truncate">{imp.filename}</span>
                        {imp.source_platform && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">{imp.source_platform}</span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          imp.enrichment_status === "completed" ? "bg-green-50 text-green-600" :
                          imp.enrichment_status === "in_progress" ? "bg-amber-50 text-amber-600" :
                          "bg-gray-100 text-gray-500"
                        }`}>
                          {imp.enrichment_status === "completed" ? `${imp.enriched_count} enriched` :
                           imp.enrichment_status === "in_progress" ? "enriching..." : "not enriched"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                        <span>{imp.created_count + imp.updated_count} leads</span>
                        <span>{imp.enrolled_count} enrolled</span>
                        <span className={qualityColor(imp.quality_score?.overall || 0)}>Q: {imp.quality_score?.overall || 0}%</span>
                        <span>{timeAgo(imp.created_at)}</span>
                      </div>
                    </div>
                    {expandedImport === imp.id ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                  </button>

                  {expandedImport === imp.id && (
                    <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50/50">
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className={`px-3 py-2 rounded-lg border ${qualityBg(imp.quality_score?.pctWithEmail || 0)}`}>
                          <div className="text-[10px] text-gray-500 uppercase tracking-wide">Email %</div>
                          <div className={`text-sm font-bold ${qualityColor(imp.quality_score?.pctWithEmail || 0)}`}>{imp.quality_score?.pctWithEmail || 0}%</div>
                        </div>
                        <div className={`px-3 py-2 rounded-lg border ${qualityBg(imp.quality_score?.pctWithCompany || 0)}`}>
                          <div className="text-[10px] text-gray-500 uppercase tracking-wide">Company %</div>
                          <div className={`text-sm font-bold ${qualityColor(imp.quality_score?.pctWithCompany || 0)}`}>{imp.quality_score?.pctWithCompany || 0}%</div>
                        </div>
                        <div className="px-3 py-2 rounded-lg border bg-gray-50 border-gray-100">
                          <div className="text-[10px] text-gray-500 uppercase tracking-wide">Duration</div>
                          <div className="text-sm font-bold text-gray-700">{imp.duration_ms ? `${(imp.duration_ms / 1000).toFixed(1)}s` : "—"}</div>
                        </div>
                      </div>
                      {imp.error_count > 0 && (
                        <p className="text-xs text-red-500 mb-2">{imp.error_count} error{imp.error_count !== 1 ? "s" : ""} during import</p>
                      )}
                      {imp.enrichment_status === "pending" && (
                        <button
                          onClick={() => handleEnrich(imp.id)}
                          disabled={enriching}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-md transition-all hover:opacity-90 disabled:opacity-50"
                          style={{ backgroundColor: "#DF7F40" }}
                        >
                          {enriching ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                          AI Enrich Leads
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── IMPORT VIEW ───────────────────────────────────────────── */}
      {viewMode === "import" && (
        <>
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6 text-xs">
            {([
              { key: "upload" as Step, label: "Upload" },
              { key: "preview" as Step, label: "Preview" },
              { key: "importing" as Step, label: "Import" },
              { key: "done" as Step, label: "Summary" },
            ]).map((s, i, arr) => {
              const stepOrder: Step[] = ["upload", "preview", "importing", "done"];
              const currentIdx = stepOrder.indexOf(step);
              const thisIdx = stepOrder.indexOf(s.key);
              const isActive = thisIdx === currentIdx;
              const isCompleted = thisIdx < currentIdx;
              return (
                <React.Fragment key={s.key}>
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${isCompleted ? "bg-green-500 text-white" : isActive ? "text-white" : "bg-gray-200 text-gray-500"}`}
                      style={isActive ? { backgroundColor: "#3B5BDB" } : undefined}
                    >
                      {isCompleted ? <CheckCircle2 size={14} /> : i + 1}
                    </div>
                    <span className={`${isActive ? "font-medium text-gray-900" : isCompleted ? "text-green-600" : "text-gray-400"}`}>{s.label}</span>
                  </div>
                  {i < arr.length - 1 && <div className={`flex-1 h-px ${isCompleted ? "bg-green-300" : "bg-gray-200"}`} />}
                </React.Fragment>
              );
            })}
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="flex-shrink-0 p-0.5 hover:bg-red-100 rounded"><X size={14} /></button>
            </div>
          )}

          {/* Step 1: Upload */}
          {step === "upload" && (
            <div>
              {/* Source platform selector */}
              <div className="mb-4">
                <label className="text-xs text-gray-500 font-medium mb-1.5 block">Source Platform (optional)</label>
                <div className="flex flex-wrap gap-1.5">
                  {SOURCE_PLATFORMS.map((sp) => (
                    <button
                      key={sp.value}
                      onClick={() => setSourcePlatform(sourcePlatform === sp.value ? "" : sp.value)}
                      className={`px-3 py-1.5 text-xs rounded-full border transition-all ${sourcePlatform === sp.value ? "border-[#3B5BDB] bg-blue-50 text-[#3B5BDB] font-medium" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
                    >
                      {sp.label}
                    </button>
                  ))}
                </div>
              </div>

              <div
                role="button" tabIndex={0}
                onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
                className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 cursor-pointer transition-all duration-200 ${isDragOver ? "border-[#3B5BDB] bg-blue-50" : "border-gray-300 bg-gray-50 hover:border-[#DF7F40] hover:bg-orange-50/30"}`}
              >
                <Upload size={40} className={`mb-3 ${isDragOver ? "text-[#3B5BDB]" : "text-gray-400"}`} />
                <p className="text-sm font-medium text-gray-700 mb-1">Drop your file here, or click to browse</p>
                <p className="text-xs text-gray-400">Accepts .csv and .json files</p>
                <input ref={fileInputRef} type="file" accept=".csv,.json" onChange={handleFileInput} className="hidden" aria-label="Upload CSV or JSON file" />
              </div>

              {file && (
                <div className="flex items-center gap-3 mt-4 px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
                  <FileText size={18} className="text-gray-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                    <p className="text-xs text-gray-400">{formatFileSize(file.size)}</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setFile(null); setError(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="p-1 hover:bg-gray-200 rounded">
                    <X size={14} className="text-gray-400" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Preview */}
          {step === "preview" && (
            <div>
              <div className="flex items-center gap-3 px-4 py-3 mb-4 rounded-lg bg-blue-50 border border-blue-100">
                <FileText size={16} style={{ color: "#3B5BDB" }} />
                <span className="text-sm text-gray-700">
                  <span className="font-medium">{file?.name}</span>{" \u2014 "}{rows.length} lead{rows.length !== 1 ? "s" : ""} found
                  {sourcePlatform && <span className="ml-2 text-xs text-blue-600">from {SOURCE_PLATFORMS.find(s => s.value === sourcePlatform)?.label}</span>}
                </span>
              </div>

              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Table size={14} style={{ color: "#151B42" }} />
                  <h3 className="text-sm font-semibold" style={{ color: "#151B42" }}>Column Mapping</h3>
                  <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: detectedCount >= 4 ? "rgba(34,197,94,0.1)" : "rgba(223,127,64,0.1)", color: detectedCount >= 4 ? "#16a34a" : "#DF7F40" }}>
                    {detectedCount} of {mappingFields.length} detected
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {mappingFields.map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 w-28 flex-shrink-0">{label}</label>
                      <select
                        value={columnMapping[key] ?? ""}
                        onChange={(e) => updateMapping(key, e.target.value)}
                        className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#3B5BDB] focus:border-[#3B5BDB]"
                      >
                        <option value="">-- Not mapped --</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                      {columnMapping[key] && <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <h3 className="text-sm font-semibold mb-2" style={{ color: "#151B42" }}>Preview (first {previewRows.length} rows)</h3>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-100">
                        {headers.slice(0, 8).map((h) => <th key={h} className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">{h}</th>)}
                        {headers.length > 8 && <th className="text-left px-3 py-2 font-medium text-gray-400">+{headers.length - 8} more</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                          {headers.slice(0, 8).map((h) => <td key={h} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[200px] truncate">{row[h] || "\u2014"}</td>)}
                          {headers.length > 8 && <td className="px-3 py-2 text-gray-400">&hellip;</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button onClick={reset} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                  <X size={14} />Cancel
                </button>
                <button
                  onClick={handleImport}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ backgroundColor: "#3B5BDB" }}
                >
                  Import {rows.length} Lead{rows.length !== 1 ? "s" : ""}<ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Importing */}
          {step === "importing" && (
            <div className="py-10 text-center">
              <div className="flex items-center justify-center mb-4">
                <RefreshCw size={28} className="animate-spin" style={{ color: "#3B5BDB" }} />
              </div>
              <p className="text-sm font-medium mb-1" style={{ color: "#151B42" }}>Importing leads...</p>
              <p className="text-xs text-gray-400 mb-6">{processedCount} of {rows.length} leads processed</p>
              <div className="w-full max-w-sm mx-auto">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">Progress</span>
                  <span className="text-xs font-medium" style={{ color: "#3B5BDB" }}>{Math.round(progress)}%</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%`, backgroundColor: "#3B5BDB" }} />
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Summary */}
          {step === "done" && importResult && (
            <div className="py-6">
              <div className="flex items-center justify-center mb-3">
                <CheckCircle2 size={40} className="text-green-500" />
              </div>
              <h3 className="text-lg font-semibold mb-1 text-center" style={{ color: "#151B42" }}>Import Complete</h3>
              <p className="text-sm text-gray-500 mb-6 text-center">
                {importResult.leads} leads imported in {(importResult.durationMs / 1000).toFixed(1)}s
                {importResult.skipped > 0 && <span className="text-amber-500"> ({importResult.skipped} skipped)</span>}
              </p>

              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-3 max-w-lg mx-auto mb-5">
                <div className="px-3 py-2.5 rounded-lg bg-green-50 border border-green-100 text-center">
                  <div className="text-xl font-bold text-green-600">{importResult.leads}</div>
                  <div className="text-[10px] text-green-700 mt-0.5">Leads</div>
                </div>
                <div className="px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-100 text-center">
                  <div className="text-xl font-bold" style={{ color: "#3B5BDB" }}>{importResult.sequences}</div>
                  <div className="text-[10px] text-blue-700 mt-0.5">Enrolled</div>
                </div>
                <div className={`px-3 py-2.5 rounded-lg border text-center ${qualityBg(importResult.qualityScore.overall)}`}>
                  <div className={`text-xl font-bold ${qualityColor(importResult.qualityScore.overall)}`}>{importResult.qualityScore.overall}%</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">Quality</div>
                </div>
                <div className={`px-3 py-2.5 rounded-lg border text-center ${importResult.errors > 0 ? "bg-red-50 border-red-100" : "bg-gray-50 border-gray-100"}`}>
                  <div className={`text-xl font-bold ${importResult.errors > 0 ? "text-red-500" : "text-gray-400"}`}>{importResult.errors}</div>
                  <div className={`text-[10px] mt-0.5 ${importResult.errors > 0 ? "text-red-600" : "text-gray-400"}`}>Errors</div>
                </div>
              </div>

              {/* Quality breakdown */}
              {importResult.qualityScore.overall > 0 && (
                <div className="max-w-lg mx-auto mb-5 px-4 py-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex items-center gap-1.5 mb-2">
                    <BarChart3 size={12} className="text-gray-400" />
                    <span className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">Data Quality Breakdown</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    {[
                      { label: "Email", pct: importResult.qualityScore.pctWithEmail },
                      { label: "Company", pct: importResult.qualityScore.pctWithCompany },
                      { label: "LinkedIn", pct: importResult.qualityScore.pctWithLinkedin },
                      { label: "Class.", pct: importResult.qualityScore.pctWithClassification },
                      { label: "Phone", pct: importResult.qualityScore.pctWithPhone },
                    ].map((item) => (
                      <div key={item.label}>
                        <div className={`text-sm font-bold ${qualityColor(item.pct)}`}>{item.pct}%</div>
                        <div className="text-[10px] text-gray-400">{item.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error details */}
              {importResult.errorDetails.length > 0 && (
                <div className="max-w-lg mx-auto mb-5 text-left">
                  <div className="px-3 py-2 bg-red-50 rounded-lg border border-red-100">
                    <p className="text-xs font-medium text-red-700 mb-1">Error Details</p>
                    {importResult.errorDetails.slice(0, 5).map((detail, i) => <p key={i} className="text-xs text-red-600 truncate">{detail}</p>)}
                    {importResult.errorDetails.length > 5 && <p className="text-xs text-red-400 mt-1">...and {importResult.errorDetails.length - 5} more</p>}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-center gap-3">
                {importResult.importId && (
                  <button
                    onClick={() => handleEnrich(importResult.importId!)}
                    disabled={enriching}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                    style={{ backgroundColor: "#DF7F40" }}
                  >
                    {enriching ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                    AI Enrich Leads
                  </button>
                )}
                <button
                  onClick={reset}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ backgroundColor: "#3B5BDB" }}
                >
                  <RefreshCw size={14} />New Import
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
