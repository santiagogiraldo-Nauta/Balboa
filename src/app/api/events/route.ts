import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { mockEvents } from "@/lib/mock-events";
import { config } from "@/lib/config";

export async function GET(req: NextRequest) {
  try {
    const { error: authError } = await getAuthUser();
    if (authError) return authError;

    const { isSandbox } = config;

    // In production, return empty — future: query Supabase sales_events table
    // In sandbox/demo mode, return mock events for demoing
    void req; // acknowledge param
    return NextResponse.json({ events: isSandbox ? mockEvents : [] });
  } catch (error) {
    console.error("Events API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 }
    );
  }
}
