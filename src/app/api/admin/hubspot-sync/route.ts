import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  refreshHubSpotToken,
  getDeals as getHubSpotDeals,
} from "@/lib/hubspot";

/**
 * POST /api/admin/hubspot-sync
 *
 * Service-level HubSpot sync endpoint (no browser auth needed).
 * Protected by service role key.
 *
 * Body: { secret: string, userId: string, syncType?: "deals" }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { secret, userId } = body;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret || secret !== serviceKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey!,
    { db: { schema: "public" }, auth: { persistSession: false } }
  );

  // Get HubSpot integration config
  const { data: integration } = await supabase
    .from("integration_configs")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "hubspot")
    .eq("status", "connected")
    .single();

  if (!integration) {
    return NextResponse.json({ error: "HubSpot not connected for this user" }, { status: 400 });
  }

  const config = integration.config as Record<string, unknown>;
  let accessToken = config.access_token as string;
  const refreshToken = config.refresh_token as string;
  const expiresAt = config.expires_at as number;

  // Refresh token if expired
  if (Date.now() > expiresAt - 300000) {
    try {
      const newTokens = await refreshHubSpotToken(refreshToken);
      accessToken = newTokens.accessToken;

      await supabase
        .from("integration_configs")
        .update({
          config: {
            ...config,
            access_token: newTokens.accessToken,
            refresh_token: newTokens.refreshToken,
            expires_at: newTokens.expiresAt,
          },
        })
        .eq("id", integration.id);
    } catch (e) {
      return NextResponse.json({ error: "Token refresh failed: " + String(e) }, { status: 401 });
    }
  }

  // Sync deals
  try {
    const result = await syncDealsService(supabase, userId, accessToken);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("[Admin HubSpot Sync] Error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** Map HubSpot pipeline ID to Balboa pipeline name */
function mapPipeline(hubspotPipelineId: string): string {
  const pipelineMap: Record<string, string> = {
    default: "sales",
    "797275510": "busdev",
    "732682072": "payments",
    "141784440": "partnerships",
    "753706766": "referrals",
  };
  return pipelineMap[hubspotPipelineId] || "sales";
}

/** Map HubSpot deal stage to Balboa stage name, scoped by pipeline */
function mapDealStage(hubspotStage: string, pipelineId: string): string {
  const salesStageMap: Record<string, string> = {
    presentationscheduled: "Discovery",
    decisionmakerboughtin: "Scope",
    contractsent: "Proposal Review",
    "1169927465": "Go",
    closedwon: "Contracting",
    "937672115": "Closed Won",
    closedlost: "Closed Lost",
    "1123758210": "Not ICP",
    appointmentscheduled: "Discovery",
    qualifiedtobuy: "Scope",
  };

  const busdevStageMap: Record<string, string> = {
    "1169948203": "Lead",
    "1169948205": "Meeting Scheduled",
    "1169948206": "Meeting Held",
    "1218492458": "Qualified",
    "1169948207": "Disqualified",
    "1174882119": "Closed Lost",
    "1238183285": "Not ICP",
  };

  const paymentsStageMap: Record<string, string> = {
    "1067254188": "Closed Won",
    "1067254189": "Closed Lost",
  };

  const stage = hubspotStage?.toLowerCase() || "";

  if (pipelineId === "797275510") {
    return busdevStageMap[hubspotStage] || busdevStageMap[stage] || "Lead";
  }
  if (pipelineId === "732682072") {
    return paymentsStageMap[hubspotStage] || paymentsStageMap[stage] || hubspotStage;
  }
  return salesStageMap[hubspotStage] || salesStageMap[stage] || "Discovery";
}

async function syncDealsService(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  accessToken: string
): Promise<{ synced: number; created: number; updated: number; pipelines: Record<string, number> }> {
  let synced = 0;
  let created = 0;
  let updated = 0;
  const pipelines: Record<string, number> = {};
  let after: string | undefined;

  do {
    const page = await getHubSpotDeals(accessToken, {
      limit: 100,
      after,
      properties: ["dealname", "amount", "dealstage", "pipeline", "closedate", "hubspot_owner_id"],
    });

    for (const deal of page.results) {
      const pipelineId = deal.properties.pipeline || "default";
      const pipeline = mapPipeline(pipelineId);
      const dealStage = mapDealStage(deal.properties.dealstage || "", pipelineId);

      pipelines[pipeline] = (pipelines[pipeline] || 0) + 1;

      const { data: existing } = await supabase
        .from("deals")
        .select("id")
        .eq("hubspot_deal_id", deal.id)
        .eq("user_id", userId)
        .single();

      const dealData = {
        user_id: userId,
        deal_name: deal.properties.dealname || "Untitled Deal",
        amount: deal.properties.amount ? parseFloat(deal.properties.amount) : null,
        deal_stage: dealStage,
        pipeline,
        close_date: deal.properties.closedate || null,
        hubspot_owner_id: deal.properties.hubspot_owner_id || null,
        hubspot_deal_id: deal.id,
        hubspot_last_sync: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await supabase.from("deals").upsert(dealData, { onConflict: "hubspot_deal_id" });

      if (existing) updated++;
      else created++;
      synced++;
    }

    after = page.paging?.next?.after;
  } while (after);

  return { synced, created, updated, pipelines };
}
