// HubSpot integration adapter stub
// Future: deal/contact/company sync, pipeline management

import { config } from "../config";
import type { DataSyncAdapter, IntegrationStatus } from "./types";

class HubSpotAdapter implements DataSyncAdapter {
  name = "hubspot";
  displayName = "HubSpot CRM";
  capabilities = [
    "deal_sync",
    "contact_sync",
    "company_sync",
    "pipeline_management",
    "activity_logging",
    "webhook_events",
  ];

  async isConnected(): Promise<boolean> {
    return !!config.integrations.hubspot.apiKey;
  }

  async getStatus(): Promise<IntegrationStatus> {
    const connected = await this.isConnected();
    return {
      name: this.name,
      displayName: this.displayName,
      connected,
      enabled: config.integrations.hubspot.enabled,
      sandboxMode: config.integrations.hubspot.sandboxMode,
      capabilities: this.capabilities,
    };
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!config.integrations.hubspot.apiKey) {
      return { success: false, error: "No API key configured" };
    }
    // Future: test HubSpot API connection
    return { success: false, error: "HubSpot integration not yet implemented" };
  }

  async syncFromExternal(): Promise<{ synced: number; errors: number }> {
    // Future: pull deals, contacts, companies from HubSpot
    return { synced: 0, errors: 0 };
  }

  async syncToExternal(): Promise<{ pushed: number; errors: number }> {
    // Future: push lead/deal updates to HubSpot
    return { pushed: 0, errors: 0 };
  }
}

export const hubspotAdapter = new HubSpotAdapter();
