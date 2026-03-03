/**
 * /api/agents/execute — Core Agent Execution Route
 *
 * Loads an agent definition from Supabase, builds the prompt using
 * template resolution, calls Claude, parses the result, and logs
 * the execution. Follows the exact same pattern as all existing
 * API routes (auth → prompt → Claude → parse → track → return).
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { trackEvent } from "@/lib/tracking";
import { BALBOA_ICP_CONTEXT, LANGUAGE_MODIFIERS } from "@/lib/balboa-context";
import {
  resolveTemplate,
  formatLeadData,
  formatDealData,
  parseClaudeJSON,
  generateExecutionId,
} from "@/lib/agent-utils";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    // 1. Auth check (same as all routes)
    const { user, supabase, error: authError } = await getAuthUser();
    if (authError) return authError;

    // 2. Parse input
    const { agentId, lead, deal, language, context, executionId } =
      await req.json();

    // 3. Validate
    if (!agentId) {
      return NextResponse.json(
        { error: "Missing agentId" },
        { status: 400 }
      );
    }

    // 4. Load agent from Supabase
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("*")
      .eq("agent_id", agentId)
      .eq("enabled", true)
      .single();

    if (agentError || !agent) {
      return NextResponse.json(
        { error: `Agent "${agentId}" not found or disabled` },
        { status: 404 }
      );
    }

    // 5. Build prompt using template resolution
    const langModifier =
      agent.supports_language && language
        ? LANGUAGE_MODIFIERS[language as keyof typeof LANGUAGE_MODIFIERS] || ""
        : "";

    const resolvedPrompt = resolveTemplate(agent.system_prompt, {
      BALBOA_CONTEXT: agent.inject_balboa_context ? BALBOA_ICP_CONTEXT : "",
      LEAD_DATA: lead ? formatLeadData(lead) : "",
      DEAL_DATA: deal ? formatDealData(deal) : "",
      LANGUAGE_MODIFIER: langModifier,
      CUSTOM_CONTEXT: context || "",
    });

    // 6. Call Claude (same pattern as all routes)
    const startTime = Date.now();
    const response = await anthropic.messages.create({
      model: agent.model || "claude-sonnet-4-20250514",
      max_tokens: agent.max_tokens || 2000,
      messages: [{ role: "user", content: resolvedPrompt }],
    });

    const durationMs = Date.now() - startTime;
    const rawText =
      response.content[0].type === "text" ? response.content[0].text : "";
    const tokensUsed = response.usage?.output_tokens || 0;

    // 7. Parse output (same robust pattern as existing routes)
    let parsed: unknown;
    if (agent.output_format === "json") {
      parsed = parseClaudeJSON(rawText);
      if (parsed === null) {
        parsed = { raw: rawText, parseError: true };
      }
    } else {
      parsed = rawText;
    }

    // 8. Generate execution ID
    const execId = executionId || generateExecutionId();

    // 9. Log execution to Supabase (fire-and-forget)
    if (user && supabase) {
      supabase
        .from("agent_executions")
        .insert([
          {
            user_id: user.id,
            execution_id: execId,
            agent_id: agent.agent_id,
            agent_name: agent.name,
            lead_id: lead?.id || null,
            deal_id: deal?.id || null,
            status: "completed",
            input: { lead: lead?.id, deal: deal?.id, language, context: context ? "provided" : null },
            result: parsed,
            duration_ms: durationMs,
            tokens_used: tokensUsed,
            model: agent.model || "claude-sonnet-4-20250514",
            completed_at: new Date().toISOString(),
          },
        ])
        .then(({ error }) => {
          if (error) console.error("[agent-execute] log error:", error.message);
        });

      // Track event (fire-and-forget, same pattern)
      trackEvent(supabase, user.id, {
        eventCategory: "agent" as never,
        eventAction: "agent_executed" as never,
        leadId: lead?.id,
        dealId: deal?.id,
        metadata: {
          agentId: agent.agent_id,
          agentName: agent.name,
          agentAuthor: agent.author_name,
          durationMs,
          tokensUsed,
          executionId: execId,
          outputFormat: agent.output_format,
        },
        source: "api",
      });
    }

    // 10. Return structured result
    return NextResponse.json({
      executionId: execId,
      agentId: agent.agent_id,
      agentName: agent.name,
      status: "completed",
      result: parsed,
      durationMs,
      tokensUsed,
    });
  } catch (error) {
    console.error("Agent execution error:", error);
    return NextResponse.json(
      { error: "Failed to execute agent" },
      { status: 500 }
    );
  }
}
