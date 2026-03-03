/**
 * Agent Hub Type Definitions
 *
 * Defines the type system for the Agent Hub feature:
 * - AgentDefinition: what an agent IS (prompt, config, permissions)
 * - PipelineDefinition: ordered chain of agents (Phase 2)
 * - AgentExecutionState: runtime state of an agent execution
 * - Permissions: ownership, collaboration, admin access
 */

import type { SupportedLanguage } from "./types";

// ─── Core Enums ──────────────────────────────────────────────────

export type AgentInputType = "lead" | "deal" | "lead+deal" | "freeform";
export type AgentOutputFormat = "json" | "text" | "markdown";
export type AgentCategory =
  | "research"
  | "outreach"
  | "analysis"
  | "enablement"
  | "strategy"
  | "custom";

export type AgentCollaboratorRole = "editor" | "viewer";
export type AgentUserRole = "owner" | "editor" | "viewer" | "admin";

// ─── Agent Definition ────────────────────────────────────────────

export interface AgentDefinition {
  /** UUID from Supabase */
  id: string;
  /** Human-readable slug, e.g. "carlos-competitor-intel" */
  agentId: string;
  /** Display name shown in UI */
  name: string;
  /** Short description of what this agent does */
  description: string;
  /** User UUID of the creator */
  authorId: string;
  /** Display name of the creator */
  authorName: string;
  /** Version string for tracking changes */
  version: string;
  /** Category for grouping in Agent Hub UI */
  category: AgentCategory;
  /** What kind of input this agent expects */
  inputType: AgentInputType;
  /**
   * The system prompt — the core of the agent.
   * Supports placeholder tokens:
   *  {{BALBOA_CONTEXT}} - Balboa ICP context
   *  {{LEAD_DATA}} - Formatted lead data
   *  {{DEAL_DATA}} - Formatted deal data
   *  {{LANGUAGE_MODIFIER}} - Language instruction
   *  {{CUSTOM_CONTEXT}} - Additional context from caller
   */
  systemPrompt: string;
  /** Expected output format */
  outputFormat: AgentOutputFormat;
  /** Optional JSON schema describing expected output structure */
  outputSchema?: Record<string, unknown>;
  /** Claude model to use (defaults to claude-sonnet-4-20250514) */
  model?: string;
  /** Max tokens for this agent's call (defaults to 2000) */
  maxTokens?: number;
  /** Whether to auto-inject BALBOA_ICP_CONTEXT */
  injectBalboaContext: boolean;
  /** Whether this agent supports language modifiers */
  supportsLanguage: boolean;
  /** Tags for search/filter */
  tags: string[];
  /** Whether this agent is currently active */
  enabled: boolean;
  /** true for Balboa's own built-in agents */
  isBuiltin: boolean;
  /**
   * Optional: maps this agent to an existing API route.
   * When set, clicking that button routes through this agent.
   * e.g. "/api/generate-call-script"
   */
  replaces?: string;
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
  /** ISO date string */
  createdAt: string;
  /** ISO date string */
  updatedAt: string;
  /** Current user's role (populated at query time) */
  userRole?: AgentUserRole;
}

// ─── Agent Collaborator ──────────────────────────────────────────

export interface AgentCollaborator {
  id: string;
  agentId: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  role: AgentCollaboratorRole;
  invitedBy: string;
  createdAt: string;
}

// ─── Pipeline Definition (Phase 2, designed now) ─────────────────

export type PipelineExecutionMode = "sequential" | "parallel";

export interface PipelineStep {
  /** Agent ID to execute */
  agentId: string;
  /** Unique step identifier within this pipeline */
  stepId: string;
  /** Human-readable label for the progress UI */
  label: string;
  /**
   * Maps previous step's output fields into this step's input.
   * Uses dot-notation: e.g. { "context": "result.approach.keyTalkingPoints" }
   * If absent, the original pipeline input is passed through.
   */
  inputMapping?: Record<string, string>;
}

export interface PipelineDefinition {
  id: string;
  name: string;
  description: string;
  author: string;
  mode: PipelineExecutionMode;
  steps: PipelineStep[];
  inputType: AgentInputType;
  tags: string[];
  enabled: boolean;
  replaces?: string;
}

// ─── Execution State ─────────────────────────────────────────────

export type AgentExecutionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface AgentExecutionStep {
  stepId: string;
  agentId: string;
  agentName: string;
  status: AgentExecutionStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  result?: unknown;
  error?: string;
  tokensUsed?: number;
}

export interface AgentExecutionState {
  executionId: string;
  /** For pipeline executions */
  pipelineId?: string;
  /** For single-agent executions */
  agentId?: string;
  agentName?: string;
  status: AgentExecutionStatus;
  steps: AgentExecutionStep[];
  input: Record<string, unknown>;
  finalResult?: unknown;
  startedAt: string;
  completedAt?: string;
  totalDurationMs?: number;
  totalTokensUsed?: number;
  userId: string;
  leadId?: string;
  dealId?: string;
}

// ─── API Request/Response Types ──────────────────────────────────

export interface AgentExecuteRequest {
  agentId: string;
  lead?: Record<string, unknown>;
  deal?: Record<string, unknown>;
  language?: SupportedLanguage;
  context?: string;
  executionId?: string;
}

export interface AgentExecuteResponse {
  executionId: string;
  agentId: string;
  agentName: string;
  status: "completed" | "failed";
  result: unknown;
  durationMs: number;
  tokensUsed: number;
  error?: string;
}

export interface AgentRegisterRequest {
  agentId: string;
  name: string;
  description?: string;
  category?: AgentCategory;
  inputType?: AgentInputType;
  systemPrompt: string;
  outputFormat?: AgentOutputFormat;
  outputSchema?: Record<string, unknown>;
  model?: string;
  maxTokens?: number;
  injectBalboaContext?: boolean;
  supportsLanguage?: boolean;
  tags?: string[];
  enabled?: boolean;
  replaces?: string;
}

export interface AgentResolveResponse {
  agentId: string | null;
  pipelineId?: string | null;
  type: "agent" | "pipeline" | "fallback";
}
