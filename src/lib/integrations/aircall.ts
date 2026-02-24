// Air Call integration adapter stub
// Future: call logging, auto-detection, call analytics

import { config } from "../config";
import type { IntegrationAdapter, IntegrationStatus } from "./types";

class AirCallAdapter implements IntegrationAdapter {
  name = "aircall";
  displayName = "Air Call";
  capabilities = [
    "call_logging",
    "call_auto_detection",
    "call_analytics",
    "voicemail_transcription",
    "call_recording",
  ];

  async isConnected(): Promise<boolean> {
    return !!config.integrations.airCall.apiKey;
  }

  async getStatus(): Promise<IntegrationStatus> {
    const connected = await this.isConnected();
    return {
      name: this.name,
      displayName: this.displayName,
      connected,
      enabled: config.integrations.airCall.enabled,
      sandboxMode: config.integrations.airCall.sandboxMode,
      capabilities: this.capabilities,
    };
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!config.integrations.airCall.apiKey) {
      return { success: false, error: "No API key configured" };
    }
    // Future: test Air Call API connection
    return { success: false, error: "Air Call integration not yet implemented" };
  }
}

export const airCallAdapter = new AirCallAdapter();
