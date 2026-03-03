/**
 * /api/agents/list — List Accessible Agents
 *
 * Returns all agents the current user can access:
 * - Agents they own
 * - Agents shared with them (via agent_collaborators)
 * - Built-in agents (available to everyone)
 *
 * Each agent includes the user's role (owner/editor/viewer).
 * Admins will see all agents (admin check via profiles table in Phase 2).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";

export async function GET(req: NextRequest) {
  try {
    const { user, supabase, error: authError } = await getAuthUser();
    if (authError) return authError;

    // Parse optional filters from query params
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const enabledOnly = searchParams.get("enabled") !== "false";

    // Fetch all agents visible to this user (RLS handles visibility)
    let query = supabase
      .from("agents")
      .select("*")
      .order("created_at", { ascending: false });

    if (category) {
      query = query.eq("category", category);
    }
    if (enabledOnly) {
      query = query.eq("enabled", true);
    }

    const { data: agents, error: agentsError } = await query;

    if (agentsError) {
      console.error("Agent list error:", agentsError);
      return NextResponse.json(
        { error: "Failed to list agents" },
        { status: 500 }
      );
    }

    // Fetch collaborations for this user
    const { data: collaborations } = await supabase
      .from("agent_collaborators")
      .select("agent_id, role")
      .eq("user_id", user.id);

    const collabMap = new Map<string, string>();
    if (collaborations) {
      for (const c of collaborations) {
        collabMap.set(c.agent_id, c.role);
      }
    }

    // Annotate each agent with the user's role
    const annotated = (agents || []).map((agent) => {
      let userRole: string;
      if (agent.author_id === user.id) {
        userRole = "owner";
      } else if (collabMap.has(agent.id)) {
        userRole = collabMap.get(agent.id)!;
      } else if (agent.is_builtin) {
        userRole = "viewer";
      } else {
        userRole = "viewer"; // Visible via RLS but no special role
      }

      return {
        id: agent.id,
        agentId: agent.agent_id,
        name: agent.name,
        description: agent.description,
        authorId: agent.author_id,
        authorName: agent.author_name,
        version: agent.version,
        category: agent.category,
        inputType: agent.input_type,
        systemPrompt: agent.system_prompt,
        outputFormat: agent.output_format,
        outputSchema: agent.output_schema,
        model: agent.model,
        maxTokens: agent.max_tokens,
        injectBalboaContext: agent.inject_balboa_context,
        supportsLanguage: agent.supports_language,
        tags: agent.tags,
        enabled: agent.enabled,
        isBuiltin: agent.is_builtin,
        replaces: agent.replaces,
        metadata: agent.metadata,
        createdAt: agent.created_at,
        updatedAt: agent.updated_at,
        userRole,
      };
    });

    return NextResponse.json({ agents: annotated });
  } catch (error) {
    console.error("Agent list error:", error);
    return NextResponse.json(
      { error: "Failed to list agents" },
      { status: 500 }
    );
  }
}
