"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Upload, Table, Filter, Sparkles, Search, LayoutGrid, Wand2,
  CheckCircle, ChevronRight, ChevronDown, AlertCircle, X, ArrowRight,
  ArrowLeft, RefreshCw, FileText, Zap, Users, Tag, Eye, Copy,
  Download, Check, Clock, BarChart3,
} from "lucide-react";
import {
  parseCSV, parseJSON, detectColumns, resolveValue, computeQualityScore,
  formatFileSize, scoreLeadICP, detectSeniority, detectPersona,
  buildSegmentKey, SOURCE_PLATFORMS, type SourcePlatform,
} from "@/lib/rocket-utils";
import {
  PIPELINE_STAGES, STRATEGIC_PRIORITIES, BUSINESS_CHALLENGES,
  PERSONA_OPENERS, ANTI_AI_RULES, BANNED_WORDS,
} from "@/lib/rocket-constants";
import type {
  RocketColumnMapping, RocketPipelineStage, RocketPipelineState,
  CompanyResearch, RocketSegment, SequenceTouch, ICPScoringResult,
  Lead, PersonaType, SeniorityBucket,
} from "@/lib/types";

// ─── Props ──────────────────────────────────────────────────────

interface RocketPipelineProps {
  onImportComplete?: (summary: { leads: number; sequences: number; errors: number }) => void;
}

// ─── Stage Icons ────────────────────────────────────────────────

const STAGE_ICONS: Record<string, React.ReactNode> = {
  upload: <Upload size={14} />,
  mapping: <Table size={14} />,
  "clean-icp": <Filter size={14} />,
  enrichment: <Sparkles size={14} />,
  research: <Search size={14} />,
  segmentation: <LayoutGrid size={14} />,
  "sequence-gen": <Wand2 size={14} />,
  "review-export": <CheckCircle size={14} />,
};

const STAGE_ORDER: RocketPipelineStage[] = [
  "upload", "mapping", "clean-icp", "enrichment",
  "research", "segmentation", "sequence-gen", "review-export",
];

// ─── Component ──────────────────────────────────────────────────

export default function RocketPipeline({ onImportComplete }: RocketPipelineProps) {
  // Pipeline state
  const [stage, setStage] = useState<RocketPipelineStage>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<RocketColumnMapping>({
    name: null, email: null, company: null, position: null,
    phone: null, linkedinUrl: null, sequence: null, classification: null,
  });
  const [detectedCount, setDetectedCount] = useState(0);
  const [sourcePlatform, setSourcePlatform] = useState<SourcePlatform | "">("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ICP scoring
  const [icpResults, setIcpResults] = useState<ICPScoringResult[]>([]);
  const [icpExpanded, setIcpExpanded] = useState<string | null>(null);

  // Enrichment
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState(0);
  const [enrichedLeads, setEnrichedLeads] = useState<Lead[]>([]);
  const [importId, setImportId] = useState<string | null>(null);

  // Research
  const [researching, setResearching] = useState(false);
  const [researchProgress, setResearchProgress] = useState(0);
  const [companyResearch, setCompanyResearch] = useState<Record<string, CompanyResearch>>({});

  // Segmentation
  const [segments, setSegments] = useState<RocketSegment[]>([]);

  // Sequence Generation
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [generatedSequences, setGeneratedSequences] = useState<Record<string, SequenceTouch[]>>({});

  // Review
  const [qualityChecklist, setQualityChecklist] = useState<Record<string, boolean>>({});
  const [previewSegment, setPreviewSegment] = useState<string | null>(null);

  // ── Navigation ────────────────────────────────────────────────

  const stageIndex = STAGE_ORDER.indexOf(stage);

  const canGoNext = useCallback((): boolean => {
    switch (stage) {
      case "upload": return rows.length > 0;
      case "mapping": return !!mapping.name && !!mapping.company;
      case "clean-icp": return icpResults.length > 0;
      case "enrichment": return enrichedLeads.length > 0 || importId !== null;
      case "research": return Object.keys(companyResearch).length > 0;
      case "segmentation": return segments.length > 0;
      case "sequence-gen": return Object.keys(generatedSequences).length > 0;
      case "review-export": return true;
      default: return false;
    }
  }, [stage, rows, mapping, icpResults, enrichedLeads, importId, companyResearch, segments, generatedSequences]);

  const goNext = useCallback(() => {
    const idx = STAGE_ORDER.indexOf(stage);
    if (idx < STAGE_ORDER.length - 1) setStage(STAGE_ORDER[idx + 1]);
  }, [stage]);

  const goBack = useCallback(() => {
    const idx = STAGE_ORDER.indexOf(stage);
    if (idx > 0) setStage(STAGE_ORDER[idx - 1]);
  }, [stage]);

  // ── File Handling ─────────────────────────────────────────────

  const processFile = useCallback((f: File) => {
    setFile(f);
    setError(null);
    const isCSV = f.name.toLowerCase().endsWith(".csv");
    const isJSON = f.name.toLowerCase().endsWith(".json");
    if (!isCSV && !isJSON) {
      setError("Unsupported file type. Upload a .csv or .json file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const parsed = isJSON ? parseJSON(text) : parseCSV(text);
        if (parsed.length === 0) { setError("No data rows found."); return; }
        const detectedHeaders = Object.keys(parsed[0]);
        setHeaders(detectedHeaders);
        setRows(parsed);
        const { mapping: m, detectedCount: c } = detectColumns(detectedHeaders);
        setMapping(m);
        setDetectedCount(c);
        setStage("mapping");
      } catch (err) {
        setError(err instanceof Error ? `Parse error: ${err.message}` : "Failed to parse file.");
      }
    };
    reader.onerror = () => setError("Failed to read file.");
    reader.readAsText(f);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  }, [processFile]);

  // ── ICP Scoring (Stage 3) ─────────────────────────────────────

  const runICPScoring = useCallback(() => {
    const results: ICPScoringResult[] = rows.map((row, i) => {
      const name = resolveValue(row, mapping.name);
      const company = resolveValue(row, mapping.company);
      const position = resolveValue(row, mapping.position);
      const email = resolveValue(row, mapping.email);

      const nameParts = name.split(" ");
      const mockLead = {
        id: `temp-${i}`,
        firstName: nameParts[0] || "",
        lastName: nameParts.slice(1).join(" ") || "",
        company,
        position,
        email,
        status: "new" as const,
        connectedOn: new Date().toISOString(),
        notes: "",
        icpScore: { overall: 0, companyFit: 0, roleFit: 0, industryFit: 0, signals: [], tier: "cold" as const },
        draftMessages: [],
        engagementActions: [],
        channels: { linkedin: false, email: !!email, linkedinConnected: false, emailVerified: false },
        emailCampaigns: [],
        touchpointTimeline: [],
        contactStatus: "not_contacted" as const,
      } satisfies Lead;

      const { totalScore, breakdown, bucket } = scoreLeadICP(mockLead);
      return {
        leadId: `temp-${i}`,
        leadName: name,
        company,
        totalScore,
        breakdown,
        bucket,
      };
    });

    setIcpResults(results);
  }, [rows, mapping]);

  useEffect(() => {
    if (stage === "clean-icp" && icpResults.length === 0 && rows.length > 0) {
      runICPScoring();
    }
  }, [stage, icpResults.length, rows.length, runICPScoring]);

  // ── Import & Enrich (Stage 4) ─────────────────────────────────

  const handleImportAndEnrich = useCallback(async () => {
    setEnriching(true);
    setEnrichProgress(10);
    setError(null);

    try {
      // First import the leads
      const passedLeads = icpResults
        .filter((r) => r.bucket === "auto-enroll" || r.bucket === "review")
        .map((r) => {
          const row = rows[parseInt(r.leadId.replace("temp-", ""))];
          const nameValue = resolveValue(row, mapping.name);
          const nameParts = nameValue.split(" ");
          return {
            first_name: nameParts[0] || "",
            last_name: nameParts.slice(1).join(" ") || "",
            email: resolveValue(row, mapping.email),
            company: resolveValue(row, mapping.company),
            title: resolveValue(row, mapping.position),
            phone: resolveValue(row, mapping.phone),
            linkedin_url: resolveValue(row, mapping.linkedinUrl),
            sp_category: resolveValue(row, mapping.classification),
            sequence_name: resolveValue(row, mapping.sequence),
            icp_score: r.totalScore,
            icp_bucket: r.bucket,
            ...row,
          };
        });

      setEnrichProgress(30);

      const importRes = await fetch("/api/rocket/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: passedLeads,
          filename: file?.name || "unknown.csv",
          fileType: file?.name?.split(".").pop() || "csv",
          columnMapping: mapping,
          sourcePlatform: sourcePlatform || null,
        }),
      });

      if (!importRes.ok) {
        const errData = await importRes.json().catch(() => ({}));
        throw new Error(errData.error || "Import failed");
      }

      const importData = await importRes.json();
      const newImportId = importData.summary?.importId;
      setImportId(newImportId);
      setEnrichProgress(50);

      // Then enrich
      if (newImportId) {
        try {
          const enrichRes = await fetch("/api/rocket/enrich", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ importId: newImportId }),
          });

          if (enrichRes.ok) {
            const enrichData = await enrichRes.json();
            setEnrichedLeads(enrichData.leads || []);
          } else {
            console.warn(`[Rocket] Enrichment failed (${enrichRes.status})`);
          }
        } catch (enrichErr) {
          console.warn("[Rocket] Enrichment error:", enrichErr);
        }
      }

      setEnrichProgress(100);
      onImportComplete?.({
        leads: importData.summary?.created + importData.summary?.updated || 0,
        sequences: importData.summary?.enrolled || 0,
        errors: importData.summary?.errors || 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import/enrichment failed");
    } finally {
      setEnriching(false);
    }
  }, [icpResults, rows, mapping, file, sourcePlatform, onImportComplete]);

  // ── Company Research (Stage 5) ─────────────────────────────────

  const runCompanyResearch = useCallback(async () => {
    setResearching(true);
    setResearchProgress(10);
    setError(null);

    try {
      // Gather unique companies
      const companies = [...new Set(
        icpResults
          .filter((r) => r.bucket !== "parked")
          .map((r) => r.company)
          .filter(Boolean)
      )];

      const batchSize = 5;
      const results: Record<string, CompanyResearch> = {};

      for (let i = 0; i < companies.length; i += batchSize) {
        const batch = companies.slice(i, i + batchSize);
        const leadsForBatch = enrichedLeads.length > 0
          ? enrichedLeads.filter((l) => batch.includes(l.company))
          : icpResults
              .filter((r) => batch.includes(r.company))
              .map((r) => {
                const row = rows[parseInt(r.leadId.replace("temp-", ""))];
                return {
                  id: r.leadId,
                  name: r.leadName,
                  company: r.company,
                  position: resolveValue(row, mapping.position),
                  email: resolveValue(row, mapping.email),
                };
              });

        try {
          const res = await fetch("/api/rocket/research", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leads: leadsForBatch, importId }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.research) {
              for (const [company, research] of Object.entries(data.research)) {
                results[company] = research as CompanyResearch;
              }
            }
          } else {
            console.warn(`[Rocket] Research batch failed (${res.status}) for: ${batch.join(", ")}`);
          }
        } catch (err) {
          console.warn("[Rocket] Research batch error:", err);
        }

        setResearchProgress(Math.min(100, Math.round(((i + batchSize) / companies.length) * 100)));
      }

      setCompanyResearch(results);
      setResearchProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research failed");
    } finally {
      setResearching(false);
    }
  }, [icpResults, enrichedLeads, rows, mapping, importId]);

  // ── Segmentation (Stage 6) ────────────────────────────────────

  const runSegmentation = useCallback(() => {
    const segMap: Record<string, RocketSegment> = {};

    const leadsToSegment = icpResults.filter((r) => r.bucket !== "parked");

    for (const result of leadsToSegment) {
      const row = rows[parseInt(result.leadId.replace("temp-", ""))];
      const position = resolveValue(row, mapping.position);
      const persona = detectPersona(position);
      const seniority = detectSeniority(position);

      // Get SP/BC from research or classification column
      const research = companyResearch[result.company];
      const categoryId = research?.assignedBC || research?.assignedSP ||
        resolveValue(row, mapping.classification) || "BC3";

      const key = buildSegmentKey(categoryId, persona);

      if (!segMap[key]) {
        segMap[key] = {
          segmentKey: key,
          categoryId,
          persona,
          seniority,
          leadIds: [],
          touchSequence: [],
        };
      }

      segMap[key].leadIds.push(result.leadId);
    }

    setSegments(Object.values(segMap));
  }, [icpResults, rows, mapping, companyResearch]);

  useEffect(() => {
    if (stage === "segmentation" && segments.length === 0 && icpResults.length > 0) {
      runSegmentation();
    }
  }, [stage, segments.length, icpResults.length, runSegmentation]);

  // ── Sequence Generation (Stage 7) ─────────────────────────────

  const runSequenceGeneration = useCallback(async () => {
    setGenerating(true);
    setGenProgress(0);
    setError(null);

    try {
      const results: Record<string, SequenceTouch[]> = {};

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const companyResearchForSegment = segment.leadIds
          .map((id) => {
            const row = rows[parseInt(id.replace("temp-", ""))];
            const company = resolveValue(row, mapping.company);
            return companyResearch[company];
          })
          .filter(Boolean);

        try {
          const res = await fetch("/api/rocket/generate-sequence", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              segment,
              companyResearch: companyResearchForSegment,
              personaType: segment.persona,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.sequence && data.sequence.length > 0) {
              results[segment.segmentKey] = data.sequence;
            } else {
              console.warn(`[Rocket] Empty sequence for segment: ${segment.segmentKey}`);
            }
          } else {
            console.warn(`[Rocket] Sequence gen failed (${res.status}) for: ${segment.segmentKey}`);
          }
        } catch (err) {
          console.warn("[Rocket] Sequence gen error:", err);
        }

        setGenProgress(Math.round(((i + 1) / segments.length) * 100));
      }

      setGeneratedSequences(results);
      setGenProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sequence generation failed");
    } finally {
      setGenerating(false);
    }
  }, [segments, rows, mapping, companyResearch]);

  // ── Export (Stage 8) ──────────────────────────────────────────

  const handleExport = useCallback(async () => {
    setError(null);
    let exportedSegments = 0;
    let exportErrors = 0;
    let totalLeadsExported = 0;

    try {
      // Export each segment's sequence + leads to Supabase via /api/rocket/import
      for (const [segKey, touches] of Object.entries(generatedSequences)) {
        const segment = segments.find((s) => s.segmentKey === segKey);
        if (!segment) continue;

        try {
          const res = await fetch("/api/rocket/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              leads: segment.leadIds.map((id) => {
                const row = rows[parseInt(id.replace("temp-", ""))];
                const nameValue = resolveValue(row, mapping.name);
                const nameParts = nameValue.split(" ");
                return {
                  first_name: nameParts[0] || "",
                  last_name: nameParts.slice(1).join(" ") || "",
                  email: resolveValue(row, mapping.email),
                  company: resolveValue(row, mapping.company),
                  title: resolveValue(row, mapping.position),
                };
              }),
              sequence: {
                name: `Rocket: ${segKey}`,
                description: `Auto-generated 13-touch sequence for ${segKey}`,
                steps: touches.map((t) => ({
                  step_number: t.touchNumber,
                  channel: t.channel,
                  day_offset: t.dayOffset,
                  subject: t.subject,
                  body: t.body,
                })),
              },
              filename: `rocket-export-${segKey}.json`,
              fileType: "json",
              sourcePlatform: "rocket",
            }),
          });

          if (res.ok) {
            exportedSegments++;
            totalLeadsExported += segment.leadIds.length;
          } else {
            exportErrors++;
            console.error(`Export failed for segment ${segKey}: ${res.status}`);
          }
        } catch (err) {
          exportErrors++;
          console.error(`Export error for segment ${segKey}:`, err);
        }
      }

      onImportComplete?.({
        leads: totalLeadsExported,
        sequences: exportedSegments,
        errors: exportErrors,
      });

      if (exportErrors > 0) {
        setError(`Exported ${exportedSegments} segments with ${exportErrors} error(s).`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }, [generatedSequences, segments, rows, mapping, onImportComplete]);

  // ── Quality Check ─────────────────────────────────────────────

  const runQualityCheck = useCallback(() => {
    const checks: Record<string, boolean> = {};

    for (const [segKey, touches] of Object.entries(generatedSequences)) {
      const emailTouches = touches.filter((t) => t.channel === "email");

      // Subject word count
      const subjectOk = emailTouches.every((t) =>
        !t.subject || t.subject.split(/\s+/).length <= ANTI_AI_RULES.subjectMaxWords
      );
      checks[`${segKey}_subject_length`] = subjectOk;

      // Body word count
      const bodyOk = emailTouches.every((t, i) => {
        const maxWords = i === 0 ? ANTI_AI_RULES.email1MaxWords : ANTI_AI_RULES.followUpMaxWords;
        return t.body.split(/\s+/).length <= maxWords;
      });
      checks[`${segKey}_body_length`] = bodyOk;

      // Banned words
      const noBanned = emailTouches.every((t) =>
        !BANNED_WORDS.some((bw) => t.body.toLowerCase().includes(bw.toLowerCase()))
      );
      checks[`${segKey}_no_banned`] = noBanned;

      // Angle rotation
      const fields = touches.map((t) => t.researchFieldUsed).filter(Boolean);
      const uniqueFields = new Set(fields);
      checks[`${segKey}_angle_rotation`] = uniqueFields.size >= Math.min(fields.length, 5);
    }

    setQualityChecklist(checks);
  }, [generatedSequences]);

  useEffect(() => {
    if (stage === "review-export" && Object.keys(generatedSequences).length > 0) {
      runQualityCheck();
    }
  }, [stage, generatedSequences, runQualityCheck]);

  // ── ICP bucket stats ──────────────────────────────────────────

  const icpBuckets = {
    autoEnroll: icpResults.filter((r) => r.bucket === "auto-enroll"),
    review: icpResults.filter((r) => r.bucket === "review"),
    parked: icpResults.filter((r) => r.bucket === "parked"),
  };

  // ── Render ────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Stage Progress Bar */}
      <div style={{
        display: "flex", gap: 2, marginBottom: 24, overflowX: "auto",
        padding: "4px 0",
      }}>
        {PIPELINE_STAGES.map((s, i) => {
          const isActive = s.key === stage;
          const isPast = STAGE_ORDER.indexOf(s.key) < stageIndex;
          return (
            <button
              key={s.key}
              onClick={() => {
                if (isPast) setStage(s.key);
              }}
              disabled={!isPast && !isActive}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", fontSize: 11, fontWeight: isActive ? 700 : 500,
                color: isActive ? "white" : isPast ? "var(--balboa-navy)" : "#94a3b8",
                background: isActive ? "var(--balboa-navy)" : isPast ? "rgba(30, 42, 94, 0.08)" : "transparent",
                border: `1px solid ${isActive ? "var(--balboa-navy)" : isPast ? "rgba(30, 42, 94, 0.15)" : "#e2e8f0"}`,
                borderRadius: 8, cursor: isPast ? "pointer" : isActive ? "default" : "not-allowed",
                whiteSpace: "nowrap", transition: "all 0.15s",
                opacity: !isPast && !isActive ? 0.5 : 1,
              }}
            >
              {isPast ? <Check size={12} /> : STAGE_ICONS[s.key]}
              <span>{s.label}</span>
              {i < PIPELINE_STAGES.length - 1 && (
                <ChevronRight size={10} style={{ opacity: 0.4, marginLeft: 2 }} />
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <div style={{
          padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca",
          borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#dc2626",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <AlertCircle size={14} />
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer" }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── STAGE 1: Upload ────────────────────────────────────────── */}
      {stage === "upload" && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 6 }}>
            Upload Prospect List
          </h3>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
            Drag & drop a CSV or JSON file with your prospect data.
          </p>

          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${isDragOver ? "var(--balboa-blue)" : "#cbd5e1"}`,
              borderRadius: 12, padding: 48, textAlign: "center",
              cursor: "pointer", transition: "all 0.2s",
              background: isDragOver ? "rgba(59, 91, 219, 0.04)" : "#fafbfc",
            }}
          >
            <Upload size={32} style={{ color: isDragOver ? "var(--balboa-blue)" : "#94a3b8", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--balboa-navy)", marginBottom: 4 }}>
              Drop your file here or click to browse
            </p>
            <p style={{ fontSize: 12, color: "#94a3b8" }}>
              Supports CSV and JSON. Sales Navigator, Clay, Apify, HubSpot exports.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
              style={{ display: "none" }}
            />
          </div>

          {/* Source Platform */}
          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6 }}>
              Source Platform (optional)
            </label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {SOURCE_PLATFORMS.map((sp) => (
                <button
                  key={sp.value}
                  onClick={() => setSourcePlatform(sourcePlatform === sp.value ? "" : sp.value)}
                  style={{
                    padding: "5px 12px", fontSize: 12, borderRadius: 6,
                    border: `1px solid ${sourcePlatform === sp.value ? "var(--balboa-blue)" : "#e2e8f0"}`,
                    background: sourcePlatform === sp.value ? "rgba(59, 91, 219, 0.08)" : "white",
                    color: sourcePlatform === sp.value ? "var(--balboa-blue)" : "#64748b",
                    cursor: "pointer", fontWeight: sourcePlatform === sp.value ? 600 : 400,
                  }}
                >
                  {sp.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── STAGE 2: Column Mapping ──────────────────────────────── */}
      {stage === "mapping" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 4 }}>
                Column Mapping
              </h3>
              <p style={{ fontSize: 13, color: "#64748b" }}>
                {file?.name} — {rows.length} rows, {detectedCount} columns auto-detected
              </p>
            </div>
            <span style={{
              fontSize: 11, padding: "4px 10px", borderRadius: 12,
              background: detectedCount >= 4 ? "#dcfce7" : "#fef3c7",
              color: detectedCount >= 4 ? "#16a34a" : "#d97706", fontWeight: 600,
            }}>
              {detectedCount}/{Object.keys(mapping).length} mapped
            </span>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            {(Object.entries(mapping) as [keyof RocketColumnMapping, string | null][]).map(([field, value]) => (
              <div key={field} style={{
                padding: 12, borderRadius: 8, border: "1px solid #e2e8f0", background: "white",
              }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "capitalize", display: "block", marginBottom: 6 }}>
                  {field.replace(/([A-Z])/g, " $1")} {field === "name" || field === "company" ? "*" : ""}
                </label>
                <select
                  value={value || ""}
                  onChange={(e) => {
                    setMapping((prev) => ({ ...prev, [field]: e.target.value || null }));
                    setDetectedCount(Object.values({ ...mapping, [field]: e.target.value || null }).filter(Boolean).length);
                  }}
                  style={{
                    width: "100%", padding: "6px 8px", fontSize: 13, borderRadius: 6,
                    border: "1px solid #e2e8f0", background: "#fafbfc",
                  }}
                >
                  <option value="">— Not mapped —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Preview Table */}
          <div style={{ marginTop: 20, overflowX: "auto" }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 8 }}>
              Preview (first 5 rows)
            </p>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {headers.slice(0, 6).map((h) => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0", fontWeight: 600, color: "#64748b" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((row, i) => (
                  <tr key={i}>
                    {headers.slice(0, 6).map((h) => (
                      <td key={h} style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9", color: "#334155", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row[h] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── STAGE 3: Clean & ICP Score ───────────────────────────── */}
      {stage === "clean-icp" && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 4 }}>
            Clean & ICP Score
          </h3>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
            {rows.length} leads scored against ICP criteria. Route them into action buckets.
          </p>

          {/* Bucket Summary */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Auto-Enroll", count: icpBuckets.autoEnroll.length, color: "#16a34a", bg: "#dcfce7", desc: "Score 70+" },
              { label: "Review", count: icpBuckets.review.length, color: "#d97706", bg: "#fef3c7", desc: "Score 50-69" },
              { label: "Parked", count: icpBuckets.parked.length, color: "#dc2626", bg: "#fef2f2", desc: "Score <50" },
            ].map((b) => (
              <div key={b.label} style={{
                padding: 16, borderRadius: 10, background: b.bg, textAlign: "center",
              }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: b.color }}>{b.count}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: b.color }}>{b.label}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{b.desc}</div>
              </div>
            ))}
          </div>

          {/* Quality Score */}
          {rows.length > 0 && (() => {
            const quality = computeQualityScore(rows, mapping);
            return (
              <div style={{
                padding: 14, borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 16,
                background: "white",
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 8 }}>
                  Data Quality: {quality.overall}%
                </div>
                <div style={{ height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 3, transition: "width 0.3s",
                    width: `${quality.overall}%`,
                    background: quality.overall >= 80 ? "#16a34a" : quality.overall >= 50 ? "#d97706" : "#dc2626",
                  }} />
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: "#64748b" }}>
                  <span>Email: {quality.pctWithEmail}%</span>
                  <span>Company: {quality.pctWithCompany}%</span>
                  <span>LinkedIn: {quality.pctWithLinkedin}%</span>
                  <span>SP/BC: {quality.pctWithClassification}%</span>
                </div>
              </div>
            );
          })()}

          {/* Lead List */}
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {icpResults.slice(0, 50).map((result) => (
              <div
                key={result.leadId}
                style={{
                  padding: "10px 14px", borderBottom: "1px solid #f1f5f9",
                  display: "flex", alignItems: "center", gap: 12,
                  cursor: "pointer", position: "relative",
                }}
                onClick={() => setIcpExpanded(icpExpanded === result.leadId ? null : result.leadId)}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8, display: "flex",
                  alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
                  background: result.bucket === "auto-enroll" ? "#dcfce7" : result.bucket === "review" ? "#fef3c7" : "#fef2f2",
                  color: result.bucket === "auto-enroll" ? "#16a34a" : result.bucket === "review" ? "#d97706" : "#dc2626",
                }}>
                  {result.totalScore}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--balboa-navy)" }}>{result.leadName}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{result.company}</div>
                </div>
                <span style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
                  background: result.bucket === "auto-enroll" ? "#dcfce7" : result.bucket === "review" ? "#fef3c7" : "#fef2f2",
                  color: result.bucket === "auto-enroll" ? "#16a34a" : result.bucket === "review" ? "#d97706" : "#dc2626",
                }}>
                  {result.bucket}
                </span>
                <ChevronDown size={12} style={{ color: "#94a3b8", transform: icpExpanded === result.leadId ? "rotate(180deg)" : "none" }} />

                {/* Expanded breakdown */}
                {icpExpanded === result.leadId && (
                  <div style={{
                    position: "absolute", right: 20, top: "100%", zIndex: 10,
                    background: "white", border: "1px solid #e2e8f0", borderRadius: 8,
                    padding: 12, minWidth: 260, boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  }}>
                    {result.breakdown.map((b, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 11 }}>
                        <span style={{ color: b.matched ? "#16a34a" : "#94a3b8" }}>
                          {b.matched ? "✓" : "○"} {b.signal}
                        </span>
                        <span style={{ fontWeight: 600, color: b.matched ? "#16a34a" : "#94a3b8" }}>
                          {b.matched ? `+${b.points}` : "0"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── STAGE 4: Enrichment ──────────────────────────────────── */}
      {stage === "enrichment" && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 4 }}>
            Import & AI Enrichment
          </h3>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
            Import {icpBuckets.autoEnroll.length + icpBuckets.review.length} qualified leads and enrich with AI-generated personalization signals.
          </p>

          {!enriching && !importId && (
            <button
              onClick={handleImportAndEnrich}
              style={{
                padding: "12px 24px", fontSize: 14, fontWeight: 600,
                background: "var(--balboa-navy)", color: "white", border: "none",
                borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <Sparkles size={16} />
              Import & Enrich ({icpBuckets.autoEnroll.length + icpBuckets.review.length} leads)
            </button>
          )}

          {enriching && (
            <div style={{ padding: 24, textAlign: "center" }}>
              <RefreshCw size={24} className="animate-spin" style={{ color: "var(--balboa-blue)", margin: "0 auto 12px" }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--balboa-navy)", marginBottom: 8 }}>
                {enrichProgress < 50 ? "Importing leads..." : "Running AI enrichment..."}
              </p>
              <div style={{ height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden", maxWidth: 300, margin: "0 auto" }}>
                <div style={{ height: "100%", background: "var(--balboa-blue)", borderRadius: 3, transition: "width 0.3s", width: `${enrichProgress}%` }} />
              </div>
              <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>{enrichProgress}% complete</p>
            </div>
          )}

          {importId && !enriching && (
            <div style={{
              padding: 20, borderRadius: 10, background: "#dcfce7", textAlign: "center",
            }}>
              <CheckCircle size={24} style={{ color: "#16a34a", margin: "0 auto 8px" }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: "#16a34a" }}>
                Import & enrichment complete
              </p>
              <p style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                {enrichedLeads.length > 0 ? `${enrichedLeads.length} leads enriched` : "Leads imported successfully"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── STAGE 5: Company Research ────────────────────────────── */}
      {stage === "research" && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 4 }}>
            Company Research & SP/BC Assignment
          </h3>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
            AI analyzes each company and assigns Strategic Priority + Business Challenge categories.
          </p>

          {!researching && Object.keys(companyResearch).length === 0 && (
            <button
              onClick={runCompanyResearch}
              style={{
                padding: "12px 24px", fontSize: 14, fontWeight: 600,
                background: "var(--balboa-navy)", color: "white", border: "none",
                borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <Search size={16} />
              Run Company Research
            </button>
          )}

          {researching && (
            <div style={{ padding: 24, textAlign: "center" }}>
              <RefreshCw size={24} className="animate-spin" style={{ color: "var(--balboa-blue)", margin: "0 auto 12px" }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--balboa-navy)" }}>Researching companies...</p>
              <div style={{ height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden", maxWidth: 300, margin: "0 auto", marginTop: 8 }}>
                <div style={{ height: "100%", background: "var(--balboa-blue)", borderRadius: 3, transition: "width 0.3s", width: `${researchProgress}%` }} />
              </div>
            </div>
          )}

          {Object.keys(companyResearch).length > 0 && !researching && (
            <div style={{ display: "grid", gap: 12 }}>
              {Object.entries(companyResearch).map(([company, research]) => (
                <div key={company} style={{
                  padding: 16, borderRadius: 10, border: "1px solid #e2e8f0", background: "white",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--balboa-navy)" }}>{company}</span>
                    {research.assignedSP && (
                      <span style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
                        background: STRATEGIC_PRIORITIES[research.assignedSP]?.color + "15",
                        color: STRATEGIC_PRIORITIES[research.assignedSP]?.color,
                      }}>
                        {research.assignedSP}: {STRATEGIC_PRIORITIES[research.assignedSP]?.label}
                      </span>
                    )}
                    {research.assignedBC && (
                      <span style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
                        background: BUSINESS_CHALLENGES[research.assignedBC]?.color + "15",
                        color: BUSINESS_CHALLENGES[research.assignedBC]?.color,
                      }}>
                        {research.assignedBC}: {BUSINESS_CHALLENGES[research.assignedBC]?.label}
                      </span>
                    )}
                  </div>
                  {research.spReasoning && (
                    <p style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                      <strong>SP:</strong> {research.spReasoning}
                    </p>
                  )}
                  {research.bcReasoning && (
                    <p style={{ fontSize: 12, color: "#64748b" }}>
                      <strong>BC:</strong> {research.bcReasoning}
                    </p>
                  )}
                  {research.signals.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                      {research.signals.map((s, i) => (
                        <span key={i} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#f1f5f9", color: "#64748b" }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── STAGE 6: Segmentation ────────────────────────────────── */}
      {stage === "segmentation" && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 4 }}>
            Lead Segmentation
          </h3>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
            {segments.length} segments created by SP/BC + persona. Ideal segment size: 3-8 leads.
          </p>

          <div style={{ display: "grid", gap: 12 }}>
            {segments.map((seg) => {
              const persona = PERSONA_OPENERS[seg.persona];
              const isIdealSize = seg.leadIds.length >= 3 && seg.leadIds.length <= 8;
              return (
                <div key={seg.segmentKey} style={{
                  padding: 16, borderRadius: 10, border: "1px solid #e2e8f0", background: "white",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Users size={14} style={{ color: "var(--balboa-blue)" }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--balboa-navy)" }}>
                        {seg.segmentKey}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        fontSize: 11, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
                        background: isIdealSize ? "#dcfce7" : "#fef3c7",
                        color: isIdealSize ? "#16a34a" : "#d97706",
                      }}>
                        {seg.leadIds.length} leads
                      </span>
                      <Tag size={12} style={{ color: "#94a3b8" }} />
                    </div>
                  </div>
                  {persona && (
                    <p style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                      {persona.label} — {persona.role}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── STAGE 7: Sequence Generation ─────────────────────────── */}
      {stage === "sequence-gen" && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 4 }}>
            Sequence Generation
          </h3>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
            Generate personalized 13-touch sequences for each segment using AI.
          </p>

          {!generating && Object.keys(generatedSequences).length === 0 && (
            <button
              onClick={runSequenceGeneration}
              style={{
                padding: "12px 24px", fontSize: 14, fontWeight: 600,
                background: "var(--balboa-navy)", color: "white", border: "none",
                borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <Wand2 size={16} />
              Generate Sequences ({segments.length} segments)
            </button>
          )}

          {generating && (
            <div style={{ padding: 24, textAlign: "center" }}>
              <RefreshCw size={24} className="animate-spin" style={{ color: "var(--balboa-blue)", margin: "0 auto 12px" }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--balboa-navy)" }}>Generating sequences...</p>
              <div style={{ height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden", maxWidth: 300, margin: "0 auto", marginTop: 8 }}>
                <div style={{ height: "100%", background: "var(--balboa-blue)", borderRadius: 3, transition: "width 0.3s", width: `${genProgress}%` }} />
              </div>
              <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
                {genProgress}% — Anti-AI rules enforced, angle rotation active
              </p>
            </div>
          )}

          {Object.keys(generatedSequences).length > 0 && !generating && (
            <div style={{ display: "grid", gap: 12 }}>
              {Object.entries(generatedSequences).map(([segKey, touches]) => (
                <div key={segKey} style={{
                  padding: 16, borderRadius: 10, border: "1px solid #e2e8f0", background: "white",
                }}>
                  <div
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                    onClick={() => setPreviewSegment(previewSegment === segKey ? null : segKey)}
                  >
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--balboa-navy)" }}>{segKey}</span>
                      <span style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>
                        {touches.length} touches across {touches[touches.length - 1]?.dayOffset || 22} days
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>
                        <Check size={12} style={{ display: "inline", verticalAlign: "middle" }} /> Generated
                      </span>
                      <ChevronDown size={14} style={{ color: "#94a3b8", transform: previewSegment === segKey ? "rotate(180deg)" : "none" }} />
                    </div>
                  </div>

                  {previewSegment === segKey && (
                    <div style={{ marginTop: 12, borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
                      {touches.map((t) => (
                        <div key={t.touchNumber} style={{
                          display: "flex", gap: 10, padding: "8px 0",
                          borderBottom: "1px solid #fafbfc",
                        }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: 6, fontSize: 10, fontWeight: 700,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: t.channel === "email" ? "#dbeafe" : t.channel === "call" ? "#fef3c7" : "#e0e7ff",
                            color: t.channel === "email" ? "#2563eb" : t.channel === "call" ? "#d97706" : "#4f46e5",
                          }}>
                            {t.channel === "email" ? "E" : t.channel === "call" ? "C" : "L"}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--balboa-navy)" }}>
                              Day {t.dayOffset}: {t.label}
                            </div>
                            {t.subject && (
                              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                                Subject: {t.subject}
                              </div>
                            )}
                            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                              {t.body.substring(0, 100)}...
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── STAGE 8: Review & Export ──────────────────────────────── */}
      {stage === "review-export" && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 4 }}>
            Review & Export
          </h3>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
            Quality check your sequences before enrolling leads.
          </p>

          {/* Quality Checklist */}
          <div style={{
            padding: 16, borderRadius: 10, border: "1px solid #e2e8f0",
            background: "white", marginBottom: 20,
          }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--balboa-navy)", marginBottom: 12 }}>
              Quality Checklist
            </h4>
            {Object.entries(qualityChecklist).length === 0 ? (
              <p style={{ fontSize: 12, color: "#94a3b8" }}>No sequences to check. Go back and generate sequences first.</p>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {Object.entries(qualityChecklist).map(([check, passed]) => (
                  <div key={check} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    {passed ? (
                      <CheckCircle size={14} style={{ color: "#16a34a" }} />
                    ) : (
                      <AlertCircle size={14} style={{ color: "#dc2626" }} />
                    )}
                    <span style={{ color: passed ? "#334155" : "#dc2626" }}>
                      {check.replace(/_/g, " ").replace(/^[^_]+\s/, "")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Summary */}
          <div style={{
            padding: 16, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", marginBottom: 20,
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, textAlign: "center" }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "var(--balboa-navy)" }}>
                  {segments.reduce((s, seg) => s + seg.leadIds.length, 0)}
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>Total Leads</div>
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "var(--balboa-navy)" }}>
                  {Object.keys(generatedSequences).length}
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>Sequences</div>
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "var(--balboa-navy)" }}>
                  {Object.values(generatedSequences).reduce((s, t) => s + t.length, 0)}
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>Total Touches</div>
              </div>
            </div>
          </div>

          {/* Export Button */}
          <button
            onClick={handleExport}
            style={{
              padding: "14px 28px", fontSize: 14, fontWeight: 700,
              background: "var(--balboa-navy)", color: "white", border: "none",
              borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center",
              gap: 8, margin: "0 auto",
            }}
          >
            <Download size={16} />
            Export & Enroll Leads
          </button>
        </div>
      )}

      {/* ── Navigation Buttons ───────────────────────────────────── */}
      <div style={{
        display: "flex", justifyContent: "space-between", marginTop: 24,
        paddingTop: 16, borderTop: "1px solid #e2e8f0",
      }}>
        <button
          onClick={goBack}
          disabled={stageIndex === 0}
          style={{
            padding: "8px 16px", fontSize: 13, fontWeight: 600,
            border: "1px solid #e2e8f0", borderRadius: 8, background: "white",
            color: stageIndex === 0 ? "#94a3b8" : "var(--balboa-navy)",
            cursor: stageIndex === 0 ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: 6,
            opacity: stageIndex === 0 ? 0.5 : 1,
          }}
        >
          <ArrowLeft size={14} />
          Back
        </button>

        {stage !== "review-export" && (
          <button
            onClick={goNext}
            disabled={!canGoNext()}
            style={{
              padding: "8px 20px", fontSize: 13, fontWeight: 600,
              border: "none", borderRadius: 8,
              background: canGoNext() ? "var(--balboa-navy)" : "#e2e8f0",
              color: canGoNext() ? "white" : "#94a3b8",
              cursor: canGoNext() ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            Next
            <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
