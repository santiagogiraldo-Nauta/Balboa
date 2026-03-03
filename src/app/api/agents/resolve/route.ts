/**
 * /api/agents/resolve — Route Resolution
 *
 * Lightweight endpoint that checks if any agent is registered to
 * replace a given API route. Used by the useAgentExecution hook
 * to decide whether to route through the Agent Hub or fall back
 * to the original hardcoded route.
 *
 * This is fast — no AI calls, just a Supabase query.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";

export async function POST(req: NextRequest) {
  try {
    const { user, supabase, error: authError } = await getAuthUser();
    if (authError) return authError;

    const { route } = await req.json();

    if (!route) {
      return NextResponse.json(
        { agentId: null, type: "fallback" as const },
        { status: 200 }
      );
    }

    // Check if any enabled agent replaces this route
    const { data: agent } = await supabase
      .from("agents")
      .select("agent_id")
      .eq("replaces", route)
      .eq("enabled", true)
      .limit(1)
      .single();

    if (agent) {
      return NextResponse.json({
        agentId: agent.agent_id,
        type: "agent" as const,
      });
    }

    // No agent found — caller should use the original route
    return NextResponse.json({
      agentId: null,
      type: "fallback" as const,
    });
  } catch (error) {
    console.error("Agent resolve error:", error);
    // On error, fall back to original route (don't break existing functionality)
    return NextResponse.json({
      agentId: null,
      type: "fallback" as const,
    });
  }
}
