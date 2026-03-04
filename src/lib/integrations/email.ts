// Gmail integration adapter
// Read-only sync via Google OAuth + Gmail API
// Send capability to be added in a future phase

import type { OutreachAdapter, IntegrationStatus } from "./types";

class GmailEmailAdapter implements OutreachAdapter {
  name = "email";
  displayName = "Gmail";
  capabilities = [
    "email_read",
    "email_sync",
    "inbox_display",
    "lead_matching",
    // Future: "email_send", "email_tracking"
  ];

  async isConnected(): Promise<boolean> {
    // Check if Gmail OAuth is configured (env vars present)
    return !!process.env.GOOGLE_CLIENT_ID;
  }

  async getStatus(): Promise<IntegrationStatus> {
    const configured = !!process.env.GOOGLE_CLIENT_ID;
    return {
      name: this.name,
      displayName: this.displayName,
      connected: configured,
      enabled: configured,
      sandboxMode: !configured,
      capabilities: this.capabilities,
    };
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return { success: false, error: "Gmail OAuth not configured. Set GOOGLE_CLIENT_ID." };
    }
    // Per-user connection status is checked via /api/gmail/status
    return { success: true };
  }

  async sendMessage(params: {
    recipientId: string;
    subject?: string;
    body: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    console.log("[Gmail Adapter] Send not yet implemented:", params.recipientId);
    return { success: false, error: "Gmail send not yet implemented — use email compose popup" };
  }

  async canReach(recipientId: string): Promise<boolean> {
    return !!recipientId && recipientId.includes("@");
  }
}

export const emailAdapter = new GmailEmailAdapter();
