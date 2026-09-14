import { describe, expect, it } from "vitest";
import { checkIpSequencing, checkPlan } from "@/lib/graph";
import { LANES, PHASES, n } from "./helpers";

describe("IP sequencing rule (pre-patent)", () => {
  it("errors when no patent-filing node exists", () => {
    const f = checkIpSequencing([n("A"), n("B", ["A"], { tags: ["public-disclosure"] })]);
    expect(f).toEqual([expect.objectContaining({ level: "error", code: "ip-no-patent-node" })]);
  });

  it("errors when a disclosure step does not depend on the patent filing", () => {
    const nodes = [n("IP1", [], { tags: ["patent-filing"] }), n("EV3", [], { tags: ["public-disclosure"] })];
    const f = checkIpSequencing(nodes);
    expect(f).toEqual([expect.objectContaining({ level: "error", code: "ip-disclosure-before-patent", nodeId: "EV3" })]);
  });

  it("passes when every disclosure is downstream (directly or transitively) of the filing", () => {
    const nodes = [
      n("IP1", [], { tags: ["patent-filing"] }),
      n("A5", ["IP1"]),
      n("EV3", ["A5"], { tags: ["public-disclosure"] }),
      n("R1", ["IP1"], { tags: ["public-disclosure"] }),
    ];
    expect(checkIpSequencing(nodes)).toEqual([]);
  });

  it("is only enforced when the startup is pre-patent", () => {
    const nodes = [n("EV3", [], { tags: ["public-disclosure"] })];
    expect(checkPlan({ nodes, lanes: LANES, phases: PHASES })).toEqual([]);
    expect(checkPlan({ nodes, lanes: LANES, phases: PHASES }, { prePatent: true }).map((f) => f.code)).toEqual(["ip-no-patent-node"]);
  });
});
