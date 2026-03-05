// Fireflies.ai integration adapter
// Provides meeting transcription sync, participant matching, and meeting intel

import { config } from "../config";
import type { IntegrationAdapter, IntegrationStatus } from "./types";

class FirefliesAdapter implements IntegrationAdapter {
  name = "fireflies";
  displayName = "Fireflies.ai";
  capabilities = [
    "meeting_transcription",
    "meeting_recording",
    "participant_detection",
    "meeting_summary",
    "action_items",
    "keyword_extraction",
  ];

  async isConnected(): Promise<boolean> {
    return !!config.integrations.fireflies.apiKey;
  }

  async getStatus(): Promise<IntegrationStatus> {
    const connected = await this.isConnected();
    return {
      name: this.name,
      displayName: this.displayName,
      connected,
      enabled: config.integrations.fireflies.enabled,
      sandboxMode: config.integrations.fireflies.sandboxMode,
      capabilities: this.capabilities,
    };
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!config.integrations.fireflies.apiKey) {
      return { success: false, error: "No API key configured" };
    }

    try {
      // Dynamically import to avoid circular dependencies
      const { validateApiKey } = await import("../fireflies/client");
      const result = await validateApiKey(config.integrations.fireflies.apiKey);
      return { success: result.valid, error: result.error };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection test failed";
      return { success: false, error: message };
    }
  }
}

export const firefliesAdapter = new FirefliesAdapter();
