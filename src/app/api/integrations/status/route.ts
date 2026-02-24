import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { getAllIntegrationStatuses } from "@/lib/integrations";

// GET: Returns connection status of all integrations
export async function GET() {
  try {
    const { user } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const statuses = await getAllIntegrationStatuses();

    return NextResponse.json({
      integrations: statuses,
      summary: {
        total: statuses.length,
        connected: statuses.filter(s => s.connected).length,
        enabled: statuses.filter(s => s.enabled).length,
      },
    });
  } catch (error) {
    console.error("Integrations status error:", error);
    return NextResponse.json({ error: "Failed to fetch integration statuses" }, { status: 500 });
  }
}
