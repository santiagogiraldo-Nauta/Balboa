// ─── Rocket Pipeline Utilities ────────────────────────────────────
// Extracted from RocketImport.tsx for shared use across pipeline stages

import type { RocketColumnMapping, SeniorityBucket, PersonaType, Lead } from "./types";
import { SENIORITY_BUCKETS, ICP_SCORING_WEIGHTS } from "./rocket-constants";

// ─── Column Detection Aliases ────────────────────────────────────

export const COLUMN_ALIASES: Record<keyof RocketColumnMapping, string[]> = {
  name: ["name", "full_name", "fullname", "contact_name", "contactname", "lead_name", "first_name", "firstname"],
  email: ["email", "email_address", "emailaddress", "e-mail", "contact_email", "work_email"],
  company: ["company", "company_name", "companyname", "organization", "org", "account", "account_name"],
  position: ["position", "title", "job_title", "jobtitle", "role", "designation"],
  phone: ["phone", "phone_number", "phonenumber", "mobile", "cell", "telephone", "direct_phone", "work_phone"],
  linkedinUrl: ["linkedin", "linkedin_url", "linkedinurl", "linkedin_profile", "profile_url", "url"],
  sequence: ["sequence", "sequence_name", "sequencename", "campaign", "cadence", "workflow"],
  classification: ["classification", "sp", "bc", "sp_category", "bc_category", "strategic_priority", "business_challenge", "category", "segment", "type"],
};

export const SOURCE_PLATFORMS = [
  { value: "sales_navigator" as const, label: "Sales Navigator" },
  { value: "clay" as const, label: "Clay" },
  { value: "apify" as const, label: "Apify" },
  { value: "hubspot" as const, label: "HubSpot Export" },
  { value: "manual" as const, label: "Manual List" },
  { value: "other" as const, label: "Other" },
];

export type SourcePlatform = (typeof SOURCE_PLATFORMS)[number]["value"];

// ─── File Parsing ────────────────────────────────────────────────

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function parseCSVLine(line: string): string[] {
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

export function parseCSV(text: string): Record<string, string>[] {
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

export function parseJSON(text: string): Record<string, string>[] {
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

// ─── Column Detection ────────────────────────────────────────────

export function detectColumns(headers: string[]): { mapping: RocketColumnMapping; detectedCount: number } {
  const mapping: RocketColumnMapping = { name: null, email: null, company: null, position: null, phone: null, linkedinUrl: null, sequence: null, classification: null };
  let detectedCount = 0;
  const normalizedHeaders = headers.map((h) => h.toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, ""));
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [keyof RocketColumnMapping, string[]][]) {
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

export function resolveValue(row: Record<string, string>, mappedHeader: string | null): string {
  if (!mappedHeader) return "";
  if (mappedHeader === "first_name+last_name") {
    const firstName = row["first_name"] || row["firstname"] || "";
    const lastName = row["last_name"] || row["lastname"] || "";
    return `${firstName} ${lastName}`.trim();
  }
  const normalized = mappedHeader.toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");
  return row[normalized] ?? row[mappedHeader] ?? "";
}

// ─── Quality Scoring ─────────────────────────────────────────────

export function computeQualityScore(rows: Record<string, string>[], mapping: RocketColumnMapping) {
  const total = rows.length;
  if (total === 0) return { overall: 0, pctWithEmail: 0, pctWithCompany: 0, pctWithLinkedin: 0, pctWithClassification: 0, pctWithPhone: 0 };

  let withEmail = 0, withCompany = 0, withLinkedin = 0, withClassification = 0, withPhone = 0;
  for (const row of rows) {
    if (resolveValue(row, mapping.email)) withEmail++;
    if (resolveValue(row, mapping.company)) withCompany++;
    if (resolveValue(row, mapping.linkedinUrl)) withLinkedin++;
    if (resolveValue(row, mapping.classification)) withClassification++;
    if (resolveValue(row, mapping.phone)) withPhone++;
  }

  const pctWithEmail = Math.round((withEmail / total) * 100);
  const pctWithCompany = Math.round((withCompany / total) * 100);
  const pctWithLinkedin = Math.round((withLinkedin / total) * 100);
  const pctWithClassification = Math.round((withClassification / total) * 100);
  const pctWithPhone = Math.round((withPhone / total) * 100);

  const overall = Math.round(
    pctWithEmail * 0.3 + pctWithCompany * 0.25 + pctWithLinkedin * 0.2 +
    pctWithClassification * 0.15 + pctWithPhone * 0.1
  );

  return { overall, pctWithEmail, pctWithCompany, pctWithLinkedin, pctWithClassification, pctWithPhone };
}

// ─── ICP Scoring ─────────────────────────────────────────────────

export function scoreLeadICP(lead: Lead): { totalScore: number; breakdown: Array<{ signal: string; points: number; matched: boolean }>; bucket: "auto-enroll" | "review" | "parked" } {
  const breakdown: Array<{ signal: string; points: number; matched: boolean }> = [];
  let totalScore = 0;

  const position = (lead.position || "").toLowerCase();
  const company = (lead.company || "").toLowerCase();
  const email = (lead.email || "").toLowerCase();
  const linkedinUrl = (lead as unknown as Record<string, unknown>).linkedin_url as string ||
    (lead as unknown as Record<string, unknown>).linkedinUrl as string || "";
  const phone = (lead as unknown as Record<string, unknown>).phone as string || "";
  const rawData = (lead as unknown as Record<string, unknown>).raw_data as Record<string, unknown> | undefined;
  const companyIntel = lead.companyIntel;

  // ── Data completeness baseline signals ──
  // Raw CSV imports won't have ERP/TMS/revenue data yet.
  // Give baseline credit for having core contact data so leads aren't all parked.
  const dataSignals: Array<{ signal: string; points: number; field: string }> = [
    { signal: "Has company name", points: 10, field: "company" },
    { signal: "Has email address", points: 10, field: "email" },
    { signal: "Has LinkedIn profile", points: 10, field: "linkedin" },
    { signal: "Has job title", points: 5, field: "position" },
    { signal: "Has phone number", points: 5, field: "phone" },
  ];

  for (const sig of dataSignals) {
    let matched = false;
    switch (sig.field) {
      case "company": matched = company.trim().length > 0; break;
      case "email": matched = email.trim().length > 0; break;
      case "linkedin": matched = linkedinUrl.trim().length > 0; break;
      case "position": matched = position.trim().length > 0; break;
      case "phone": matched = phone.trim().length > 0; break;
    }
    breakdown.push({ signal: sig.signal, points: sig.points, matched });
    if (matched) totalScore += sig.points;
  }

  // ── ICP fit signals (from enrichment data when available) ──
  for (const weight of ICP_SCORING_WEIGHTS) {
    let matched = false;

    switch (weight.field) {
      case "erpSystem": {
        const techStack = companyIntel?.techStack || [];
        matched = techStack.some(t => /epicor|infor/i.test(t));
        break;
      }
      case "tmsSystem": {
        const techStack = companyIntel?.techStack || [];
        matched = !techStack.some(t => /tms|mercurygate|kuebix|manhattan/i.test(t));
        if (weight.signal.includes("No dedicated")) matched = !matched || techStack.length === 0;
        else matched = false;
        break;
      }
      case "estimatedRevenue": {
        const rev = companyIntel?.estimatedRevenue || "";
        const revNum = parseFloat(rev.replace(/[^0-9.]/g, ""));
        if (weight.signal.includes("$200M-$1B")) matched = revNum >= 200 && revNum <= 1000;
        else if (weight.signal.includes("$30M-$200M")) matched = revNum >= 30 && revNum < 200;
        break;
      }
      case "position": {
        matched = /vp|vice president|director|svp|evp|chief|head of|president|owner|ceo|coo|cfo|cto|cpo|manager|supervisor|lead|principal/i.test(position);
        break;
      }
      case "importVolume":
      case "containerVolume":
      case "scHiring":
      case "tradeShow":
      case "websiteVisit": {
        const signals = rawData?.signals as string[] | undefined;
        matched = signals?.some(s => s.toLowerCase().includes(weight.field.toLowerCase())) ?? false;
        break;
      }
    }

    breakdown.push({ signal: weight.signal, points: weight.points, matched });
    if (matched) totalScore += weight.points;
  }

  // Buckets: 40+ auto-enroll, 20+ review, <20 parked
  const bucket: "auto-enroll" | "review" | "parked" = totalScore >= 40 ? "auto-enroll" : totalScore >= 20 ? "review" : "parked";
  return { totalScore, breakdown, bucket };
}

// ─── Seniority Detection ─────────────────────────────────────────

export function detectSeniority(position: string): SeniorityBucket {
  const pos = position.toLowerCase();
  for (const [bucket, config] of Object.entries(SENIORITY_BUCKETS)) {
    if (config.titles.some(t => pos.includes(t.toLowerCase()))) {
      return bucket as SeniorityBucket;
    }
  }
  return "manager";
}

// ─── Persona Detection ───────────────────────────────────────────

export function detectPersona(position: string): PersonaType {
  const pos = position.toLowerCase();
  if (/procurement|purchasing|cpo|chief procurement/i.test(pos)) return "vp-procurement";
  if (/supply chain|csco|logistics director|sc director/i.test(pos)) return "vp-supply-chain";
  if (/cfo|controller|finance|treasurer/i.test(pos)) return "cfo";
  if (/coo|ceo|owner|president|general manager/i.test(pos)) return "coo";
  if (/import|logistics manager|freight|customs/i.test(pos)) return "import-manager";
  if (/vp|vice president|svp/i.test(pos)) return "vp-supply-chain";
  if (/director/i.test(pos)) return "vp-procurement";
  return "vp-procurement";
}

// ─── Segment Key Builder ─────────────────────────────────────────

export function buildSegmentKey(categoryId: string, persona: PersonaType): string {
  return `${categoryId} | ${persona}`;
}

// ─── Time Formatting ─────────────────────────────────────────────

export function timeAgo(dateStr: string): string {
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
