// Ample Market integration adapter stub
// Future: prospecting signals, lead enrichment, intent data

import { config } from "../config";
import type { IntegrationAdapter, IntegrationStatus } from "./types";

class AmpleMarketAdapter implements IntegrationAdapter {
  name = "amplemarket";
  displayName = "Ample Market";
  capabilities = [
    "prospecting_signals",
    "lead_enrichment",
    "intent_data",
    "contact_discovery",
    "email_verification",
  ];

  async isConnected(): Promise<boolean> {
    return !!config.integrations.ampleMarket.apiKey;
  }

  async getStatus(): Promise<IntegrationStatus> {
    const connected = await this.isConnected();
    return {
      name: this.name,
      displayName: this.displayName,
      connected,
      enabled: config.integrations.ampleMarket.enabled,
      sandboxMode: config.integrations.ampleMarket.sandboxMode,
      capabilities: this.capabilities,
    };
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!config.integrations.ampleMarket.apiKey) {
      return { success: false, error: "No API key configured" };
    }
    // Future: test Ample Market API connection
    return { success: false, error: "Ample Market integration not yet implemented" };
  }
}

export const ampleMarketAdapter = new AmpleMarketAdapter();
