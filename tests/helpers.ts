import type { NodeLike } from "@/lib/graph";

/** Minimal node factory so tests read as graphs, not as fixtures. */
export function n(id: string, deps: string[] = [], extra: Partial<NodeLike> = {}): NodeLike {
  return { id, lane: "shared", phase: 1, urgency: "now", deps, desc: "", tags: [], ...extra };
}

export const LANES = [{ id: "shared" }, { id: "eu" }];
export const PHASES = [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }];
