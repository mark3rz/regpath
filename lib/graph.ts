import type { PathwayNode, Plan } from "./schema";

/**
 * Dependency-graph logic ported from the single-file prototype. The tiering functions
 * (hasWaitAncestor / urgency*) are the debugged originals; the integrity and
 * description-vs-edge checks are the automated versions of what was caught by
 * hand while building the prototype.
 */

export type Tier = "NOW" | "SOON" | "PARTIAL" | "PENDING";

export type NodeLike = Pick<PathwayNode, "id" | "deps" | "urgency" | "lane" | "phase"> & Partial<Omit<PathwayNode, "sources">> & { sources?: unknown };

export function indexNodes<T extends NodeLike>(nodes: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const n of nodes) m.set(n.id, n);
  return m;
}

/** Walks the dependency graph looking for any ancestor tagged urgency='wait'. */
export function hasWaitAncestor(nodeId: string, byId: Map<string, NodeLike>, visited = new Set<string>()): boolean {
  const n = byId.get(nodeId);
  if (!n) return false;
  for (const d of n.deps) {
    if (visited.has(d)) continue;
    visited.add(d);
    const dep = byId.get(d);
    if (!dep) continue;
    if (dep.urgency === "wait") return true;
    if (hasWaitAncestor(d, byId, visited)) return true;
  }
  return false;
}

/** Urgency is a computed tier, not the flat 'now'/'wait' tag. */
export function tierOf(n: NodeLike, byId: Map<string, NodeLike>): Tier {
  if (n.urgency !== "now") return "PENDING";
  if (hasWaitAncestor(n.id, byId)) return "PARTIAL";
  return n.deps.length === 0 ? "NOW" : "SOON";
}

export function tierBadgeClass(t: Tier): string {
  return { NOW: "badge-now", SOON: "badge-soon", PARTIAL: "badge-partial", PENDING: "badge-wait" }[t];
}

export function tierLabel(n: NodeLike, byId: Map<string, NodeLike>): string {
  const t = tierOf(n, byId);
  if (t === "PENDING") return "Filing waits on a trigger";
  if (t === "PARTIAL") return "Partial start — one piece only, rest is blocked for months";
  if (t === "NOW") return "Start today — no prerequisites";
  return `Starts this week — depends on ${n.deps.join(", ")} closing first (a fast decision, not a long wait)`;
}

export function depthOf(nodeId: string, byId: Map<string, NodeLike>, memo: Record<string, number> = {}): number {
  if (memo[nodeId] !== undefined) return memo[nodeId];
  const n = byId.get(nodeId);
  if (!n || !n.deps.length) {
    memo[nodeId] = 0;
    return 0;
  }
  const d = 1 + Math.max(...n.deps.map((dep) => depthOf(dep, byId, memo)));
  memo[nodeId] = d;
  return d;
}

/** All transitive ancestors of a node (ids). */
export function ancestorsOf(nodeId: string, byId: Map<string, NodeLike>): Set<string> {
  const out = new Set<string>();
  const stack = [...(byId.get(nodeId)?.deps ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    const n = byId.get(id);
    if (n) stack.push(...n.deps);
  }
  return out;
}

// ---- Immediate actions (derived, tiered list) ----------------------------

export interface ActionItem {
  nodeId: string;
  title: string;
  decision: boolean;
  note?: string;
}
export interface ActionTier {
  key: "tier1" | "tier2" | "tier3";
  title: string;
  sub: string;
  items: ActionItem[];
}

export function buildActionTiers(nodes: PathwayNode[]): ActionTier[] {
  const byId = indexNodes(nodes);
  const tier1: ActionItem[] = [];
  const tier2: ActionItem[] = [];
  const tier3: ActionItem[] = [];

  for (const n of nodes) {
    if (n.urgency !== "now") continue;
    const blocked = hasWaitAncestor(n.id, byId);
    const nowSteps = n.micro && n.micro.length ? n.micro.filter((s) => s.now) : null;

    if (blocked) {
      // Only the specific independent sub-step counts as truly actionable; the rest is genuinely months out.
      if (nowSteps && nowSteps.length) {
        for (const s of nowSteps) {
          tier3.push({
            nodeId: n.id,
            title: s.title,
            decision: n.decision,
            note: `isolated head start — the rest of ${n.id} waits on a much longer step`,
          });
        }
      }
      continue;
    }

    if (n.deps.length === 0) {
      tier1.push({ nodeId: n.id, title: n.title, decision: n.decision });
    } else {
      const label = nowSteps && nowSteps.length ? nowSteps[0].title : n.title;
      tier2.push({ nodeId: n.id, title: label, decision: n.decision, note: `runs in parallel once ${n.deps.join(", ")} is locked` });
    }
  }

  return [
    {
      key: "tier1",
      title: "Tier 1 — Right now, zero prerequisites",
      sub: "Nothing else needs to happen first. These can all start today, independently of each other.",
      items: tier1,
    },
    {
      key: "tier2",
      title: "Tier 2 — This week, once a quick upstream decision lands",
      sub: "Each depends on something else on this list — usually a same-day or few-day decision — but the work itself starts almost immediately after.",
      items: tier2,
    },
    {
      key: "tier3",
      title: "Tier 3 — Isolated head start only",
      sub: "A specific piece of this step is genuinely independent and can begin now, but the rest of that step is blocked behind a much longer process (often a long regulator or Notified Body review). Don't read these as \"the whole thing is active.\"",
      items: tier3,
    },
  ];
}

// ---- Integrity checks + lints ---------------------------------------------

export interface Finding {
  level: "error" | "warning";
  code:
    | "duplicate-id"
    | "dangling-dep"
    | "self-dep"
    | "cycle"
    | "unknown-lane"
    | "unknown-phase"
    | "phase-order"
    | "desc-edge"
    | "ip-no-patent-node"
    | "ip-disclosure-before-patent"
    | "empty";
  nodeId?: string;
  message: string;
}

export interface CheckOptions {
  /** When true, enforce the IP sequencing rule (Section 6). */
  prePatent?: boolean;
}

export type PlanLike = { nodes: NodeLike[]; lanes: Pick<Plan["lanes"][number], "id">[]; phases: Pick<Plan["phases"][number], "n">[] };

/** Runs every structural check. Errors block rendering; warnings are surfaced. */
export function checkPlan(plan: PlanLike, opts: CheckOptions = {}): Finding[] {
  const findings: Finding[] = [];
  const { nodes } = plan;
  if (!nodes.length) {
    findings.push({ level: "error", code: "empty", message: "Plan has no nodes." });
    return findings;
  }

  const seen = new Set<string>();
  for (const n of nodes) {
    if (seen.has(n.id)) findings.push({ level: "error", code: "duplicate-id", nodeId: n.id, message: `Duplicate node id ${n.id}.` });
    seen.add(n.id);
  }
  const byId = indexNodes(nodes);
  const laneIds = new Set(plan.lanes.map((l) => l.id));
  const phaseNs = new Set(plan.phases.map((p) => p.n));

  for (const n of nodes) {
    if (!laneIds.has(n.lane)) findings.push({ level: "error", code: "unknown-lane", nodeId: n.id, message: `${n.id} is in lane '${n.lane}', which is not defined.` });
    if (!phaseNs.has(n.phase)) findings.push({ level: "error", code: "unknown-phase", nodeId: n.id, message: `${n.id} is in phase ${n.phase}, which is not defined.` });
    for (const d of n.deps) {
      if (d === n.id) findings.push({ level: "error", code: "self-dep", nodeId: n.id, message: `${n.id} depends on itself.` });
      else if (!byId.has(d)) findings.push({ level: "error", code: "dangling-dep", nodeId: n.id, message: `${n.id} depends on ${d}, which does not exist.` });
      else {
        const dep = byId.get(d)!;
        if (dep.phase > n.phase)
          findings.push({ level: "warning", code: "phase-order", nodeId: n.id, message: `${n.id} (phase ${n.phase}) depends on ${d} (phase ${dep.phase}) — a dependency should not sit in a later phase.` });
      }
    }
  }

  findings.push(...findCycles(nodes));
  findings.push(...lintDescEdges(nodes));
  if (opts.prePatent) findings.push(...checkIpSequencing(nodes));
  return findings;
}

/** DFS three-colour cycle detection. Reports each cycle once as a path. */
export function findCycles(nodes: NodeLike[]): Finding[] {
  const byId = indexNodes(nodes);
  const color = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const out: Finding[] = [];
  const reported = new Set<string>();

  const visit = (id: string) => {
    color.set(id, 1);
    stack.push(id);
    for (const d of byId.get(id)?.deps ?? []) {
      if (!byId.has(d)) continue;
      const c = color.get(d) ?? 0;
      if (c === 0) visit(d);
      else if (c === 1) {
        const cyc = [...stack.slice(stack.indexOf(d)), d];
        const key = [...cyc].sort().join(">");
        if (!reported.has(key)) {
          reported.add(key);
          out.push({ level: "error", code: "cycle", nodeId: id, message: `Circular dependency: ${cyc.join(" → ")}.` });
        }
      }
    }
    stack.pop();
    color.set(id, 2);
  };
  for (const n of nodes) if ((color.get(n.id) ?? 0) === 0) visit(n.id);
  return out;
}

/**
 * Every claim in a description must be a real graph edge. If a node's text
 * names another node id, the two must be connected by a dependency path in
 * one direction or the other ("this feeds X" ⇒ X is downstream; "see X" ⇒
 * X is upstream). Sibling mentions with no path are flagged.
 */
export function lintDescEdges(nodes: NodeLike[]): Finding[] {
  const byId = indexNodes(nodes);
  const out: Finding[] = [];
  const ids = [...byId.keys()].sort((a, b) => b.length - a.length);
  if (!ids.length) return out;
  const re = new RegExp(`(?<![A-Za-z0-9_-])(${ids.map(escapeRe).join("|")})(?![A-Za-z0-9_-])`, "g");

  for (const n of nodes) {
    const text = stripTags(n.desc ?? "");
    const mentioned = new Set<string>();
    for (const m of text.matchAll(re)) if (m[1] !== n.id) mentioned.add(m[1]);
    if (!mentioned.size) continue;
    const up = ancestorsOf(n.id, byId);
    for (const other of mentioned) {
      const down = ancestorsOf(other, byId); // n is upstream of `other` if n ∈ ancestors(other)
      if (up.has(other) || down.has(n.id)) continue;
      out.push({
        level: "warning",
        code: "desc-edge",
        nodeId: n.id,
        message: `${n.id}'s description mentions ${other}, but there is no dependency path between them. Either add the edge or drop the reference.`,
      });
    }
  }
  return out;
}

/**
 * IP sequencing rule: when the startup is pre-patent, a 'patent-filing' node
 * must exist and every 'public-disclosure' node must sit downstream of it.
 */
export function checkIpSequencing(nodes: NodeLike[]): Finding[] {
  const byId = indexNodes(nodes);
  const patent = nodes.filter((n) => n.tags?.includes("patent-filing"));
  const disclosures = nodes.filter((n) => n.tags?.includes("public-disclosure"));
  const out: Finding[] = [];
  if (!patent.length) {
    out.push({ level: "error", code: "ip-no-patent-node", message: "Pre-patent startup but the plan has no 'patent-filing' node." });
    return out;
  }
  const patentIds = new Set(patent.map((p) => p.id));
  for (const d of disclosures) {
    const anc = ancestorsOf(d.id, byId);
    if (![...patentIds].some((p) => anc.has(p))) {
      out.push({
        level: "error",
        code: "ip-disclosure-before-patent",
        nodeId: d.id,
        message: `${d.id} (${d.title ?? "public disclosure"}) is a public-disclosure step but does not depend on the patent filing (${[...patentIds].join(", ")}).`,
      });
    }
  }
  return out;
}

export function hasErrors(findings: Finding[]): boolean {
  return findings.some((f) => f.level === "error");
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function stripTags(s: string) {
  return s.replace(/<[^>]+>/g, " ");
}
