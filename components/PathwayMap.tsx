"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Plan, PathwayNode } from "@/lib/schema";
import { buildActionTiers, indexNodes, tierBadgeClass, tierLabel, tierOf, type Finding } from "@/lib/graph";
import { laneColors, riskColor } from "@/lib/palette";
import { sanitizeHtml } from "@/lib/sanitize";

interface Props {
  plan: Plan;
  findings?: Finding[];
  onRevise?: () => void;
  onStartOver?: () => void;
}

type View = "map" | "actions";

/**
 * Swimlane board + tiered checklist, ported from the single-file prototype. The card
 * markup, connector routing and urgency tiering are carried over as-is; React
 * only owns which node is selected and which tab is active.
 */
export default function PathwayMap({ plan, findings = [], onRevise, onStartOver }: Props) {
  const [view, setView] = useState<View>("map");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const byId = useMemo(() => indexNodes(plan.nodes), [plan.nodes]);
  const colors = useMemo(() => laneColors(plan.lanes), [plan.lanes]);
  const phases = useMemo(() => [...plan.phases].sort((a, b) => a.n - b.n), [plan.phases]);
  const tiers = useMemo(() => buildActionTiers(plan.nodes), [plan.nodes]);
  const laneOf = useCallback((id: string) => plan.lanes.find((l) => l.id === byId.get(id)?.lane), [plan.lanes, byId]);

  // ---- Connectors ---------------------------------------------------------
  const drawEdges = useCallback(() => {
    const svg = svgRef.current;
    const board = boardRef.current;
    if (!svg || !board) return;
    const boardRect = board.getBoundingClientRect();
    svg.setAttribute("width", String(boardRect.width));
    svg.setAttribute("height", String(boardRect.height));
    svg.innerHTML = "";
    for (const n of plan.nodes) {
      for (const depId of n.deps) {
        const from = board.querySelector<HTMLElement>(`[data-node-id="${cssEscape(depId)}"]`);
        const to = board.querySelector<HTMLElement>(`[data-node-id="${cssEscape(n.id)}"]`);
        if (!from || !to) continue;
        const depNode = byId.get(depId);
        const samePhase = depNode && depNode.phase === n.phase;
        const fr = from.getBoundingClientRect();
        const tr = to.getBoundingClientRect();
        const y1 = fr.top + fr.height / 2 - boardRect.top;
        const y2 = tr.top + tr.height / 2 - boardRect.top;
        let x1: number, x2: number, midX: number;
        if (samePhase) {
          // Same column: bow the connector out to the left margin instead of
          // sweeping backward through the column's other cards.
          x1 = fr.left - boardRect.left;
          x2 = tr.left - boardRect.left;
          midX = Math.min(x1, x2) - 18;
        } else {
          x1 = fr.right - boardRect.left;
          x2 = tr.left - boardRect.left;
          midX = (x1 + x2) / 2;
        }
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`);
        path.dataset.from = depId;
        path.dataset.to = n.id;
        if (currentId && (depId === currentId || n.id === currentId)) path.classList.add("highlight");
        svg.appendChild(path);
      }
    }
  }, [plan.nodes, byId, currentId]);

  useLayoutEffect(() => {
    if (view !== "map") return;
    drawEdges();
    const t = setTimeout(drawEdges, 250); // fonts settle
    return () => clearTimeout(t);
  }, [view, drawEdges]);

  useEffect(() => {
    const onResize = () => {
      if (view === "map") drawEdges();
    };
    window.addEventListener("resize", onResize);
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(onResize).catch(() => {});
    }
    return () => window.removeEventListener("resize", onResize);
  }, [view, drawEdges]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCurrentId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const openPanel = (id: string) => setCurrentId(id);
  const closePanel = () => setCurrentId(null);
  const jumpToNode = (id: string) => {
    setView("map");
    setTimeout(() => setCurrentId(id), 60);
  };

  const current = currentId ? byId.get(currentId) ?? null : null;
  const errors = findings.filter((f) => f.level === "error");
  const warnings = findings.filter((f) => f.level === "warning");

  const gridCols = `132px repeat(${phases.length}, minmax(196px, 1fr))`;
  const minWidth = 132 + phases.length * 202;

  return (
    <div className="rp">
      <div className="wrap">
        <div className="doc-header">
          <Swoosh />
          <div className="eyebrow">
            <span>{plan.company.toUpperCase()} — INTERNAL STRATEGY DOCUMENT</span>
            <span>CONFIDENTIAL</span>
          </div>
          <h1>Regulatory Pathway Map</h1>
          <p>{plan.headline}</p>
        </div>

        <div className="tabs">
          <button className={`tab ${view === "map" ? "active" : ""}`} onClick={() => setView("map")}>
            Pathway Map
          </button>
          <button className={`tab ${view === "actions" ? "active" : ""}`} onClick={() => setView("actions")}>
            Immediate Next Steps
          </button>
          <span className="spacer" />
          <button className="tool" onClick={() => downloadJson(plan)}>
            Download JSON
          </button>
          {onRevise && (
            <button className="tool" onClick={onRevise}>
              Revise answers
            </button>
          )}
          {onStartOver && (
            <button className="tool" onClick={onStartOver}>
              Start over
            </button>
          )}
        </div>

        <div className="content-pad">
          <div className={`view ${view === "map" ? "active" : ""}`}>
            {errors.length > 0 && (
              <div className="warnbox error">
                <h2>GRAPH INTEGRITY ERRORS — THIS MAP MAY BE INCOMPLETE</h2>
                <ul>
                  {errors.map((f, i) => (
                    <li key={i}>{f.message}</li>
                  ))}
                </ul>
              </div>
            )}
            {(plan.warnings.length > 0 || warnings.length > 0) && (
              <div className="warnbox">
                <h2>FLAGS TO READ BEFORE ACTING</h2>
                <ul>
                  {plan.warnings.map((w, i) => (
                    <li key={`p${i}`}>{w}</li>
                  ))}
                  {warnings.map((f, i) => (
                    <li key={`f${i}`}>{f.message}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="readme">
              <h2>HOW TO READ THIS MAP</h2>
              {plan.readme.map((p, i) => (
                <p key={i} dangerouslySetInnerHTML={{ __html: sanitizeHtml(p) }} />
              ))}
            </div>

            <div className="legend">
              <div className="legend-group">
                <span className="legend-title">Track</span>
                {plan.lanes.map((l) => (
                  <span className="chip" key={l.id}>
                    <span className="swatch" style={{ background: colors[l.id] }} />
                    {l.name}
                  </span>
                ))}
              </div>
              <div className="legend-sep" />
              <div className="legend-group">
                <span className="legend-title">Risk</span>
                <span className="chip">
                  <span className="dot" style={{ background: "var(--risk-high)" }} />
                  High
                </span>
                <span className="chip">
                  <span className="dot" style={{ background: "var(--risk-med)" }} />
                  Medium
                </span>
                <span className="chip">
                  <span className="dot" style={{ background: "var(--risk-low)" }} />
                  Low
                </span>
              </div>
              <div className="legend-sep" />
              <div className="legend-group">
                <span className="legend-title">Status</span>
                <span className="chip">
                  <span className="badge badge-now">NOW</span> No prerequisites
                </span>
                <span className="chip">
                  <span className="badge badge-soon">SOON</span> Fast decision pending
                </span>
                <span className="chip">
                  <span className="badge badge-partial">PARTIAL</span> One piece only, rest blocked
                </span>
                <span className="chip">
                  <span className="badge badge-wait">PENDING</span> Waits on a trigger
                </span>
              </div>
              <div className="legend-sep" />
              <div className="legend-group">
                <span className="legend-title">Flags</span>
                <span className="chip">
                  <span className="badge badge-decision">DECISION</span> Needs CEO sign-off
                </span>
                <span className="chip">
                  <span className="badge badge-shared">SHARED</span> Reused across jurisdictions
                </span>
              </div>
            </div>

            <div className="board-scroll">
              <div className="board" ref={boardRef} style={{ gridTemplateColumns: gridCols, minWidth }}>
                <svg className="edges" ref={svgRef} />
                <div className="corner" />
                {phases.map((p) => (
                  <div className="phase-head" key={p.n}>
                    PHASE {p.n}
                    <span className="n">{p.title}</span>
                  </div>
                ))}
                {plan.lanes.map((lane) => (
                  <LaneRow
                    key={lane.id}
                    laneId={lane.id}
                    name={lane.name}
                    note={lane.note}
                    color={colors[lane.id]}
                    phases={phases.map((p) => p.n)}
                    nodes={plan.nodes.filter((n) => n.lane === lane.id)}
                    byId={byId}
                    currentId={currentId}
                    onOpen={openPanel}
                  />
                ))}
              </div>
            </div>

            <footer className="note">
              Relative sequencing and durations, not calendar-accurate dates. {plan.disclaimer} Standards links point to their official
              ISO/IEC or EUR-Lex source — verify current edition before purchase or citation. Any link marked &ldquo;unverified&rdquo; was
              not confirmed by a live web search during generation.
              {!plan.webSearchUsed && " Web search was not available for this generation — treat every named organization and URL as unverified."}
            </footer>
          </div>

          <div className={`view ${view === "actions" ? "active" : ""}`}>
            <p className="actions-intro">
              Tiered by how genuinely unblocked each action is — not everything tagged &ldquo;now&rdquo; on the map means the same thing. Click
              any item to jump to its full detail. Checking an item off is just for your own tracking in this session — it isn&apos;t saved.
            </p>
            <div>
              {tiers
                .filter((t) => t.items.length)
                .map((t) => (
                  <div className="actions-lane" key={t.key}>
                    <h2>{t.title}</h2>
                    <p className="lane-sub">{t.sub}</p>
                    {t.items.map((it, i) => (
                      <ActionRow key={`${it.nodeId}-${i}`} item={it} color={colors[laneOf(it.nodeId)?.id ?? ""]} onJump={jumpToNode} />
                    ))}
                  </div>
                ))}
            </div>
          </div>
        </div>

        <div className="doc-footer">
          <span>{plan.company} — Regulatory Pathway Map</span>
          <span>Prepared for internal use — not legal advice</span>
        </div>
      </div>

      <div className={`scrim ${current ? "show" : ""}`} onClick={closePanel} />
      <div className={`panel ${current ? "show" : ""}`} aria-hidden={!current}>
        {current && (
          <DetailPanel node={current} plan={plan} byId={byId} colors={colors} onClose={closePanel} onJump={openPanel} />
        )}
      </div>
    </div>
  );
}

// ---- Sub-components -------------------------------------------------------

function LaneRow({
  laneId,
  name,
  note,
  color,
  phases,
  nodes,
  byId,
  currentId,
  onOpen,
}: {
  laneId: string;
  name: string;
  note: string;
  color: string;
  phases: number[];
  nodes: PathwayNode[];
  byId: Map<string, PathwayNode>;
  currentId: string | null;
  onOpen: (id: string) => void;
}) {
  return (
    <>
      <div className="lane-label">
        <span className="lane-name">
          <span className="swatch" style={{ background: color }} />
          {name}
        </span>
        <span className="lane-note">{note}</span>
      </div>
      {phases.map((phase) => (
        <div className="cell" key={`${laneId}-${phase}`} data-lane={laneId} data-phase={phase}>
          {nodes
            .filter((n) => n.phase === phase)
            .map((n) => (
              <NodeCard key={n.id} n={n} color={color} byId={byId} selected={currentId === n.id} onOpen={onOpen} />
            ))}
        </div>
      ))}
    </>
  );
}

function NodeCard({
  n,
  color,
  byId,
  selected,
  onOpen,
}: {
  n: PathwayNode;
  color: string;
  byId: Map<string, PathwayNode>;
  selected: boolean;
  onOpen: (id: string) => void;
}) {
  const tier = tierOf(n, byId);
  return (
    <div
      className={`node ${selected ? "selected" : ""}`}
      data-node-id={n.id}
      style={{ borderLeftColor: color, ["--lane-color" as string]: color }}
      onClick={() => onOpen(n.id)}
    >
      <div className="id-row">
        <span className="id">{n.id}</span>
        <span className="risk-dot" style={{ background: riskColor(n.risk) }} title={`${n.risk} risk`} />
      </div>
      <span className="title">{n.title}</span>
      <div className="meta">
        <span className={`badge ${tierBadgeClass(tier)}`}>{tier}</span>
        {n.decision && <span className="flag-dot decision" title="Needs CEO sign-off" />}
        {n.overlap && <span className="flag-dot shared" title="Reused across jurisdictions" />}
      </div>
      {n.keystone && n.keystoneNote && <span className="keystone-line">{n.keystoneNote}</span>}
    </div>
  );
}

function DetailPanel({
  node: n,
  plan,
  byId,
  colors,
  onClose,
  onJump,
}: {
  node: PathwayNode;
  plan: Plan;
  byId: Map<string, PathwayNode>;
  colors: Record<string, string>;
  onClose: () => void;
  onJump: (id: string) => void;
}) {
  const lane = plan.lanes.find((l) => l.id === n.lane);
  const tier = tierOf(n, byId);
  const riskText = n.risk === "high" ? "High" : n.risk === "med" ? "Medium" : "Low";
  const confText = n.confidence === "high" ? "High" : n.confidence === "med" ? "Medium" : "Low";
  return (
    <>
      <div className="panel-head">
        <div className="id-row">
          <span className="id">{n.id}</span>
          <button className="panel-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <h2>{n.title}</h2>
        <div className="panel-tags">
          {lane && (
            <span className="tag">
              <span className="swatch" style={{ background: colors[lane.id] }} />
              {lane.name}
            </span>
          )}
          <span className="tag">
            <span className="dot" style={{ background: riskColor(n.risk) }} />
            {riskText} risk
          </span>
          <span className={`badge ${tierBadgeClass(tier)}`}>{tier}</span>
          {n.overlap && <span className="badge badge-shared">SHARED</span>}
          {n.decision && <span className="badge badge-decision">DECISION</span>}
          {n.keystone && <span className="badge badge-key">KEY DRIVER</span>}
          <span className="badge badge-conf" title="Confidence in the sourcing behind this step">
            CONFIDENCE: {confText.toUpperCase()}
          </span>
        </div>
      </div>
      <div className="panel-body">
        <h3>Status</h3>
        <p className="panel-desc">{tierLabel(n, byId)}</p>
        <h3>What this step is</h3>
        <p className="panel-desc" dangerouslySetInnerHTML={{ __html: sanitizeHtml(n.desc) }} />
        {n.deps.length > 0 && (
          <>
            <h3>Depends on</h3>
            <div className="dep-list">
              {n.deps.map((d) => (
                <span className="dep-pill" key={d} onClick={() => onJump(d)}>
                  {d}
                </span>
              ))}
            </div>
          </>
        )}
        <h3>Step-by-step breakdown</h3>
        {n.micro && n.micro.length ? (
          <ul className="micro">
            {n.micro.map((s, i) => (
              <li className={s.now ? "now" : ""} key={i}>
                <span className="step-time">{s.time}</span>
                <span className="step-title">{s.title}</span>
                {s.detail && <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(s.detail) }} />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="no-micro">This is a single, discrete action rather than a multi-stage process.</p>
        )}
        {n.sources.length > 0 && (
          <>
            <h3>Sources</h3>
            <ul className="sources">
              {n.sources.map((s, i) => (
                <li key={i}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.title || s.url}
                  </a>
                  {!s.verified && <em className="unverified"> (unverified — confirm before use)</em>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}

function ActionRow({
  item,
  color,
  onJump,
}: {
  item: { nodeId: string; title: string; decision: boolean; note?: string };
  color: string;
  onJump: (id: string) => void;
}) {
  const [done, setDone] = useState(false);
  return (
    <div className={`action-item ${done ? "done" : ""}`} onClick={() => setDone((d) => !d)}>
      <span className="action-check">✓</span>
      <div className="action-body">
        <span
          className="action-title"
          onClick={(e) => {
            e.stopPropagation();
            onJump(item.nodeId);
          }}
        >
          <span className="swatch" style={{ background: color }} /> {item.title}
        </span>
        <div className="action-meta">
          <span className="action-node-id">{item.nodeId}</span>
          {item.note && <span>{item.note}</span>}
          {item.decision && <span className="badge badge-decision">DECISION</span>}
        </div>
      </div>
    </div>
  );
}

function Swoosh() {
  return (
    <svg className="swoosh" viewBox="0 0 700 200" preserveAspectRatio="xMaxYMid slice" xmlns="http://www.w3.org/2000/svg">
      <path d="M700,0 C540,10 410,75 330,145 C440,185 570,198 700,192 Z" fill="#FFFFFF" opacity="0.16" />
      <path d="M700,18 C570,42 465,95 400,155 C505,185 610,197 700,192 Z" fill="#FFFFFF" opacity="0.24" />
      <path d="M700,115 L700,200 L555,200 Z" fill="#050C22" opacity="0.5" />
      <path d="M700,0 C555,32 430,95 345,155" stroke="#FFFFFF" strokeWidth="2" opacity="0.6" fill="none" />
      <path d="M700,42 C598,72 495,115 422,163" stroke="#FFFFFF" strokeWidth="1" opacity="0.45" fill="none" />
    </svg>
  );
}

function cssEscape(s: string) {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&");
}

function downloadJson(plan: Plan) {
  const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${plan.company.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "regpath"}-pathway.json`;
  a.click();
  URL.revokeObjectURL(url);
}
