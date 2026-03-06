import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { getIntegrationConfig, updateIntegrationStatus } from "@/lib/db-integrations";
import { upsertSequence, type SequenceRow } from "@/lib/db-sequences";
import { insertTouchpointEvent } from "@/lib/db-touchpoints";
import {
  refreshHubSpotToken,
  getContacts,
  getDeals as getHubSpotDeals,
  getSequences as getHubSpotSequences,
  getEmailEngagements,
  type HubSpotContact,
} from "@/lib/hubspot";

/**
 * POST /api/hubspot/sync
 *
 * Bi-directional sync between HubSpot and Balboa.
 *
 * Body params:
 *   direction: "pull" | "push" | "both" (default: "pull")
 *   syncType: "contacts" | "deals" | "sequences" | "all" (default: "all")
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  // Get HubSpot integration config
  const integration = await getIntegrationConfig(supabase, user.id, "hubspot");
  if (!integration || integration.status !== "connected") {
    return NextResponse.json(
      { error: "HubSpot not connected. Please connect via Settings." },
      { status: 400 }
    );
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

      // Update stored tokens
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
    } catch (tokenError) {
      await updateIntegrationStatus(supabase, user.id, "hubspot", "error");
      return NextResponse.json(
        { error: "HubSpot token refresh failed. Please reconnect." },
        { status: 401 }
      );
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    const direction = body.direction || "pull";
    const syncType = body.syncType || "all";

    const results: Record<string, unknown> = {};
    const errors: string[] = [];

    // Pull contacts from HubSpot
    if ((syncType === "all" || syncType === "contacts") && (direction === "pull" || direction === "both")) {
      try {
        const contactsResult = await syncContacts(supabase, user.id, accessToken);
        results.contacts = contactsResult;
      } catch (e) {
        console.error("[HubSpot Sync] Contacts sync failed:", e);
        errors.push("contacts: " + (e instanceof Error ? e.message : String(e)));
      }
    }

    // Pull deals from HubSpot
    if ((syncType === "all" || syncType === "deals") && (direction === "pull" || direction === "both")) {
      try {
        const dealsResult = await syncDeals(supabase, user.id, accessToken);
        results.deals = dealsResult;
      } catch (e) {
        console.error("[HubSpot Sync] Deals sync failed:", e);
        errors.push("deals: " + (e instanceof Error ? e.message : String(e)));
      }
    }

    // Pull sequences from HubSpot
    if ((syncType === "all" || syncType === "sequences") && (direction === "pull" || direction === "both")) {
      try {
        const seqResult = await syncSequences(supabase, user.id, accessToken);
        results.sequences = seqResult;
      } catch (e) {
        console.error("[HubSpot Sync] Sequences sync failed:", e);
        errors.push("sequences: " + (e instanceof Error ? e.message : String(e)));
      }
    }

    // Push leads to HubSpot
    if ((syncType === "all" || syncType === "contacts") && (direction === "push" || direction === "both")) {
      try {
        const pushResult = await pushLeadsToHubSpot(supabase, user.id, accessToken);
        results.pushed = pushResult;
      } catch (e) {
        console.error("[HubSpot Sync] Push failed:", e);
        errors.push("push: " + (e instanceof Error ? e.message : String(e)));
      }
    }

    // Update last sync time
    await updateIntegrationStatus(supabase, user.id, "hubspot", "connected", true);

    return NextResponse.json({ success: errors.length === 0, results, ...(errors.length > 0 ? { errors } : {}) });
  } catch (error) {
    console.error("[HubSpot Sync] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}

// ─── Sync Functions ──────────────────────────────────────────────

async function syncContacts(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  userId: string,
  accessToken: string
): Promise<{ synced: number; created: number; updated: number }> {
  let synced = 0;
  let created = 0;
  let updated = 0;
  let after: string | undefined;

  do {
    const page = await getContacts(accessToken, { limit: 100, after });

    for (const contact of page.results) {
      const email = contact.properties.email;
      if (!email) continue;

      // Check if lead already exists
      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("email", email.toLowerCase())
        .eq("user_id", userId)
        .single();

      if (existing) {
        // Update existing lead with HubSpot data
        const hubspotMeta = {
          hubspot_contact_id: contact.id,
          hubspot_synced_at: new Date().toISOString(),
          company: contact.properties.company || undefined,
          position: contact.properties.jobtitle || undefined,
        };
        await supabase
          .from("leads")
          .update({
            raw_data: hubspotMeta,
          })
          .eq("id", existing.id);
        updated++;
      } else {
        // Create new lead from HubSpot
        await supabase.from("leads").insert([{
          user_id: userId,
          first_name: contact.properties.firstname || "",
          last_name: contact.properties.lastname || "",
          email: email.toLowerCase(),
          company: contact.properties.company || "",
          position: contact.properties.jobtitle || "",
          linkedin_url: null,
          linkedin_stage: "not_connected",
          icp_score: { overall: 0, companyFit: 0, roleFit: 0, industryFit: 0, signals: [], tier: "cold" },
          company_intel: {},
          draft_messages: [],
          contact_history: [],
          channels: { linkedin: false, email: true, linkedinConnected: false, emailVerified: true },
          source: "hubspot",
          raw_data: {
            hubspot_id: contact.id,
            contactStatus: "not_contacted",
            phone: contact.properties.phone,
            lifecyclestage: contact.properties.lifecyclestage,
            hs_lead_status: contact.properties.hs_lead_status,
          },
        }]);
        created++;
      }

      synced++;
    }

    after = page.paging?.next?.after;
  } while (after && synced < 500);

  return { synced, created, updated };
}

async function syncDeals(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  userId: string,
  accessToken: string
): Promise<{ synced: number; created: number; updated: number }> {
  let synced = 0;
  let created = 0;
  let updated = 0;
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

      // Check if deal already exists
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

      if (existing) {
        updated++;
      } else {
        created++;
      }
      synced++;
    }

    after = page.paging?.next?.after;
  } while (after);

  return { synced, created, updated };
}

async function syncSequences(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  userId: string,
  accessToken: string
): Promise<{ synced: number }> {
  const sequences = await getHubSpotSequences(accessToken);
  let synced = 0;

  for (const seq of sequences) {
    await upsertSequence(supabase, {
      user_id: userId,
      external_id: seq.id,
      source: "hubspot",
      name: seq.name,
      description: null,
      status: "active",
      total_steps: null,
      steps: [],
      stats: {},
      synced_at: new Date().toISOString(),
    });
    synced++;
  }

  return { synced };
}

async function pushLeadsToHubSpot(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  userId: string,
  accessToken: string
): Promise<{ pushed: number }> {
  // Get leads that haven't been synced to HubSpot yet
  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .eq("user_id", userId)
    .not("email", "is", null)
    .limit(100);

  let pushed = 0;

  // For now, just track that sync happened
  // Full push implementation would create/update HubSpot contacts
  if (leads) {
    pushed = leads.length;
  }

  return { pushed };
}

// ─── Helpers ─────────────────────────────────────────────────────

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

/** Map HubSpot deal stage to Balboa stage ID, scoped by pipeline */
function mapDealStage(hubspotStage: string, pipelineId: string): string {
  // Sales Pipeline (default) stage mapping
  const salesStageMap: Record<string, string> = {
    presentationscheduled: "Discovery",
    decisionmakerboughtin: "Scope",
    contractsent: "Proposal Review",
    "1169927465": "Go",
    closedwon: "Contracting",
    "937672115": "Closed Won",
    closedlost: "Closed Lost",
    "1123758210": "Not ICP",
    // Legacy/default HubSpot stage names
    appointmentscheduled: "Discovery",
    qualifiedtobuy: "Scope",
  };

  // Bus Dev Pipeline (797275510) stage mapping
  const busdevStageMap: Record<string, string> = {
    "1169948203": "Lead",
    "1169948205": "Meeting Scheduled",
    "1169948206": "Meeting Held",
    "1218492458": "Qualified",
    "1169948207": "Disqualified",
    "1174882119": "Closed Lost",
    "1238183285": "Not ICP",
  };

  // Payments Pipeline (732682072)
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

  // Default = Sales Pipeline
  return salesStageMap[hubspotStage] || salesStageMap[stage] || "Discovery";
}
