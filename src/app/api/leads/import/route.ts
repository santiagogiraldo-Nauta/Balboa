import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { upsertLeads } from "@/lib/db";
import type { Lead } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { leads: incoming } = body;

    if (!Array.isArray(incoming) || incoming.length === 0) {
      return NextResponse.json({ error: "leads array required" }, { status: 400 });
    }

    // Convert incoming data to Lead objects
    const leadsToUpsert: Lead[] = incoming.map((item: Record<string, unknown>) => ({
      id: randomUUID(),
      firstName: (item.firstName as string) || "",
      lastName: (item.lastName as string) || "",
      company: (item.company as string) || "",
      position: (item.position as string) || "",
      connectedOn: new Date().toISOString(),
      email: (item.email as string) || undefined,
      linkedinUrl: (item.linkedinUrl as string) || undefined,
      icpScore: (item.icpScore as Lead["icpScore"]) || {
        overall: 0,
        companyFit: 0,
        roleFit: 0,
        industryFit: 0,
        signals: [],
        tier: "cold" as const,
      },
      status: "new" as const,
      notes: "",
      draftMessages: [],
      engagementActions: [],
      companyIntel: undefined,
      channels: {
        linkedin: !!(item.linkedinUrl),
        email: !!(item.email),
        linkedinConnected: false,
        emailVerified: false,
      },
      emailCampaigns: [],
      touchpointTimeline: [],
      callLogs: [],
      meetings: [],
      contactStatus: "not_contacted" as const,
      outreachSource: (item.source as string) || "list_builder",
      linkedinStage: "not_connected" as const,
      prepKits: [],
      videoPreps: [],
      battleCards: [],
    }));

    const saved = await upsertLeads(supabase, user.id, leadsToUpsert);

    return NextResponse.json({
      success: true,
      imported: saved.length,
      leads: saved.map((l) => ({ id: l.id, name: `${l.firstName} ${l.lastName}`.trim(), company: l.company })),
    });
  } catch (error) {
    console.error("Error importing leads:", error);
    return NextResponse.json({ error: "Failed to import leads" }, { status: 500 });
  }
}
