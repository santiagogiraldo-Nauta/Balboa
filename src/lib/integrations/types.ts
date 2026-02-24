// Integration adapter interfaces

export interface IntegrationStatus {
  name: string;
  displayName: string;
  connected: boolean;
  enabled: boolean;
  sandboxMode: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: "success" | "error" | "pending";
  lastSyncError?: string;
  capabilities: string[];
}

/**
 * Base interface for all integration adapters.
 * Each integration must implement these methods.
 */
export interface IntegrationAdapter {
  /** Integration identifier (e.g., "linkedin", "hubspot") */
  name: string;

  /** Human-readable name */
  displayName: string;

  /** List of capabilities this integration provides */
  capabilities: string[];

  /** Check if the integration is properly configured and connected */
  isConnected(): Promise<boolean>;

  /** Get current status of the integration */
  getStatus(): Promise<IntegrationStatus>;

  /** Test the connection (e.g., ping the API) */
  testConnection(): Promise<{ success: boolean; error?: string }>;
}

/**
 * Adapter for integrations that sync data bidirectionally.
 */
export interface DataSyncAdapter extends IntegrationAdapter {
  /** Sync data from the external service */
  syncFromExternal(): Promise<{ synced: number; errors: number }>;

  /** Push data to the external service */
  syncToExternal(): Promise<{ pushed: number; errors: number }>;
}

/**
 * Adapter for integrations that can send outreach messages.
 */
export interface OutreachAdapter extends IntegrationAdapter {
  /** Send a message through this integration's channel */
  sendMessage(params: {
    recipientId: string;
    subject?: string;
    body: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ success: boolean; messageId?: string; error?: string }>;

  /** Check if a specific recipient can be reached via this channel */
  canReach(recipientId: string): Promise<boolean>;
}
