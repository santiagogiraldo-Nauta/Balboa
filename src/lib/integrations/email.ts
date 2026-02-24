// Email integration adapter stub
// Future: SMTP/API send via SendGrid, Resend, or similar

import { config } from "../config";
import type { OutreachAdapter, IntegrationStatus } from "./types";

class EmailAdapter implements OutreachAdapter {
  name = "email";
  displayName = "Email (SMTP/API)";
  capabilities = [
    "email_send",
    "email_tracking",
    "open_detection",
    "click_tracking",
    "bounce_handling",
    "template_management",
  ];

  async isConnected(): Promise<boolean> {
    return !!config.integrations.email.apiKey;
  }

  async getStatus(): Promise<IntegrationStatus> {
    const connected = await this.isConnected();
    return {
      name: this.name,
      displayName: this.displayName,
      connected,
      enabled: config.integrations.email.enabled,
      sandboxMode: config.integrations.email.sandboxMode,
      capabilities: this.capabilities,
    };
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!config.integrations.email.apiKey) {
      return { success: false, error: "No API key configured" };
    }
    // Future: test SMTP/API connection
    return { success: false, error: "Email integration not yet implemented" };
  }

  async sendMessage(params: {
    recipientId: string;
    subject?: string;
    body: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // Future: send email via SendGrid/Resend/SMTP
    console.log("[Email Adapter] Would send to:", params.recipientId);
    return { success: false, error: "Email sending not yet implemented" };
  }

  async canReach(recipientId: string): Promise<boolean> {
    // Future: validate email address
    return !!recipientId && recipientId.includes("@");
  }
}

export const emailAdapter = new EmailAdapter();
