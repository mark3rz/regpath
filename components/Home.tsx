"use client";

import { useCallback, useRef, useState } from "react";
import type { Answers, Intake, Plan } from "@/lib/schema";
import type { Finding } from "@/lib/graph";
import { checkPlan } from "@/lib/graph";
import { PlanSchema } from "@/lib/schema";
import { prefillAnswers } from "@/lib/questions";
import { samplePlan } from "@/lib/sample-plan";
import IntakeForm from "@/components/IntakeForm";
import QuestionFlow from "@/components/QuestionFlow";
import GenerationProgress, { type ProgressLine } from "@/components/GenerationProgress";
import PathwayMap from "@/components/PathwayMap";
import Shell from "@/components/Shell";

type Step = "intake" | "questions" | "generating" | "map";

const STORAGE_KEY = "regpath:v1";

interface Session {
  intake: Intake | null;
  pitchText: string;
  answers: Answers;
  plan: Plan | null;
  findings: Finding[];
}

function restoreSession(): (Session & { step: Step }) | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session & { step: Step };
    if (s.plan) return { ...s, plan: PlanSchema.parse(s.plan), findings: s.findings ?? [], step: "map" };
    if (s.intake || s.pitchText) return { ...s, plan: null, findings: [], step: "questions" };
    return null;
  } catch {
    return null;
  }
}

export default function Home() {
  // Rendered client-only (see app/page.tsx), so the last session can be
  // restored in the initializer — a refresh mid-flow isn't a restart.
  const [restored] = useState<(Session & { step: Step }) | null>(() => restoreSession());
  const [step, setStep] = useState<Step>(restored?.step ?? "intake");
  const [session, setSession] = useState<Session>(
    restored ?? { intake: null, pitchText: "", answers: prefillAnswers(null), plan: null, findings: [] },
  );
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<ProgressLine[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const persist = useCallback((s: Session, st: Step) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, step: st }));
    } catch {
      /* ignore quota */
    }
  }, []);

  // ---- Step 1 → 2 -----------------------------------------------------------
  const onIntakeDone = (intake: Intake | null, pitchText: string) => {
    const answers = prefillAnswers(intake);
    const s = { ...session, intake, pitchText, answers, plan: null, findings: [] };
    setSession(s);
    setStep("questions");
    persist(s, "questions");
  };

  // ---- Step 2 → 3 → 4 --------------------------------------------------------
  const generate = async (answers: Answers) => {
    setError(null);
    setLog([]);
    const s = { ...session, answers };
    setSession(s);
    setStep("generating");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intake: s.intake, answers, pitchText: s.pitchText, previousPlan: s.plan }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const chunk = await reader.read();
        done = chunk.done;
        buf += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !done });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "ping") continue;
          if (ev.type === "result") {
            const plan = PlanSchema.parse(ev.plan);
            const findings: Finding[] = ev.findings ?? checkPlan(plan, { prePatent: answers.ipStatus === "pre-patent" });
            const next = { ...s, plan, findings };
            setSession(next);
            setStep("map");
            persist(next, "map");
            return;
          }
          if (ev.type === "error") throw new Error(ev.message);
          setLog((l) => [...l, toLine(ev)]);
        }
      }
      throw new Error("The generation stream ended without a result.");
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setStep("questions");
        return;
      }
      setError(err instanceof Error ? err.message : "Generation failed.");
      setStep("questions");
    } finally {
      abortRef.current = null;
    }
  };

  const cancelGeneration = () => abortRef.current?.abort();

  const loadSample = () => {
    const plan = samplePlan();
    const s: Session = { intake: null, pitchText: "", answers: prefillAnswers(null), plan, findings: checkPlan(plan) };
    setSession(s);
    setStep("map");
    persist(s, "map");
  };

  const loadPlanFile = async (file: File) => {
    try {
      const plan = PlanSchema.parse(JSON.parse(await file.text()));
      const s: Session = { ...session, plan, findings: checkPlan(plan, { prePatent: session.answers.ipStatus === "pre-patent" }) };
      setSession(s);
      setStep("map");
      persist(s, "map");
    } catch {
      setError("That file is not a RegPath plan JSON.");
    }
  };

  const startOver = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSession({ intake: null, pitchText: "", answers: prefillAnswers(null), plan: null, findings: [] });
    setError(null);
    setStep("intake");
  };

  if (step === "map" && session.plan) {
    return (
      <PathwayMap
        plan={session.plan}
        findings={session.findings}
        onRevise={() => setStep("questions")}
        onStartOver={startOver}
      />
    );
  }

  return (
    <Shell>
      {step === "intake" && <IntakeForm onDone={onIntakeDone} onLoadSample={loadSample} onLoadPlan={loadPlanFile} error={error} setError={setError} />}
      {step === "questions" && (
        <QuestionFlow
          intake={session.intake}
          initial={session.answers}
          hasPlan={Boolean(session.plan)}
          error={error}
          onBack={() => (session.plan ? setStep("map") : setStep("intake"))}
          onSubmit={generate}
        />
      )}
      {step === "generating" && <GenerationProgress lines={log} onCancel={cancelGeneration} />}
    </Shell>
  );
}

function toLine(ev: { type: string; message?: string; query?: string; count?: number; chars?: number; findings?: Finding[]; pass?: number }): ProgressLine {
  switch (ev.type) {
    case "search":
      return { kind: "search", text: ev.query ?? "" };
    case "found":
      return { kind: "info", text: `${ev.count} unique source URLs seen so far` };
    case "text":
      return { kind: "text", text: `drafting… ${Math.round((ev.chars ?? 0) / 1000)}k chars` };
    case "findings": {
      const n = ev.findings?.length ?? 0;
      return { kind: "info", text: n ? `pass ${ev.pass}: ${n} graph finding${n === 1 ? "" : "s"} — ${ev.findings!.slice(0, 3).map((f) => f.code).join(", ")}${n > 3 ? "…" : ""}` : `pass ${ev.pass}: graph integrity clean` };
    }
    default:
      return { kind: "status", text: ev.message ?? ev.type };
  }
}
