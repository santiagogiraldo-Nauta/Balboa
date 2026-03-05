import { SupabaseClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────

export interface IntegrationConfigRow {
  id: string;
  user_id: string;
  platform: string;
  config: Record<string, unknown>;
  status: "connected" | "disconnected" | "error";
  last_sync: string | null;
  created_at: string;
}

export type IntegrationPlatform =
  | "amplemarket"
  | "hubspot"
  | "aircall"
  | "clay"
  | "gmail"
  | "fireflies"
  | "apify"
  | "n8n";

// ─── CRUD ─────────────────────────────────────────────────────────

export async function getIntegrationConfig(
  supabase: SupabaseClient,
  userId: string,
  platform: IntegrationPlatform
): Promise<IntegrationConfigRow | null> {
  const { data, error } = await supabase
    .from("integration_configs")
    .select("*")
    .eq("user_id", userId)
    .eq("platform", platform)
    .single();

  if (error) return null;
  return data;
}

export async function getAllIntegrations(
  supabase: SupabaseClient,
  userId: string
): Promise<IntegrationConfigRow[]> {
  const { data, error } = await supabase
    .from("integration_configs")
    .select("*")
    .eq("user_id", userId)
    .order("platform");

  if (error) {
    console.error("[db-integrations] Error fetching integrations:", error);
    return [];
  }
  return data || [];
}

export async function upsertIntegrationConfig(
  supabase: SupabaseClient,
  userId: string,
  platform: IntegrationPlatform,
  config: Record<string, unknown>,
  status: IntegrationConfigRow["status"] = "connected"
): Promise<IntegrationConfigRow | null> {
  const { data, error } = await supabase
    .from("integration_configs")
    .upsert(
      {
        user_id: userId,
        platform,
        config,
        status,
        last_sync: new Date().toISOString(),
      },
      { onConflict: "user_id,platform" }
    )
    .select()
    .single();

  if (error) {
    console.error("[db-integrations] Error upserting integration:", error);
    return null;
  }
  return data;
}

export async function updateIntegrationStatus(
  supabase: SupabaseClient,
  userId: string,
  platform: IntegrationPlatform,
  status: IntegrationConfigRow["status"],
  lastSync?: boolean
): Promise<void> {
  const updates: Record<string, unknown> = { status };
  if (lastSync) {
    updates.last_sync = new Date().toISOString();
  }

  const { error } = await supabase
    .from("integration_configs")
    .update(updates)
    .eq("user_id", userId)
    .eq("platform", platform);

  if (error) {
    console.error("[db-integrations] Error updating status:", error);
  }
}

export async function deleteIntegrationConfig(
  supabase: SupabaseClient,
  userId: string,
  platform: IntegrationPlatform
): Promise<boolean> {
  const { error } = await supabase
    .from("integration_configs")
    .delete()
    .eq("user_id", userId)
    .eq("platform", platform);

  if (error) {
    console.error("[db-integrations] Error deleting integration:", error);
    return false;
  }
  return true;
}

// ─── Integration Status Summary ──────────────────────────────────

export async function getIntegrationsSummary(
  supabase: SupabaseClient,
  userId: string
): Promise<Record<IntegrationPlatform, { connected: boolean; lastSync: string | null }>> {
  const configs = await getAllIntegrations(supabase, userId);

  const platforms: IntegrationPlatform[] = [
    "amplemarket", "hubspot", "aircall", "clay", "gmail", "fireflies", "apify", "n8n"
  ];

  const summary: Record<string, { connected: boolean; lastSync: string | null }> = {};

  for (const p of platforms) {
    const config = configs.find((c) => c.platform === p);
    summary[p] = {
      connected: config?.status === "connected",
      lastSync: config?.last_sync || null,
    };
  }

  return summary as Record<IntegrationPlatform, { connected: boolean; lastSync: string | null }>;
}
