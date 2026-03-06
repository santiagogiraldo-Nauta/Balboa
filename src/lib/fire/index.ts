// ============================================================
// Balboa Fire — Orchestrator
// Single entry point for the Fire autonomy engine.
// Called from track-touchpoint.ts after checkForSignals().
//
// Coordinates: reply classification → branching rules → signal triggers
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";
import { classifyReply } from "./reply-classifier";
import { evaluateBranchingRules } from "./branching-engine";
import { evaluateSignalTriggers } from "./signal-triggers";
import type { FireEngineResult, ClassificationResult } from "./types";
import type { TrackTouchpointInput } from "../track-touchpoint";

/**
 * Main Fire engine entry point.
 * Called after every touchpoint event for leads with fire-enabled enrollments.
 *
 * Flow:
 * 1. If inbound reply → classify the reply intent
 * 2. Evaluate branching rules (uses classification if available)
 * 3. Evaluate signal triggers (for non-reply events)
 * 4. Return summary of actions created
 *
 * This function is NON-BLOCKING by design.
 * Errors are caught and logged — they never break the main tracking pipeline.
 */
export async function checkFireRules(
  supabase: SupabaseClient,
  input: TrackTouchpointInput,
  touchpointId: string
): Promise<FireEngineResult> {
  const result: FireEngineResult = {
    actionsCreated: 0,
    classificationsCreated: 0,
    rulesEvaluated: 0,
    errors: [],
  };

  try {
    let classification: ClassificationResult | null = null;

    // ── Step 1: Classify inbound replies ──
    if (input.eventType === "replied" && input.direction === "inbound") {
      try {
        classification = await classifyReply(supabase, {
          userId: input.userId,
          leadId: input.leadId,
          touchpointEventId: touchpointId,
          subject: input.subject || "",
          bodyPreview: input.bodyPreview || "",
        });

        if (classification) {
          result.classificationsCreated++;
        }
      } catch (err) {
        const msg = `Reply classification error: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[fire] ${msg}`);
        result.errors.push(msg);
      }
    }

    // ── Step 2: Evaluate branching rules ──
    try {
      const branchResults = await evaluateBranchingRules(
        supabase,
        input,
        touchpointId,
        classification
      );

      result.rulesEvaluated += branchResults.length;
      result.actionsCreated += branchResults.filter(r => r.matched && r.fireActionId).length;
    } catch (err) {
      const msg = `Branching engine error: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[fire] ${msg}`);
      result.errors.push(msg);
    }

    // ── Step 3: Evaluate signal triggers (skip for replies — handled by classifier) ──
    if (input.eventType !== "replied") {
      try {
        const signalActions = await evaluateSignalTriggers(
          supabase,
          input,
          touchpointId,
          classification
        );
        result.actionsCreated += signalActions;
      } catch (err) {
        const msg = `Signal trigger error: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[fire] ${msg}`);
        result.errors.push(msg);
      }
    }

    if (result.actionsCreated > 0 || result.classificationsCreated > 0) {
      console.log(
        `[fire] Engine complete: ${result.actionsCreated} actions, ` +
        `${result.classificationsCreated} classifications, ` +
        `${result.rulesEvaluated} rules evaluated` +
        `${result.errors.length ? ` (${result.errors.length} errors)` : ""}`
      );
    }
  } catch (err) {
    const msg = `Fire orchestrator error: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[fire] ${msg}`);
    result.errors.push(msg);
  }

  return result;
}

// Re-export key functions for direct use
export { classifyReply } from "./reply-classifier";
export { evaluateBranchingRules, checkSilenceRules } from "./branching-engine";
export { evaluateSignalTriggers } from "./signal-triggers";
export type { FireEngineResult, ClassificationResult } from "./types";
