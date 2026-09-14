import { describe, expect, it } from "vitest";
import { checkPlan, findCycles, hasErrors } from "@/lib/graph";
import { LANES, PHASES, n } from "./helpers";

describe("dependency graph integrity", () => {
  it("passes a clean DAG", () => {
    const nodes = [n("A"), n("B", ["A"]), n("C", ["A", "B"], { phase: 2 })];
    expect(checkPlan({ nodes, lanes: LANES, phases: PHASES })).toEqual([]);
  });

  it("flags a dangling reference as an error", () => {
    const f = checkPlan({ nodes: [n("A", ["ZZ"])], lanes: LANES, phases: PHASES });
    expect(f).toContainEqual(expect.objectContaining({ level: "error", code: "dangling-dep", nodeId: "A" }));
    expect(hasErrors(f)).toBe(true);
  });

  it("flags self-dependency", () => {
    const f = checkPlan({ nodes: [n("A", ["A"])], lanes: LANES, phases: PHASES });
    expect(f.map((x) => x.code)).toContain("self-dep");
  });

  it("detects a direct cycle", () => {
    const f = findCycles([n("A", ["B"]), n("B", ["A"])]);
    expect(f).toHaveLength(1);
    expect(f[0].code).toBe("cycle");
    expect(f[0].message).toMatch(/A → B → A|B → A → B/);
  });

  it("detects a longer cycle and reports it once", () => {
    const f = findCycles([n("A", ["C"]), n("B", ["A"]), n("C", ["B"]), n("D", ["A"])]);
    expect(f).toHaveLength(1);
  });

  it("does not report a diamond as a cycle", () => {
    expect(findCycles([n("A"), n("B", ["A"]), n("C", ["A"]), n("D", ["B", "C"])])).toEqual([]);
  });

  it("flags unknown lane and phase", () => {
    const f = checkPlan({ nodes: [n("A", [], { lane: "mars", phase: 9 })], lanes: LANES, phases: PHASES });
    expect(f.map((x) => x.code).sort()).toEqual(["unknown-lane", "unknown-phase"]);
  });

  it("warns when a dependency sits in a later phase", () => {
    const f = checkPlan({ nodes: [n("A", [], { phase: 3 }), n("B", ["A"], { phase: 1 })], lanes: LANES, phases: PHASES });
    expect(f).toContainEqual(expect.objectContaining({ level: "warning", code: "phase-order", nodeId: "B" }));
  });

  it("flags duplicate ids", () => {
    const f = checkPlan({ nodes: [n("A"), n("A")], lanes: LANES, phases: PHASES });
    expect(f.map((x) => x.code)).toContain("duplicate-id");
  });

  it("rejects an empty plan", () => {
    expect(hasErrors(checkPlan({ nodes: [], lanes: LANES, phases: PHASES }))).toBe(true);
  });
});
