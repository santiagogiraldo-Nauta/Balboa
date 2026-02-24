// Integration adapter registry — factory for accessing all integrations

import type { IntegrationAdapter, IntegrationStatus } from "./types";
import { linkedinAdapter } from "./linkedin";
import { hubspotAdapter } from "./hubspot";
import { ampleMarketAdapter } from "./amplemarket";
import { airCallAdapter } from "./aircall";
import { emailAdapter } from "./email";

export type { IntegrationAdapter, IntegrationStatus, DataSyncAdapter, OutreachAdapter } from "./types";

const adapters: Record<string, IntegrationAdapter> = {
  linkedin: linkedinAdapter,
  hubspot: hubspotAdapter,
  amplemarket: ampleMarketAdapter,
  aircall: airCallAdapter,
  email: emailAdapter,
};

/**
 * Get a specific integration adapter by name.
 */
export function getIntegration(name: string): IntegrationAdapter | null {
  return adapters[name] || null;
}

/**
 * Get all integration adapters.
 */
export function getAllIntegrations(): IntegrationAdapter[] {
  return Object.values(adapters);
}

/**
 * Get status of all integrations.
 */
export async function getAllIntegrationStatuses(): Promise<IntegrationStatus[]> {
  const statuses = await Promise.all(
    Object.values(adapters).map(adapter => adapter.getStatus())
  );
  return statuses;
}
