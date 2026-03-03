/**
 * Agent Hub Utilities
 *
 * Template resolution, lead/deal formatting, JSON parsing.
 * These follow the exact patterns already used in existing API routes
 * (see generate-call-script/route.ts for the reference pattern).
 */

import type { Lead, Deal } from "./types";

// ─── Template Resolution ─────────────────────────────────────────

/**
 * Replace {{PLACEHOLDER}} tokens in a template string with values.
 * This is the core mechanism that makes agent prompts portable:
 * colleagues write prompts with {{LEAD_DATA}} and Balboa fills them in.
 */
export function resolveTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let resolved = template;
  for (const [key, value] of Object.entries(variables)) {
    resolved = resolved.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return resolved;
}

// ─── Lead Data Formatting ────────────────────────────────────────

/**
 * Format a Lead object into the standard text block used by all existing prompts.
 * Mirrors the exact format in generate-call-script/route.ts (lines 26-41).
 */
export function formatLeadData(lead: Partial<Lead>): string {
  return `
Name: ${lead.firstName || ""} ${lead.lastName || ""}
Company: ${lead.company || "Unknown"}
Position: ${lead.position || "Unknown"}
ICP Score: ${lead.icpScore?.overall ?? "Unknown"}/100
Tier: ${lead.icpScore?.tier ?? "Unknown"}
Industry: ${lead.companyIntel?.industry ?? "Unknown"}
Company Revenue: ${lead.companyIntel?.estimatedRevenue ?? "Unknown"}
Employee Count: ${lead.companyIntel?.employeeCount ?? "Unknown"}
Pain Points: ${(lead.companyIntel?.painPoints || []).join(", ") || "Unknown"}
Tech Stack: ${(lead.companyIntel?.techStack || []).join(", ") || "Unknown"}
Contact Status: ${lead.contactStatus || "not_contacted"}
Previous Notes: ${lead.notes || "None"}
Email: ${lead.email || "N/A"}
LinkedIn: ${lead.linkedinUrl || "N/A"}
`.trim();
}

// ─── Deal Data Formatting ────────────────────────────────────────

/**
 * Format a Deal object into text for agent prompts.
 */
export function formatDealData(deal: Partial<Deal>): string {
  return `
Deal: ${deal.dealName || "Unknown"}
Stage: ${deal.dealStage || "Unknown"}
Amount: ${deal.amount ? `$${deal.amount.toLocaleString()}` : "Unknown"}
Probability: ${deal.probability ? `${deal.probability}%` : "Unknown"}
Health: ${deal.dealHealth || "Unknown"}
Next Action: ${deal.nextAction || "None"}
Next Action Date: ${deal.nextActionDate || "N/A"}
`.trim();
}

// ─── JSON Parsing ────────────────────────────────────────────────

/**
 * Robust JSON extraction from Claude responses.
 * Follows the exact pattern used across all existing API routes:
 * 1. Strip markdown code fences
 * 2. Find the first JSON object
 * 3. Parse it
 * 4. Return null on failure (caller handles fallback)
 */
export function parseClaudeJSON(rawText: string): unknown | null {
  try {
    // Strip markdown code fences
    let jsonStr = rawText
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "");

    // Find the first JSON object or array
    const jsonMatch = jsonStr.match(/[\[{][\s\S]*[\]}]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    return JSON.parse(jsonStr.trim());
  } catch {
    return null;
  }
}

// ─── ID Generation ───────────────────────────────────────────────

/**
 * Generate a unique execution ID.
 * Follows the pattern used in existing routes (e.g., script-${Date.now()}-...).
 */
export function generateExecutionId(prefix: string = "exec"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ─── Agent ID Slug ───────────────────────────────────────────────

/**
 * Convert a human-readable name into a URL-safe agent ID slug.
 * e.g. "Carlos Competitor Intel" → "carlos-competitor-intel"
 */
export function toAgentSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}
