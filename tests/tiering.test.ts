import { describe, expect, it } from "vitest";
import { buildActionTiers, hasWaitAncestor, indexNodes, tierOf } from "@/lib/graph";
import type { PathwayNode } from "@/lib/schema";
import { n } from "./helpers";

describe("computed urgency tiers", () => {
  const nodes = [
    n("A"), // NOW
    n("B", ["A"]), // SOON
    n("W", ["A"], { urgency: "wait" }), // PENDING
    n("P", ["W"]), // PARTIAL — 'now' with a wait ancestor
    n("Q", ["P"]), // PARTIAL via transitive wait ancestor
  ];
  const byId = indexNodes(nodes);

  it("NOW = urgency now and zero deps", () => expect(tierOf(byId.get("A")!, byId)).toBe("NOW"));
  it("SOON = urgency now, deps, no wait ancestor", () => expect(tierOf(byId.get("B")!, byId)).toBe("SOON"));
  it("PENDING = urgency wait", () => expect(tierOf(byId.get("W")!, byId)).toBe("PENDING"));
  it("PARTIAL = urgency now with a wait ancestor", () => {
    expect(tierOf(byId.get("P")!, byId)).toBe("PARTIAL");
    expect(tierOf(byId.get("Q")!, byId)).toBe("PARTIAL");
  });
  it("hasWaitAncestor terminates on cycles", () => {
    const cyc = indexNodes([n("X", ["Y"]), n("Y", ["X"])]);
    expect(hasWaitAncestor("X", cyc)).toBe(false);
  });
});

describe("immediate actions view is a derived, tiered list", () => {
  const full = (id: string, deps: string[], urgency: "now" | "wait", micro: PathwayNode["micro"] = null): PathwayNode => ({
    id,
    lane: "shared",
    phase: 1,
    title: `Title ${id}`,
    duration: 1,
    risk: "low",
    urgency,
    overlap: false,
    decision: false,
    keystone: false,
    keystoneNote: null,
    desc: "",
    deps,
    micro,
    confidence: "med",
    sources: [],
    tags: [],
  });
  const nodes = [
    full("A", [], "now"),
    full("B", ["A"], "now", [{ title: "Kick-off", time: "Now", detail: "", now: true }]),
    full("W", ["A"], "wait"),
    full("P", ["W"], "now", [
      { title: "Draft dossier", time: "Now", detail: "", now: true },
      { title: "Submit", time: "Post-CE", detail: "", now: false },
    ]),
    full("N", ["W"], "now"), // blocked, no independent micro step → not listed
  ];
  const tiers = buildActionTiers(nodes);
  const byKey = Object.fromEntries(tiers.map((t) => [t.key, t.items]));

  it("tier 1 holds zero-prerequisite nodes", () => expect(byKey.tier1.map((i) => i.nodeId)).toEqual(["A"]));
  it("tier 2 holds fast-follow nodes, labelled by their first now-step", () => {
    expect(byKey.tier2).toHaveLength(1);
    expect(byKey.tier2[0]).toMatchObject({ nodeId: "B", title: "Kick-off" });
    expect(byKey.tier2[0].note).toContain("A");
  });
  it("tier 3 lists only the independent micro-step of a blocked node", () => {
    expect(byKey.tier3).toHaveLength(1);
    expect(byKey.tier3[0]).toMatchObject({ nodeId: "P", title: "Draft dossier" });
  });
  it("blocked nodes without a now-step are omitted entirely", () => {
    expect(tiers.flatMap((t) => t.items).some((i) => i.nodeId === "N")).toBe(false);
  });
  it("never lists wait nodes", () => {
    expect(tiers.flatMap((t) => t.items).some((i) => i.nodeId === "W")).toBe(false);
  });
});
