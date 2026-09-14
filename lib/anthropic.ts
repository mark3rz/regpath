import Anthropic from "@anthropic-ai/sdk";

/** Exact model id — no date suffix. Override with REGPATH_MODEL if needed. */
export const MODEL = process.env.REGPATH_MODEL || "claude-opus-5";

/**
 * Effort for the generation call. 'high' produced a 49-node, fully-verified plan
 * in ~20 minutes on the sample run — fine for `next dev`, too long for a hosted
 * function with a time limit. Set REGPATH_EFFORT=medium on such deploys.
 */
export const EFFORT = ((process.env.REGPATH_EFFORT || "high") as "low" | "medium" | "high" | "xhigh" | "max");

let client: Anthropic | null = null;

/** Lazily constructed so importing this module never throws at build time. */
export function getClient(): Anthropic {
  if (!client) {
    // Resolves ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN / an `ant auth login` profile) from the environment.
    client = new Anthropic({ timeout: 10 * 60 * 1000, maxRetries: 2 });
  }
  return client;
}

export function hasCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
}

/** Web search grounding is on unless explicitly disabled (or unavailable in the deploy environment). */
export function webSearchEnabled(): boolean {
  return (process.env.REGPATH_WEB_SEARCH || "on").toLowerCase() !== "off";
}
