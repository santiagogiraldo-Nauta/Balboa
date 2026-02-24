import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { CONTENT_SUGGESTION_PROMPT } from "@/lib/balboa-context";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { trackEvent } from "@/lib/tracking";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST() {
  try {
    const { user, supabase, error: authError } = await getAuthUser();
    if (authError) return authError;
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: CONTENT_SUGGESTION_PROMPT + `

Generate 3 different LinkedIn post suggestions targeting different personas. Return a JSON array of 3 objects. Return ONLY valid JSON array, no markdown.`
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const suggestions = (Array.isArray(parsed) ? parsed : [parsed]).map((s: Record<string, unknown>, i: number) => ({
      id: `content-${Date.now()}-${i}`,
      ...s,
      createdAt: new Date().toISOString(),
    }));

    // Track event (fire-and-forget)
    if (user && supabase) {
      trackEvent(supabase, user.id, {
        eventCategory: "outreach",
        eventAction: "content_suggestions_generated",
        numericValue: suggestions.length,
        source: "api",
      });
    }

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Content suggestion error:", error);
    return NextResponse.json({ error: "Failed to generate suggestions" }, { status: 500 });
  }
}
