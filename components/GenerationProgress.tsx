"use client";

import { useEffect, useRef } from "react";

export interface ProgressLine {
  kind: "status" | "search" | "info" | "text";
  text: string;
}

export default function GenerationProgress({ lines, onCancel }: { lines: ProgressLine[]; onCancel: () => void }) {
  const endRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lines.length]);

  const searches = lines.filter((l) => l.kind === "search").length;
  const latestStatus = [...lines].reverse().find((l) => l.kind === "status")?.text ?? "Starting…";
  const draft = [...lines].reverse().find((l) => l.kind === "text")?.text;

  return (
    <div className="card p-6">
      <div className="eyebrow">GENERATING</div>
      <h2 className="serif mt-1 text-lg font-semibold text-brand">{latestStatus}</h2>
      <p className="mt-1 text-[0.8rem] text-ink-soft">
        The model is researching each jurisdiction with live web search, drafting the node graph, then running the integrity checks and
        one repair pass. A full run at default effort takes 10–20 minutes — leave this tab open.
        {searches > 0 && ` ${searches} search${searches === 1 ? "" : "es"} so far.`}
        {draft && ` ${draft}.`}
      </p>
      <div className="pulse-bar mt-4" />
      <ul className="progress-log mt-4">
        {lines
          .filter((l) => l.kind !== "text")
          .map((l, i) => (
            <li key={i} className={l.kind}>
              {l.text}
            </li>
          ))}
        <li ref={endRef} className="border-none" />
      </ul>
      <div className="mt-4 flex justify-end">
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
