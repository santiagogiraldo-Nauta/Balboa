import type { NextConfig } from "next";
import { readFileSync } from "fs";

// Fix: Claude Desktop sets ANTHROPIC_API_KEY="" in the parent process environment.
// dotenv (used by @next/env) does NOT override existing env vars, so the empty
// value takes precedence over the real key in .env.local. We fix this by manually
// loading any empty env vars from .env.local with override behavior.
try {
  const envContent = readFileSync(".env.local", "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx);
    const value = trimmed.substring(eqIdx + 1);
    // Only override if the current env value is empty/missing
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // .env.local might not exist in production (Vercel uses env vars directly)
}

const nextConfig: NextConfig = {};

export default nextConfig;
