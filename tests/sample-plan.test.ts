import { describe, expect, it } from "vitest";
import { buildActionTiers, checkPlan, indexNodes, tierOf } from "@/lib/graph";
import { samplePlan } from "@/lib/sample-plan";
import { laneColors } from "@/lib/palette";

/**
 * The bundled Cadence Health sample (fictional) is what the visualization is
 * validated against. It has to pass every check the pipeline runs on
 * generated output.
 */
describe("Cadence Health sample plan", () => {
  const plan = samplePlan();
  const byId = indexNodes(plan.nodes);

  it("passes all integrity checks and lints with no findings", () => {
    expect(checkPlan(plan)).toEqual([]);
  });

  it("reproduces the prototype's tiering on known nodes", () => {
    expect(tierOf(byId.get("SH1")!, byId)).toBe("NOW"); // zero deps
    expect(tierOf(byId.get("SH4")!, byId)).toBe("SOON"); // depends on SH1 (fast decision)
    expect(tierOf(byId.get("EU5")!, byId)).toBe("PENDING"); // NB review waits
    expect(tierOf(byId.get("EV6")!, byId)).toBe("PENDING"); // procurement sign-off is 'wait'
    expect(tierOf(byId.get("EU3")!, byId)).toBe("SOON"); // technical file: all deps are 'now'
  });

  it("puts SH1 in tier 1 and never lists wait nodes", () => {
    const tiers = buildActionTiers(plan.nodes);
    const t = Object.fromEntries(tiers.map((x) => [x.key, x.items]));
    expect(t.tier1.map((i) => i.nodeId)).toContain("SH1");
    expect(t.tier2.map((i) => i.nodeId)).toContain("EV3"); // trial depends on SH1 — a fast decision, not a long wait
    expect(tiers.flatMap((x) => x.items).some((i) => i.nodeId === "EU5")).toBe(false);
  });

  it("assigns lane colours by kind, countries cycling", () => {
    const c = laneColors(plan.lanes);
    expect(c.shared).toBe("#9B6BE0");
    expect(c.evidence).toBe("#F2B705");
    expect(c.sg).toBe("#F2994A");
    expect(c.eu).toBe("#2F80ED");
    expect(c.de).not.toBe(c.es);
  });

  it("is clearly labelled as fictional and carries the mandatory disclaimer", () => {
    expect(plan.readme[0]).toMatch(/fictional/i);
    expect(plan.disclaimer).toBe("Internal strategy tool — not legal advice. Verify with qualified regulatory counsel before acting.");
  });
});
