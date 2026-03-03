/**
 * /api/agents/register — Create or Update Agent
 *
 * Used by both:
 * 1. The Balboa UI (Agent Hub "Create Agent" form)
 * 2. Programmatic pushes from colleagues' Claude Code sessions
 *
 * If an agent with the given agentId already exists and belongs to
 * the current user, it updates. Otherwise, it creates a new one.
 *
 * Ownership is enforced: only the author can update their agent.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { trackEvent } from "@/lib/tracking";
import { toAgentSlug } from "@/lib/agent-utils";

export async function POST(req: NextRequest) {
  try {
    const { user, supabase, error: authError } = await getAuthUser();
    if (authError) return authError;

    const body = await req.json();

    // Validate required fields
    if (!body.name || !body.systemPrompt) {
      return NextResponse.json(
        { error: "Missing required fields: name, systemPrompt" },
        { status: 400 }
      );
    }

    // Generate slug if not provided
    const agentId = body.agentId || toAgentSlug(body.name);

    // Get user profile for author name
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();

    const authorName = profile?.full_name || profile?.email || "Unknown";

    // Check if agent already exists
    const { data: existing } = await supabase
      .from("agents")
      .select("id, author_id")
      .eq("agent_id", agentId)
      .single();

    if (existing) {
      // Update existing agent (ownership check)
      if (existing.author_id !== user.id) {
        // Check if user is a collaborator with edit role
        const { data: collab } = await supabase
          .from("agent_collaborators")
          .select("role")
          .eq("agent_id", existing.id)
          .eq("user_id", user.id)
          .eq("role", "editor")
          .single();

        if (!collab) {
          return NextResponse.json(
            { error: "You don't have permission to edit this agent" },
            { status: 403 }
          );
        }
      }

      const { data: updated, error: updateError } = await supabase
        .from("agents")
        .update({
          name: body.name,
          description: body.description || "",
          category: body.category || "custom",
          input_type: body.inputType || "lead",
          system_prompt: body.systemPrompt,
          output_format: body.outputFormat || "json",
          output_schema: body.outputSchema || null,
          model: body.model || "claude-sonnet-4-20250514",
          max_tokens: body.maxTokens || 2000,
          inject_balboa_context: body.injectBalboaContext ?? true,
          supports_language: body.supportsLanguage ?? true,
          tags: body.tags || [],
          enabled: body.enabled ?? true,
          replaces: body.replaces || null,
          metadata: body.metadata || {},
          version: body.version || "1.0.0",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (updateError) {
        console.error("Agent update error:", updateError);
        return NextResponse.json(
          { error: "Failed to update agent" },
          { status: 500 }
        );
      }

      // Track event
      trackEvent(supabase, user.id, {
        eventCategory: "agent" as never,
        eventAction: "agent_updated" as never,
        metadata: { agentId, agentName: body.name },
        source: "api",
      });

      return NextResponse.json({
        agent: updated,
        action: "updated",
      });
    } else {
      // Create new agent
      const { data: created, error: createError } = await supabase
        .from("agents")
        .insert([
          {
            agent_id: agentId,
            name: body.name,
            description: body.description || "",
            author_id: user.id,
            author_name: authorName,
            version: body.version || "1.0.0",
            category: body.category || "custom",
            input_type: body.inputType || "lead",
            system_prompt: body.systemPrompt,
            output_format: body.outputFormat || "json",
            output_schema: body.outputSchema || null,
            model: body.model || "claude-sonnet-4-20250514",
            max_tokens: body.maxTokens || 2000,
            inject_balboa_context: body.injectBalboaContext ?? true,
            supports_language: body.supportsLanguage ?? true,
            tags: body.tags || [],
            enabled: body.enabled ?? true,
            replaces: body.replaces || null,
            is_builtin: false,
            metadata: body.metadata || {},
          },
        ])
        .select()
        .single();

      if (createError) {
        console.error("Agent create error:", createError);
        return NextResponse.json(
          { error: "Failed to create agent" },
          { status: 500 }
        );
      }

      // Track event
      trackEvent(supabase, user.id, {
        eventCategory: "agent" as never,
        eventAction: "agent_created" as never,
        metadata: { agentId, agentName: body.name },
        source: "api",
      });

      return NextResponse.json({
        agent: created,
        action: "created",
      });
    }
  } catch (error) {
    console.error("Agent register error:", error);
    return NextResponse.json(
      { error: "Failed to register agent" },
      { status: 500 }
    );
  }
}

/**
 * DELETE — Remove an agent (owner only)
 */
export async function DELETE(req: NextRequest) {
  try {
    const { user, supabase, error: authError } = await getAuthUser();
    if (authError) return authError;

    const { agentId } = await req.json();

    if (!agentId) {
      return NextResponse.json(
        { error: "Missing agentId" },
        { status: 400 }
      );
    }

    // Ownership check
    const { data: agent } = await supabase
      .from("agents")
      .select("id, author_id, is_builtin")
      .eq("agent_id", agentId)
      .single();

    if (!agent) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }

    if (agent.is_builtin) {
      return NextResponse.json(
        { error: "Cannot delete built-in agents" },
        { status: 403 }
      );
    }

    if (agent.author_id !== user.id) {
      return NextResponse.json(
        { error: "Only the agent owner can delete it" },
        { status: 403 }
      );
    }

    const { error: deleteError } = await supabase
      .from("agents")
      .delete()
      .eq("id", agent.id);

    if (deleteError) {
      return NextResponse.json(
        { error: "Failed to delete agent" },
        { status: 500 }
      );
    }

    // Track event
    trackEvent(supabase, user.id, {
      eventCategory: "agent" as never,
      eventAction: "agent_deleted" as never,
      metadata: { agentId },
      source: "api",
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Agent delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete agent" },
      { status: 500 }
    );
  }
}
