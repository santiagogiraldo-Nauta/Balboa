// Central server-side configuration for Balboa platform
// Controls environment mode, feature flags, and integration settings

export type BalboaEnvironment = "sandbox" | "production";

export interface IntegrationConfig {
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  sandboxMode: boolean;
}

export interface BalboaFeatures {
  /** Can messages actually be sent to real recipients? */
  outreachSending: boolean;
  /** Must outreach go through approval queue before sending? */
  outreachRequiresApproval: boolean;
  /** Use real Anthropic API for AI calls? (true in both envs for realistic testing) */
  aiCallsEnabled: boolean;
  /** Connect to real external APIs (LinkedIn, HubSpot, etc.)? */
  liveIntegrations: boolean;
  /** Where does data come from? */
  dataSource: "mock" | "database" | "hybrid";
  /** Has the production launch switch been flipped? */
  launchSwitchActive: boolean;
}

export interface BalboaConfig {
  environment: BalboaEnvironment;
  isSandbox: boolean;
  isProduction: boolean;
  features: BalboaFeatures;
  integrations: {
    linkedin: IntegrationConfig;
    hubspot: IntegrationConfig;
    ampleMarket: IntegrationConfig;
    airCall: IntegrationConfig;
    email: IntegrationConfig;
  };
}

function getConfig(): BalboaConfig {
  const env = (process.env.NEXT_PUBLIC_BALBOA_ENV || "sandbox") as BalboaEnvironment;
  const isSandbox = env === "sandbox";
  const launchSwitch = process.env.BALBOA_LAUNCH_SWITCH === "true";

  return {
    environment: env,
    isSandbox,
    isProduction: !isSandbox,
    features: {
      // Sandbox: outreach is simulated (always "sends" but never reaches real people)
      // Production pre-launch: outreach goes to queue only
      // Production post-launch: outreach goes to queue, approved items actually send
      outreachSending: isSandbox ? true : launchSwitch,
      outreachRequiresApproval: !isSandbox,
      // Real AI in both environments — AI calls are read-only (analysis/generation)
      aiCallsEnabled: true,
      // Only connect live APIs in production after launch
      liveIntegrations: !isSandbox && launchSwitch,
      // Sandbox always uses mock data; production uses database
      dataSource: isSandbox ? "mock" : "database",
      launchSwitchActive: launchSwitch,
    },
    integrations: {
      linkedin: {
        enabled: !!process.env.LINKEDIN_API_KEY,
        apiKey: process.env.LINKEDIN_API_KEY,
        baseUrl: "https://api.linkedin.com/v2",
        sandboxMode: isSandbox,
      },
      hubspot: {
        enabled: !!process.env.HUBSPOT_API_KEY,
        apiKey: process.env.HUBSPOT_API_KEY,
        baseUrl: "https://api.hubapi.com",
        sandboxMode: isSandbox,
      },
      ampleMarket: {
        enabled: !!process.env.AMPLEMARKET_API_KEY,
        apiKey: process.env.AMPLEMARKET_API_KEY,
        baseUrl: "",
        sandboxMode: isSandbox,
      },
      airCall: {
        enabled: !!process.env.AIRCALL_API_KEY,
        apiKey: process.env.AIRCALL_API_KEY,
        baseUrl: "https://api.aircall.io/v1",
        sandboxMode: isSandbox,
      },
      email: {
        enabled: !!process.env.EMAIL_API_KEY,
        apiKey: process.env.EMAIL_API_KEY,
        baseUrl: "",
        sandboxMode: isSandbox,
      },
    },
  };
}

export const config = getConfig();
