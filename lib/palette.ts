import type { Lane } from "./schema";

/**
 * Per-lane accent hues from the prototype's :root tokens, assigned by lane
 * kind instead of hardcoded to Australia/France/Netherlands. Country lanes
 * cycle through the country palette in order.
 */
const KIND_COLORS: Record<string, string> = {
  shared: "#9B6BE0",
  evidence: "#F2B705",
  home: "#F2994A",
  eu: "#2F80ED",
  other: "#5C6B7A",
};
const COUNTRY_COLORS = ["#EB5757", "#12B886", "#0EA5B7", "#B8479B", "#7A8C1E"];

export function laneColors(lanes: Lane[]): Record<string, string> {
  const out: Record<string, string> = {};
  let c = 0;
  for (const l of lanes) {
    if (KIND_COLORS[l.kind]) out[l.id] = KIND_COLORS[l.kind];
    else out[l.id] = COUNTRY_COLORS[c++ % COUNTRY_COLORS.length];
  }
  return out;
}

export const RISK_COLORS = { high: "var(--risk-high)", med: "var(--risk-med)", low: "var(--risk-low)" } as const;
export function riskColor(r: "high" | "med" | "low"): string {
  return RISK_COLORS[r];
}
