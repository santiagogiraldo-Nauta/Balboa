// Client-safe configuration for Balboa platform
// Only uses NEXT_PUBLIC_ env vars (safe for browser)

export type BalboaEnvironment = "sandbox" | "production";

export interface ClientConfig {
  environment: BalboaEnvironment;
  isSandbox: boolean;
  isProduction: boolean;
}

export function getClientConfig(): ClientConfig {
  const env = (process.env.NEXT_PUBLIC_BALBOA_ENV || "sandbox") as BalboaEnvironment;
  return {
    environment: env,
    isSandbox: env === "sandbox",
    isProduction: env === "production",
  };
}
