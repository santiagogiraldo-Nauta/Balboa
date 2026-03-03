"use client";

/**
 * useAgentExecution — Client-side hook for agent-aware API calls
 *
 * Drop-in replacement for direct fetch() calls in existing components.
 * Checks the agent registry to see if an agent replaces the target route.
 * If yes, routes through /api/agents/execute. If no, falls through to
 * the original route. The component renders the result identically either way.
 *
 * Usage:
 * ```tsx
 * const { execute, loading, error } = useAgentExecution({
 *   fallbackRoute: "/api/generate-call-script",
 * });
 *
 * // In your click handler:
 * const result = await execute({ lead, language });
 * // result is the same shape regardless of whether an agent handled it
 * ```
 */

import { useState, useCallback } from "react";
import type { AgentExecutionState } from "@/lib/types-agents";
import { trackEventClient } from "@/lib/tracking";

interface UseAgentExecutionOptions {
  /** The original API route this call would go to (e.g., "/api/generate-call-script") */
  fallbackRoute: string;
  /** Whether to show verbose execution state (power-user mode) */
  verbose?: boolean;
}

interface UseAgentExecutionReturn {
  /** Execute the agent (or fall back to the original route) */
  execute: (input: Record<string, unknown>) => Promise<unknown>;
  /** Whether an execution is in progress */
  loading: boolean;
  /** Error message if execution failed */
  error: string | null;
  /** Execution state for verbose mode (agent name, timing, etc.) */
  executionState: AgentExecutionState | null;
  /** Whether the last execution was routed through an agent */
  wasAgentRouted: boolean;
}

export function useAgentExecution(
  options: UseAgentExecutionOptions
): UseAgentExecutionReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executionState, setExecutionState] =
    useState<AgentExecutionState | null>(null);
  const [wasAgentRouted, setWasAgentRouted] = useState(false);

  const execute = useCallback(
    async (input: Record<string, unknown>): Promise<unknown> => {
      setLoading(true);
      setError(null);
      setExecutionState(null);
      setWasAgentRouted(false);

      try {
        // Step 1: Check if an agent replaces this route
        let agentId: string | null = null;
        try {
          const resolveRes = await fetch("/api/agents/resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ route: options.fallbackRoute }),
          });
          if (resolveRes.ok) {
            const resolveData = await resolveRes.json();
            agentId = resolveData.agentId;
          }
        } catch {
          // If resolve fails, fall through to original route
          console.warn(
            "[useAgentExecution] resolve failed, falling back to original route"
          );
        }

        if (agentId) {
          // Step 2a: Route through Agent Hub
          setWasAgentRouted(true);

          if (options.verbose) {
            setExecutionState({
              executionId: `pending-${Date.now()}`,
              agentId,
              status: "running",
              steps: [
                {
                  stepId: "main",
                  agentId,
                  agentName: agentId,
                  status: "running",
                  startedAt: new Date().toISOString(),
                },
              ],
              input: input as Record<string, unknown>,
              startedAt: new Date().toISOString(),
              userId: "",
            });
          }

          const res = await fetch("/api/agents/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentId,
              ...input,
            }),
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Agent execution failed");

          if (options.verbose) {
            setExecutionState({
              executionId: data.executionId,
              agentId: data.agentId,
              agentName: data.agentName,
              status: "completed",
              steps: [
                {
                  stepId: "main",
                  agentId: data.agentId,
                  agentName: data.agentName,
                  status: "completed",
                  startedAt: new Date().toISOString(),
                  completedAt: new Date().toISOString(),
                  durationMs: data.durationMs,
                  tokensUsed: data.tokensUsed,
                },
              ],
              input: input as Record<string, unknown>,
              finalResult: data.result,
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              totalDurationMs: data.durationMs,
              totalTokensUsed: data.tokensUsed,
              userId: "",
            });
          }

          // Track routing
          trackEventClient({
            eventCategory: "agent",
            eventAction: "agent_executed",
            leadId: (input.lead as { id?: string })?.id,
            metadata: {
              agentId: data.agentId,
              route: options.fallbackRoute,
              durationMs: data.durationMs,
            },
          });

          return data.result;
        } else {
          // Step 2b: Fallback to original API route (existing behavior)
          const res = await fetch(options.fallbackRoute, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Request failed");

          return data;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);

        if (options.verbose && executionState) {
          setExecutionState((prev) =>
            prev
              ? {
                  ...prev,
                  status: "failed",
                  steps: prev.steps.map((s) => ({
                    ...s,
                    status: "failed" as const,
                    error: msg,
                  })),
                }
              : null
          );
        }

        throw err;
      } finally {
        setLoading(false);
      }
    },
    [options.fallbackRoute, options.verbose]
  );

  return { execute, loading, error, executionState, wasAgentRouted };
}
