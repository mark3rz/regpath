"use client";

import { useRef, useState } from "react";
import type { Intake } from "@/lib/schema";

interface Props {
  onDone: (intake: Intake | null, pitchText: string) => void;
  onLoadSample: () => void;
  onLoadPlan: (file: File) => void;
  error: string | null;
  setError: (e: string | null) => void;
}

const PLACEHOLDER = `e.g. We're building a wearable patch plus app that flags early heart-failure decompensation after hospital discharge. Pilots are running at two hospitals; a pivotal trial is being designed. We want to file in Singapore first, then CE-mark for Germany and Spain…`;

export default function IntakeForm({ onDone, onLoadSample, onLoadPlan, error, setError }: Props) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const planRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!text.trim() && !file) {
      setError("Paste a product description or upload a deck first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("text", text);
      if (file) fd.append("file", file);
      const res = await fetch("/api/intake", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Intake failed (${res.status})`);
      onDone(j.intake, j.pitchText ?? text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Intake failed.");
    } finally {
      setBusy(false);
    }
  };

  const skip = () => {
    if (!text.trim()) {
      setError("Paste at least a short description to continue without parsing.");
      return;
    }
    onDone(null, text);
  };

  return (
    <div className="grid gap-5 md:grid-cols-[1fr_300px]">
      <div className="card p-6">
        <div className="eyebrow">STEP 1 OF 3 — YOUR PRODUCT</div>
        <h2 className="serif mt-1 text-lg font-semibold text-brand">Describe the product, or upload the deck</h2>
        <p className="mt-1 text-[0.8rem] text-ink-soft">
          RegPath v1 is scoped to regulated health, medtech and digital-health products (software as a medical device, digital
          therapeutics, connected health devices) expanding from one home market into the EU plus up to two member states.
        </p>
        <textarea
          className="mt-4 h-52 w-full resize-y rounded-[2px] border border-line bg-white p-3 text-[0.85rem] leading-relaxed outline-none focus:border-brand"
          placeholder={PLACEHOLDER}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.pptx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button className="btn btn-ghost" type="button" onClick={() => fileRef.current?.click()}>
            {file ? "Change deck" : "Upload pitch deck (PDF / PPTX)"}
          </button>
          {file && (
            <span className="mono text-[0.72rem] text-ink-soft">
              {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB{" "}
              <button className="ml-1 text-brand underline" type="button" onClick={() => setFile(null)}>
                remove
              </button>
            </span>
          )}
        </div>
        {error && <p className="mt-3 rounded-[2px] border border-[#F3B4B4] bg-[#FFEDED] px-3 py-2 text-[0.78rem] text-[#D64545]">{error}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className="btn" onClick={submit} disabled={busy}>
            {busy ? "Reading your pitch…" : "Parse & continue"}
          </button>
          <button className="btn btn-ghost" onClick={skip} disabled={busy} title="Skip the intake model call and answer every question yourself">
            Skip parsing — answer the questions manually
          </button>
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        <div className="card p-5">
          <div className="eyebrow">WHAT HAPPENS NEXT</div>
          <ol className="mt-2 list-decimal space-y-2 pl-4 text-[0.78rem]">
            <li>
              <strong>Intake parsing</strong> — one model call extracts product category, intended use, home market, stage, and flags
              what the pitch leaves ambiguous.
            </li>
            <li>
              <strong>Strategy questions</strong> — a short set of single/multi-select questions, prefilled where the pitch already
              answered them. Hardware form and IP status come first because they change everything downstream.
            </li>
            <li>
              <strong>Generation</strong> — Claude researches each jurisdiction with live web search and emits a dependency graph, which
              is integrity-checked (no cycles, no dangling references, every prose claim is a real edge) before it renders.
            </li>
          </ol>
        </div>
        <div className="card p-5">
          <div className="eyebrow">NO API KEY HANDY?</div>
          <p className="mt-2 text-[0.78rem] text-ink-soft">See the finished output first with the sample map, or reopen a plan you downloaded earlier.</p>
          <div className="mt-3 flex flex-col gap-2">
            <button className="btn btn-ghost justify-center" onClick={onLoadSample}>
              Load sample map (Cadence Health — fictional)
            </button>
            <input ref={planRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && onLoadPlan(e.target.files[0])} />
            <button className="btn btn-ghost justify-center" onClick={() => planRef.current?.click()}>
              Open a saved plan (.json)
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
