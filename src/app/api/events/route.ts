import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { mockEvents } from "@/lib/mock-events";

export async function GET(req: NextRequest) {
  try {
    const { error: authError } = await getAuthUser();
    if (authError) return authError;

    // Return mock events for now
    // Future: query Supabase sales_events table
    void req; // acknowledge param
    return NextResponse.json({ events: mockEvents });
  } catch (error) {
    console.error("Events API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 }
    );
  }
}
