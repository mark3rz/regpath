import { describe, expect, it } from "vitest";
import { lintDescEdges } from "@/lib/graph";
import { n } from "./helpers";

describe("description-vs-edge lint", () => {
  it("accepts 'this feeds X' when X depends on the node", () => {
    const nodes = [n("A5", [], { desc: "This trial feeds E9 (the CER)." }), n("E9", ["A5"])];
    expect(lintDescEdges(nodes)).toEqual([]);
  });

  it("accepts a reference to an upstream node", () => {
    const nodes = [n("E2"), n("E3", ["E2"], { desc: "Inherits the classification locked in E2." })];
    expect(lintDescEdges(nodes)).toEqual([]);
  });

  it("accepts transitive paths", () => {
    const nodes = [n("A5"), n("EV3", ["A5"]), n("F6", ["EV3"], { desc: "Built on the trial in A5." })];
    expect(lintDescEdges(nodes)).toEqual([]);
  });

  it("flags a claimed feed with no edge in either direction", () => {
    const nodes = [n("A5", [], { desc: "This feeds E9." }), n("E9", [])];
    const f = lintDescEdges(nodes);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ level: "warning", code: "desc-edge", nodeId: "A5" });
    expect(f[0].message).toContain("E9");
  });

  it("flags sibling mentions (shared parent, no path)", () => {
    const nodes = [n("E2"), n("E4", ["E2"]), n("E21", ["E2"], { desc: "Required alongside the software lifecycle file (E4)." })];
    expect(lintDescEdges(nodes).map((f) => f.nodeId)).toEqual(["E21"]);
  });

  it("ignores ids embedded in other tokens and HTML attributes", () => {
    const nodes = [n("E1", [], { desc: 'See <a href="https://example.org/E20-guide">guidance</a> and ISO-E20 naming.' }), n("E20", [])];
    expect(lintDescEdges(nodes)).toEqual([]);
  });

  it("does not flag self-mentions", () => {
    expect(lintDescEdges([n("A1", [], { desc: "A1 is the first step." })])).toEqual([]);
  });

  it("prefers the longest id when ids share a prefix", () => {
    const nodes = [n("E1"), n("E12", ["E1"]), n("N2", ["E12"], { desc: "Only after E12 is issued." })];
    expect(lintDescEdges(nodes)).toEqual([]);
  });
});
