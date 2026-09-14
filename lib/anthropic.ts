import Anthropic from "@anthropic-ai/sdk";

/** Exact model id — no date suffix. Override with REGPATH_MODEL if needed. */
export const MODEL = process.env.REGPATH_MODEL || "claude-opus-5";

/**
 * Effort for the generation call. 'high' produced a 49-node, fully-verified plan
 * in ~20 minutes on the sample run — fine for `next dev`, too long for a hosted
 * function with a time limit. Set REGPATH_EFFORT=medium on such deploys.
 */
export const EFFORT = ((process.env.REGPATH_EFFORT || "high") as "low" | "medium" | "high" | "xhigh" | "max");

/**
 * Header the browser uses to pass the founder's own API key (bring-your-own-key).
 * The key lives in the browser's localStorage; the server uses it for the one
 * request it arrives on and never stores or logs it.
 */
export const KEY_HEADER = "x-anthropic-key";

const CLIENT_OPTS = { timeout: 10 * 60 * 1000, maxRetries: 2 };
let envClient: Anthropic | null = null;

/**
 * Per-request client when a key is supplied; otherwise a cached client that
 * resolves ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN / an `ant auth login`
 * profile) from the server environment. Lazy so importing never throws at build.
 */
export function getClient(apiKey?: string): Anthropic {
  if (apiKey) return new Anthropic({ apiKey, ...CLIENT_OPTS });
  if (!envClient) envClient = new Anthropic(CLIENT_OPTS);
  return envClient;
}

export function hasServerCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
}

export function hasCredentials(apiKey?: string): boolean {
  return Boolean(apiKey) || hasServerCredentials();
}

/** Reads the browser-supplied key from the request, if any. Never log the result. */
export function keyFromRequest(req: Request): string | undefined {
  const k = req.headers.get(KEY_HEADER)?.trim();
  return k && k.length >= 20 && k.length <= 512 && !/\s/.test(k) ? k : undefined;
}

export const NO_KEY_MESSAGE =
  "Failed to parse: Anthropic API key not input. Add your own API key in the key panel (it stays in this browser), or skip parsing and answer the questions manually.";

/**
 * Research + map generation never falls back to the server's key: it is the
 * expensive, long-running step and is always billed to the user's own key.
 */
export const RESEARCH_KEY_MESSAGE =
  "Failed to run: Anthropic API key not input. Add your own API key (it stays in this browser) and run again to receive the research and strategy map.";

/** Web search grounding is on unless explicitly disabled (or unavailable in the deploy environment). */
export function webSearchEnabled(): boolean {
  return (process.env.REGPATH_WEB_SEARCH || "on").toLowerCase() !== "off";
}
