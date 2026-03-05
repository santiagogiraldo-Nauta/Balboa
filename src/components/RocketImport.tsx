"use client";

import React, { useState, useCallback, useRef } from "react";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowRight,
  RefreshCw,
  Table,
} from "lucide-react";

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
}

// ─── Column detection aliases ────────────────────────────────────

const COLUMN_ALIASES: Record<keyof ColumnMapping, string[]> = {
  name: [
    "name",
    "full_name",
    "fullname",
    "contact_name",
    "contactname",
    "lead_name",
    "first_name",
    "firstname",
  ],
  email: [
    "email",
    "email_address",
    "emailaddress",
    "e-mail",
    "contact_email",
  ],
  company: [
    "company",
    "company_name",
    "companyname",
    "organization",
    "org",
    "account",
  ],
  position: [
    "position",
    "title",
    "job_title",
    "jobtitle",
    "role",
    "designation",
  ],
  sequence: [
    "sequence",
    "sequence_name",
    "sequencename",
    "campaign",
    "cadence",
    "workflow",
  ],
  classification: [
    "classification",
    "sp",
    "bc",
    "sp_category",
    "bc_category",
    "strategic_priority",
    "business_challenge",
    "category",
    "segment",
    "type",
  ],
};

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
    h
      .toLowerCase()
      .replace(/^["']|["']$/g, "")
      .replace(/[\s-]+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
  );

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = values[j] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function parseJSON(text: string): Record<string, string>[] {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : data.leads ?? data.data ?? data.records ?? [];
  if (!Array.isArray(arr)) {
    throw new Error("Could not find a leads array in the JSON file.");
  }
  return arr.map((item: Record<string, unknown>) => {
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(item)) {
      row[k.toLowerCase().replace(/[\s-]+/g, "_")] =
        v != null ? String(v) : "";
    }
    return row;
  });
}

function detectColumns(
  headers: string[]
): { mapping: ColumnMapping; detectedCount: number } {
  const mapping: ColumnMapping = {
    name: null,
    email: null,
    company: null,
    position: null,
    sequence: null,
    classification: null,
  };

  let detectedCount = 0;
  const normalizedHeaders = headers.map((h) =>
    h.toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "")
  );

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [
    keyof ColumnMapping,
    string[],
  ][]) {
    for (const alias of aliases) {
      const idx = normalizedHeaders.findIndex((h) => h === alias);
      if (idx !== -1 && mapping[field] === null) {
        mapping[field] = headers[idx];
        detectedCount++;
        break;
      }
    }
  }

  // Fallback: if no name found, check for first_name + last_name combo
  if (!mapping.name) {
    const hasFirst = normalizedHeaders.some((h) =>
      ["first_name", "firstname"].includes(h)
    );
    const hasLast = normalizedHeaders.some((h) =>
      ["last_name", "lastname"].includes(h)
    );
    if (hasFirst || hasLast) {
      mapping.name = hasFirst ? "first_name+last_name" : null;
      if (hasFirst) detectedCount++;
    }
  }

  return { mapping, detectedCount };
}

function resolveValue(
  row: Record<string, string>,
  mappedHeader: string | null
): string {
  if (!mappedHeader) return "";

  // Handle composite name field
  if (mappedHeader === "first_name+last_name") {
    const firstName =
      row["first_name"] || row["firstname"] || "";
    const lastName =
      row["last_name"] || row["lastname"] || "";
    return `${firstName} ${lastName}`.trim();
  }

  const normalized = mappedHeader
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  return row[normalized] ?? row[mappedHeader] ?? "";
}

// ─── Component ───────────────────────────────────────────────────

export default function RocketImport({
  userId,
  onImportComplete,
}: RocketImportProps) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    name: null,
    email: null,
    company: null,
    position: null,
    sequence: null,
    classification: null,
  });
  const [detectedCount, setDetectedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
        let parsed: Record<string, string>[];
        if (isJSON) {
          parsed = parseJSON(text);
        } else {
          parsed = parseCSV(text);
        }

        if (parsed.length === 0) {
          setError("No data rows found in the file.");
          return;
        }

        const detectedHeaders = Object.keys(parsed[0]);
        setHeaders(detectedHeaders);
        setRows(parsed);

        const { mapping, detectedCount: count } =
          detectColumns(detectedHeaders);
        setColumnMapping(mapping);
        setDetectedCount(count);
        setStep("preview");
      } catch (err) {
        setError(
          err instanceof Error
            ? `Parse error: ${err.message}`
            : "Failed to parse file. Check the format and try again."
        );
      }
    };
    reader.onerror = () => {
      setError("Failed to read the file. Please try again.");
    };
    reader.readAsText(f);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        processFile(droppedFile);
      }
    },
    [processFile]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    },
    []
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    },
    []
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) {
        processFile(selected);
      }
    },
    [processFile]
  );

  // ── Column mapping update ─────────────────────────────────────

  const updateMapping = useCallback(
    (field: keyof ColumnMapping, header: string) => {
      setColumnMapping((prev) => {
        const next = { ...prev, [field]: header || null };
        const count = Object.values(next).filter(Boolean).length;
        setDetectedCount(count);
        return next;
      });
    },
    []
  );

  // ── Import ─────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    setStep("importing");
    setProgress(0);
    setProcessedCount(0);
    setError(null);

    try {
      // Map rows to lead objects using the column mapping
      const mappedLeads = rows.map((row) => {
        const nameValue = resolveValue(row, columnMapping.name);
        const nameParts = nameValue.split(" ");
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";

        return {
          first_name: firstName,
          last_name: lastName,
          email: resolveValue(row, columnMapping.email),
          company: resolveValue(row, columnMapping.company),
          title: resolveValue(row, columnMapping.position),
          sp_category: resolveValue(row, columnMapping.classification),
          sequence_name: resolveValue(row, columnMapping.sequence),
          // Pass along all raw fields for additional data preservation
          ...row,
        };
      });

      // Determine sequence info from mapped data
      const sequenceNames = [
        ...new Set(
          mappedLeads
            .map((l) => l.sequence_name)
            .filter((s) => s && s.trim() !== "")
        ),
      ];

      const sequenceInfo =
        sequenceNames.length > 0
          ? {
              name:
                sequenceNames.length === 1
                  ? sequenceNames[0]
                  : `Rocket Import ${new Date().toISOString().split("T")[0]}`,
              description: `Imported ${mappedLeads.length} leads from Rocket on ${new Date().toLocaleDateString()}`,
            }
          : undefined;

      // Simulate progress for UX (the API call is a single POST)
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return prev;
          const increment = Math.random() * 15 + 5;
          return Math.min(prev + increment, 90);
        });
        setProcessedCount((prev) =>
          Math.min(prev + Math.floor(Math.random() * 3 + 1), rows.length - 1)
        );
      }, 300);

      const response = await fetch("/api/rocket/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: mappedLeads,
          sequence: sequenceInfo,
          userId,
        }),
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          errData.error || `Import failed with status ${response.status}`
        );
      }

      const data = await response.json();

      setProgress(100);
      setProcessedCount(rows.length);

      const result: ImportResult = {
        leads: (data.summary?.created ?? 0) + (data.summary?.updated ?? 0),
        sequences: data.summary?.enrolled ?? 0,
        errors: data.summary?.errors ?? 0,
        errorDetails: data.errors ?? [],
      };

      // Brief pause at 100% before showing summary
      await new Promise((resolve) => setTimeout(resolve, 500));

      setImportResult(result);
      setStep("done");

      onImportComplete?.({
        leads: result.leads,
        sequences: result.sequences,
        errors: result.errors,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Import failed. Please try again."
      );
      setStep("preview");
    }
  }, [rows, columnMapping, userId, onImportComplete]);

  // ── Reset ──────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setStep("upload");
    setFile(null);
    setRows([]);
    setHeaders([]);
    setColumnMapping({
      name: null,
      email: null,
      company: null,
      position: null,
      sequence: null,
      classification: null,
    });
    setDetectedCount(0);
    setError(null);
    setIsDragOver(false);
    setProgress(0);
    setProcessedCount(0);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  // ── Render ─────────────────────────────────────────────────────

  const previewRows = rows.slice(0, 5);
  const mappingFields: { key: keyof ColumnMapping; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "company", label: "Company" },
    { key: "position", label: "Position" },
    { key: "sequence", label: "Sequence" },
    { key: "classification", label: "Classification (SP/BC)" },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2
          className="text-lg font-semibold"
          style={{ color: "#151B42" }}
        >
          Rocket Import
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Import leads from a Rocket CSV or JSON export
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6 text-xs">
        {(
          [
            { key: "upload", label: "Upload" },
            { key: "preview", label: "Preview" },
            { key: "importing", label: "Import" },
            { key: "done", label: "Summary" },
          ] as { key: Step; label: string }[]
        ).map((s, i, arr) => {
          const stepOrder: Step[] = ["upload", "preview", "importing", "done"];
          const currentIdx = stepOrder.indexOf(step);
          const thisIdx = stepOrder.indexOf(s.key);
          const isActive = thisIdx === currentIdx;
          const isCompleted = thisIdx < currentIdx;

          return (
            <React.Fragment key={s.key}>
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    isCompleted
                      ? "bg-green-500 text-white"
                      : isActive
                        ? "text-white"
                        : "bg-gray-200 text-gray-500"
                  }`}
                  style={
                    isActive
                      ? { backgroundColor: "#3B5BDB" }
                      : undefined
                  }
                >
                  {isCompleted ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={`${
                    isActive
                      ? "font-medium text-gray-900"
                      : isCompleted
                        ? "text-green-600"
                        : "text-gray-400"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < arr.length - 1 && (
                <div
                  className={`flex-1 h-px ${
                    isCompleted ? "bg-green-300" : "bg-gray-200"
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="flex-shrink-0 p-0.5 hover:bg-red-100 rounded"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Step 1: File Upload ─────────────────────────────────── */}
      {step === "upload" && (
        <div>
          <div
            role="button"
            tabIndex={0}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`
              relative flex flex-col items-center justify-center
              rounded-xl border-2 border-dashed p-12 cursor-pointer
              transition-all duration-200
              ${
                isDragOver
                  ? "border-[#3B5BDB] bg-blue-50"
                  : "border-gray-300 bg-gray-50 hover:border-[#DF7F40] hover:bg-orange-50/30"
              }
            `}
          >
            <Upload
              size={40}
              className={`mb-3 ${
                isDragOver ? "text-[#3B5BDB]" : "text-gray-400"
              }`}
            />
            <p className="text-sm font-medium text-gray-700 mb-1">
              Drop your file here, or click to browse
            </p>
            <p className="text-xs text-gray-400">
              Accepts .csv and .json files
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json"
              onChange={handleFileInput}
              className="hidden"
              aria-label="Upload CSV or JSON file"
            />
          </div>

          {file && (
            <div className="flex items-center gap-3 mt-4 px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
              <FileText size={18} className="text-gray-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {file.name}
                </p>
                <p className="text-xs text-gray-400">
                  {formatFileSize(file.size)}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  setError(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="p-1 hover:bg-gray-200 rounded"
              >
                <X size={14} className="text-gray-400" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Preview & Column Mapping ────────────────────── */}
      {step === "preview" && (
        <div>
          {/* File info */}
          <div className="flex items-center gap-3 px-4 py-3 mb-4 rounded-lg bg-blue-50 border border-blue-100">
            <FileText size={16} style={{ color: "#3B5BDB" }} />
            <span className="text-sm text-gray-700">
              <span className="font-medium">{file?.name}</span>
              {" \u2014 "}
              {rows.length} lead{rows.length !== 1 ? "s" : ""} found
            </span>
          </div>

          {/* Column mapping */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Table size={14} style={{ color: "#151B42" }} />
              <h3
                className="text-sm font-semibold"
                style={{ color: "#151B42" }}
              >
                Column Mapping
              </h3>
              <span
                className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor:
                    detectedCount >= 4
                      ? "rgba(34,197,94,0.1)"
                      : "rgba(223,127,64,0.1)",
                  color: detectedCount >= 4 ? "#16a34a" : "#DF7F40",
                }}
              >
                {detectedCount} of {mappingFields.length} detected
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {mappingFields.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 w-28 flex-shrink-0">
                    {label}
                  </label>
                  <select
                    value={columnMapping[key] ?? ""}
                    onChange={(e) => updateMapping(key, e.target.value)}
                    className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#3B5BDB] focus:border-[#3B5BDB]"
                  >
                    <option value="">-- Not mapped --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                  {columnMapping[key] && (
                    <CheckCircle2
                      size={14}
                      className="text-green-500 flex-shrink-0"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Preview table */}
          <div className="mb-4">
            <h3
              className="text-sm font-semibold mb-2"
              style={{ color: "#151B42" }}
            >
              Preview (first {previewRows.length} rows)
            </h3>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-100">
                    {headers.slice(0, 8).map((h) => (
                      <th
                        key={h}
                        className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                    {headers.length > 8 && (
                      <th className="text-left px-3 py-2 font-medium text-gray-400">
                        +{headers.length - 8} more
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr
                      key={i}
                      className="border-t border-gray-100 hover:bg-gray-50"
                    >
                      {headers.slice(0, 8).map((h) => (
                        <td
                          key={h}
                          className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[200px] truncate"
                        >
                          {row[h] || "\u2014"}
                        </td>
                      ))}
                      {headers.length > 8 && (
                        <td className="px-3 py-2 text-gray-400">&hellip;</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={reset}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <X size={14} />
              Cancel
            </button>
            <button
              onClick={handleImport}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ backgroundColor: "#3B5BDB" }}
            >
              Import {rows.length} Lead{rows.length !== 1 ? "s" : ""}
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Import Progress ─────────────────────────────── */}
      {step === "importing" && (
        <div className="py-10 text-center">
          <div className="flex items-center justify-center mb-4">
            <RefreshCw
              size={28}
              className="animate-spin"
              style={{ color: "#3B5BDB" }}
            />
          </div>
          <p
            className="text-sm font-medium mb-1"
            style={{ color: "#151B42" }}
          >
            Importing leads...
          </p>
          <p className="text-xs text-gray-400 mb-6">
            {processedCount} of {rows.length} leads processed
          </p>

          {/* Progress bar */}
          <div className="w-full max-w-sm mx-auto">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Progress</span>
              <span
                className="text-xs font-medium"
                style={{ color: "#3B5BDB" }}
              >
                {Math.round(progress)}%
              </span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 ease-out"
                style={{
                  width: `${progress}%`,
                  backgroundColor: "#3B5BDB",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Step 4: Import Summary ──────────────────────────────── */}
      {step === "done" && importResult && (
        <div className="py-6 text-center">
          <div className="flex items-center justify-center mb-3">
            <CheckCircle2 size={40} className="text-green-500" />
          </div>
          <h3
            className="text-lg font-semibold mb-1"
            style={{ color: "#151B42" }}
          >
            Import Complete
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            Your leads have been imported into Balboa
          </p>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-6">
            <div className="px-4 py-3 rounded-lg bg-green-50 border border-green-100">
              <div className="text-2xl font-bold text-green-600">
                {importResult.leads}
              </div>
              <div className="text-xs text-green-700 mt-0.5">
                Lead{importResult.leads !== 1 ? "s" : ""} Imported
              </div>
            </div>
            <div className="px-4 py-3 rounded-lg bg-blue-50 border border-blue-100">
              <div
                className="text-2xl font-bold"
                style={{ color: "#3B5BDB" }}
              >
                {importResult.sequences}
              </div>
              <div className="text-xs text-blue-700 mt-0.5">
                Sequence{importResult.sequences !== 1 ? "s" : ""}
              </div>
            </div>
            <div
              className={`px-4 py-3 rounded-lg border ${
                importResult.errors > 0
                  ? "bg-red-50 border-red-100"
                  : "bg-gray-50 border-gray-100"
              }`}
            >
              <div
                className={`text-2xl font-bold ${
                  importResult.errors > 0 ? "text-red-500" : "text-gray-400"
                }`}
              >
                {importResult.errors}
              </div>
              <div
                className={`text-xs mt-0.5 ${
                  importResult.errors > 0 ? "text-red-600" : "text-gray-400"
                }`}
              >
                Error{importResult.errors !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          {/* Error details */}
          {importResult.errorDetails.length > 0 && (
            <div className="max-w-md mx-auto mb-6 text-left">
              <div className="px-3 py-2 bg-red-50 rounded-lg border border-red-100">
                <p className="text-xs font-medium text-red-700 mb-1">
                  Error Details
                </p>
                {importResult.errorDetails.slice(0, 5).map((detail, i) => (
                  <p key={i} className="text-xs text-red-600 truncate">
                    {detail}
                  </p>
                ))}
                {importResult.errorDetails.length > 5 && (
                  <p className="text-xs text-red-400 mt-1">
                    ...and {importResult.errorDetails.length - 5} more
                  </p>
                )}
              </div>
            </div>
          )}

          {/* New import button */}
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ backgroundColor: "#3B5BDB" }}
          >
            <RefreshCw size={14} />
            Start New Import
          </button>
        </div>
      )}
    </div>
  );
}
