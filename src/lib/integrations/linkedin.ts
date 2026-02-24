// LinkedIn integration adapter stub
// Future: LinkedIn Sales Navigator sync, messaging, profile enrichment

import { config } from "../config";
import type { IntegrationAdapter, IntegrationStatus } from "./types";

class LinkedInAdapter implements IntegrationAdapter {
  name = "linkedin";
  displayName = "LinkedIn Sales Navigator";
  capabilities = [
    "profile_enrichment",
    "connection_sync",
    "messaging",
    "engagement_tracking",
    "conversation_import",
  ];

  async isConnected(): Promise<boolean> {
    // Stub: always false until real integration
    return !!config.integrations.linkedin.apiKey;
  }

  async getStatus(): Promise<IntegrationStatus> {
    const connected = await this.isConnected();
    return {
      name: this.name,
      displayName: this.displayName,
      connected,
      enabled: config.integrations.linkedin.enabled,
      sandboxMode: config.integrations.linkedin.sandboxMode,
      capabilities: this.capabilities,
    };
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!config.integrations.linkedin.apiKey) {
      return { success: false, error: "No API key configured" };
    }
    // Future: test LinkedIn API connection
    return { success: false, error: "LinkedIn integration not yet implemented" };
  }
}

export const linkedinAdapter = new LinkedInAdapter();
