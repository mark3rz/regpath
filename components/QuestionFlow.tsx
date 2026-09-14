"use client";

import { useMemo, useState } from "react";
import type { Answers, Intake } from "@/lib/schema";
import { answersComplete, buildQuestions, type Question } from "@/lib/questions";
import ApiKeyPanel from "@/components/ApiKeyPanel";

interface Props {
  intake: Intake | null;
  initial: Answers;
  hasPlan: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: (answers: Answers) => void;
}

/**
 * Adaptive question flow. Every question is a fixed option set (single or
 * multi-select); answers the intake step already extracted are preselected
 * and shown as "from your pitch" so the founder can confirm or override.
 */
export default function QuestionFlow({ intake, initial, hasPlan, error, onBack, onSubmit }: Props) {
  const questions = useMemo(() => buildQuestions(intake), [intake]);
  const [answers, setAnswers] = useState<Answers>(initial);
  const [other, setOther] = useState<Record<string, string>>({});
  const missing = answersComplete(answers);

  const valueOf = (q: Question): string | string[] => {
    if (q.id.startsWith("extra:")) return answers.extra[q.id.slice(6)] ?? (q.multi ? [] : "");
    return answers[q.id as keyof Omit<Answers, "extra">];
  };
  const setValue = (q: Question, v: string | string[]) => {
    setAnswers((a) => (q.id.startsWith("extra:") ? { ...a, extra: { ...a.extra, [q.id.slice(6)]: v } } : { ...a, [q.id]: v }));
  };
  const toggle = (q: Question, opt: string) => {
    const cur = valueOf(q);
    if (q.multi) {
      const arr = Array.isArray(cur) ? cur : [];
      if (arr.includes(opt)) setValue(q, arr.filter((x) => x !== opt));
      else if (!q.max || arr.length < q.max) setValue(q, [...arr, opt]);
    } else setValue(q, cur === opt ? "" : opt);
  };
  const prefilledFrom = (q: Question): boolean => {
    const v = initial[q.id as keyof Omit<Answers, "extra">];
    return Boolean(intake) && !q.id.startsWith("extra:") && (Array.isArray(v) ? v.length > 0 : Boolean(v)) && q.id !== "riskTolerance";
  };

  return (
    <div className="grid gap-5 md:grid-cols-[1fr_300px]">
      <div className="flex flex-col gap-4">
        <div className="card p-6">
          <div className="eyebrow">STEP 2 OF 3 — STRATEGY QUESTIONS</div>
          <h2 className="serif mt-1 text-lg font-semibold text-brand">A few questions that change the map</h2>
          <p className="mt-1 text-[0.8rem] text-ink-soft">
            Each answer below alters classification, sequencing, or which lanes appear. Anything marked <em>from your pitch</em> was
            extracted from what you gave us — confirm or change it.
          </p>
        </div>

        {questions.map((q, idx) => {
          const val = valueOf(q);
          const isOtherHome = q.id === "homeMarket" && typeof val === "string" && val !== "" && !q.options.some((o) => o.value === val);
          return (
            <div className="card p-5" key={q.id}>
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <span className="mono mr-2 text-[0.66rem] text-ink-soft">Q{idx + 1}</span>
                  <span className="text-[0.9rem] font-semibold">{q.question}</span>
                </div>
                {prefilledFrom(q) && <span className="badge-inline">from your pitch</span>}
              </div>
              {q.why && <p className="mt-1 text-[0.76rem] text-ink-soft">{q.why}</p>}
              <div className={`mt-3 grid gap-2 ${q.options.length > 8 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                {q.options.map((o) => {
                  const on = Array.isArray(val) ? val.includes(o.value) : val === o.value;
                  return (
                    <button type="button" key={o.value} className={`opt ${q.multi ? "" : "radio"} ${on ? "on" : ""}`} onClick={() => toggle(q, o.value)}>
                      <span className="mark">✓</span>
                      <span>
                        <span className="block text-[0.8rem] font-semibold leading-tight">{o.label}</span>
                        {o.hint && <span className="block text-[0.7rem] text-ink-soft">{o.hint}</span>}
                      </span>
                    </button>
                  );
                })}
                {q.allowOther && (
                  <div className={`opt ${isOtherHome ? "on" : ""}`}>
                    <span className="mark">✓</span>
                    <input
                      className="w-full bg-transparent text-[0.8rem] outline-none"
                      placeholder="Other market…"
                      value={isOtherHome ? (val as string) : other[q.id] ?? ""}
                      onChange={(e) => {
                        setOther((o) => ({ ...o, [q.id]: e.target.value }));
                        setValue(q, e.target.value);
                      }}
                    />
                  </div>
                )}
              </div>
              {q.multi && q.max && <p className="mt-2 text-[0.7rem] text-ink-soft">Up to {q.max}. {Array.isArray(val) && val.length ? `Selected: ${val.join(", ")}` : ""}</p>}
            </div>
          );
        })}

        {error && <p className="rounded-[2px] border border-[#F3B4B4] bg-[#FFEDED] px-3 py-2 text-[0.78rem] text-[#D64545]">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-ghost" onClick={onBack}>
            {hasPlan ? "Back to map" : "Back"}
          </button>
          <button className="btn" disabled={missing.length > 0} onClick={() => onSubmit(answers)}>
            {hasPlan ? "Regenerate with these answers" : "Generate pathway map"}
          </button>
          {missing.length > 0 && <span className="text-[0.74rem] text-ink-soft">{missing.length} question{missing.length === 1 ? "" : "s"} still unanswered</span>}
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        <ApiKeyPanel
          eyebrow="STEP 3 NEEDS YOUR OWN KEY"
          note="Running the research and building the strategy map is always billed to a key you enter here — it never uses a key configured on the server. Parsing your pitch may have used the server's key."
        />
        {intake && (
          <div className="card p-5">
            <div className="eyebrow">WHAT WE READ FROM YOUR PITCH</div>
            <dl className="mt-2 space-y-2 text-[0.76rem]">
              <Row k="Company" v={intake.companyName || "—"} />
              <Row k="Product" v={intake.productName} />
              <Row k="Category" v={intake.productCategory} />
              <Row k="Intended use" v={intake.intendedUse} />
              <Row k="Population" v={intake.population} />
            </dl>
            {intake.ambiguities.length > 0 && (
              <>
                <div className="eyebrow mt-4">LEFT AMBIGUOUS</div>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-[0.74rem] text-ink-soft">
                  {intake.ambiguities.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </>
            )}
            {!intake.inScope && (
              <p className="mt-3 rounded-[2px] border border-[#F2D28C] bg-[#FFF7E6] px-3 py-2 text-[0.74rem] text-[#B27B00]">
                This product looks outside RegPath v1&apos;s scope (regulated health / medtech). {intake.scopeNote} You can continue, but expect thinner output.
              </p>
            )}
          </div>
        )}
        <div className="card p-5">
          <div className="eyebrow">WHY THESE QUESTIONS</div>
          <p className="mt-2 text-[0.76rem] text-ink-soft">
            Software-vs-hardware and IP status are asked first because they change classification and sequencing everywhere. Country
            choices add lanes. Staffing and risk tolerance shape how parallel the plan is.
          </p>
        </div>
      </aside>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-2">
      <dt className="text-ink-soft">{k}</dt>
      <dd className="m-0">{v}</dd>
    </div>
  );
}
