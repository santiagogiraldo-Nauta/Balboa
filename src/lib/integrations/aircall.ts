// Air Call integration adapter stub
// Future: call logging, auto-detection, call analytics, SMS, WhatsApp, click-to-call

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
    "sms_send",
    "sms_receive",
    "whatsapp_send",
    "whatsapp_receive",
    "click_to_call",
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

  // === OUTREACH ADAPTER METHODS ===

  async sendMessage(params: {
    channel: "sms" | "whatsapp" | "call";
    to: string;
    body: string;
    leadId?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const connected = await this.isConnected();
    if (!connected) {
      return { success: false, error: "Air Call not connected. Configure API key." };
    }

    if (config.isSandbox) {
      console.log(`[Aircall Sandbox] Would send ${params.channel} to ${params.to}: ${params.body.substring(0, 50)}...`);
      return { success: true, messageId: `sandbox-${Date.now()}` };
    }

    // Future: actual API calls
    // POST /v1/messages for SMS
    // POST /v1/whatsapp/messages for WhatsApp
    return { success: false, error: `${params.channel} sending not yet implemented` };
  }

  async initiateCall(params: {
    phoneNumber: string;
    leadId?: string;
    userId?: string;
  }): Promise<{ success: boolean; callId?: string; error?: string }> {
    const connected = await this.isConnected();
    if (!connected) {
      return { success: false, error: "Air Call not connected. Configure API key." };
    }

    if (config.isSandbox) {
      console.log(`[Aircall Sandbox] Would initiate call to ${params.phoneNumber}`);
      return { success: true, callId: `sandbox-call-${Date.now()}` };
    }

    // Future: POST /v1/calls to initiate call via Aircall dialer
    return { success: false, error: "Click-to-call not yet implemented" };
  }
}

export const airCallAdapter = new AirCallAdapter();
