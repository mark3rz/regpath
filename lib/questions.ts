import type { Answers, Intake } from "./schema";

/**
 * Adaptive clarifying questions. The core set is a fixed sequence (ordered so
 * the classification-changing answer comes first); intake extraction prefills
 * what the pitch already answered and appends up to three product-specific
 * questions. Every question is single/multi-select — no free text — because
 * fixed option sets are what the generation prompt keys off.
 */

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

export interface Question {
  id: keyof Omit<Answers, "extra"> | `extra:${string}`;
  question: string;
  why?: string;
  options: Option[];
  multi?: boolean;
  max?: number;
  /** Allow an "Other" free-text value in addition to options. */
  allowOther?: boolean;
}

export const EU_MEMBER_STATES = [
  "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czechia", "Denmark", "Estonia", "Finland", "France", "Germany",
  "Greece", "Hungary", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands", "Poland", "Portugal",
  "Romania", "Slovakia", "Slovenia", "Spain", "Sweden",
];

export const HOME_MARKETS = [
  "United States", "United Kingdom", "Australia", "Canada", "Switzerland", "Singapore", "Japan", "Israel", "New Zealand",
  ...EU_MEMBER_STATES,
];

export const CORE_QUESTIONS: Question[] = [
  {
    id: "productForm",
    question: "Is the product software-only, or does it ship with hardware?",
    why: "This single answer changes classification and manufacturer-registration requirements in every jurisdiction — it has to be locked before anything else.",
    options: [
      { value: "software-only", label: "Software only", hint: "Runs on the user's own phone, tablet or PC" },
      { value: "off-the-shelf-hardware", label: "Software + off-the-shelf hardware", hint: "e.g. a consumer tablet you supply but don't modify" },
      { value: "bundled-custom-hardware", label: "Bundled or customized hardware", hint: "Sensor, wearable, enclosure, modified device" },
      { value: "unsure", label: "Not decided yet", hint: "The plan will add a decision node for this" },
    ],
  },
  {
    id: "homeMarket",
    question: "Which is your home market for the first filing?",
    options: HOME_MARKETS.map((m) => ({ value: m, label: m })),
    allowOther: true,
  },
  {
    id: "trialStatus",
    question: "Where does the clinical trial in that home market stand?",
    options: [
      { value: "none", label: "No trial planned", hint: "Literature or equivalence-based evidence only" },
      { value: "planned", label: "Planned, not started", hint: "Endpoints still open — the EU evidence plan can shape them" },
      { value: "running", label: "Running now" },
      { value: "completed", label: "Completed", hint: "Results in hand, possibly unpublished" },
    ],
  },
  {
    id: "stage",
    question: "Which best describes the product's overall stage?",
    options: [
      { value: "pre-clinical", label: "Pre-clinical / prototype" },
      { value: "pilot", label: "Pilots in the field, no formal trial" },
      { value: "trial", label: "In or past a formal trial" },
      { value: "on-market", label: "Already sold somewhere", hint: "e.g. as wellness or under a lower-risk class" },
    ],
  },
  {
    id: "euTargets",
    question: "Which EU member states matter most commercially? (pick up to two)",
    why: "CE marking covers the whole EU, but reimbursement, health-data hosting and ethics review are national — each country you pick adds a lane.",
    options: EU_MEMBER_STATES.map((m) => ({ value: m, label: m })),
    multi: true,
    max: 2,
  },
  {
    id: "ipStatus",
    question: "What is your IP / patent position?",
    why: "If you're pre-patent, the plan must sequence a priority filing before any public-disclosure step (trial registry entry, publication, public pilot announcements, hospital procurement conversations without an NDA).",
    options: [
      { value: "pre-patent", label: "Pre-patent — nothing filed yet" },
      { value: "provisional-filed", label: "Provisional / priority application filed" },
      { value: "granted", label: "Patent(s) granted" },
      { value: "not-applicable", label: "Not pursuing patents", hint: "Trade secret, open-source or nothing patentable" },
    ],
  },
  {
    id: "aiFeatures",
    question: "Does the product include AI or algorithmic decision-support?",
    why: "Triggers an added regulatory layer (e.g. the EU AI Act via MDR Art. 43, TGA's AI evidence expectations).",
    options: [
      { value: "none", label: "No algorithmic decision support" },
      { value: "rule-based", label: "Rule-based logic only", hint: "Deterministic thresholds, no learned model" },
      { value: "ml-locked", label: "Machine-learned model, locked", hint: "Trained once, frozen before release" },
      { value: "ml-adaptive", label: "Machine-learned model, adaptive", hint: "Keeps learning after release" },
    ],
  },
  {
    id: "regTeam",
    question: "How will regulatory work be staffed?",
    options: [
      { value: "in-house", label: "In-house regulatory team" },
      { value: "consultancy", label: "Consultancy / CRO" },
      { value: "hybrid", label: "Hybrid", hint: "One RA backbone plus country specialists" },
      { value: "undecided", label: "Undecided", hint: "The plan will add a decision node for this" },
    ],
  },
  {
    id: "riskTolerance",
    question: "How aggressive should the sequencing be?",
    why: "Sets how much the generated plan runs in parallel versus waiting for each gate to close.",
    options: [
      { value: "aggressive", label: "Aggressive — maximize parallel work", hint: "Accept rework risk to save months" },
      { value: "balanced", label: "Balanced" },
      { value: "conservative", label: "Conservative — sequential, low rework", hint: "Lock each gate before spending on the next" },
    ],
  },
];

/** Builds the full question list for an intake, prefilled where the pitch answered. */
export function buildQuestions(intake: Intake | null): Question[] {
  const qs = [...CORE_QUESTIONS];
  for (const q of intake?.extraQuestions ?? []) {
    if (!q.options?.length) continue;
    qs.push({
      id: `extra:${q.id}`,
      question: q.question,
      options: q.options.map((o) => ({ value: o, label: o })),
      multi: q.multi,
    });
  }
  return qs;
}

export function prefillAnswers(intake: Intake | null): Answers {
  const a: Answers = {
    productForm: "",
    homeMarket: "",
    trialStatus: "",
    euTargets: [],
    ipStatus: "",
    aiFeatures: "",
    regTeam: "",
    riskTolerance: "balanced",
    stage: "",
    extra: {},
  };
  if (!intake) return a;
  if (intake.hardware !== "unknown") a.productForm = intake.hardware;
  if (intake.homeMarket) a.homeMarket = intake.homeMarket;
  if (intake.stage === "trial-planned") a.trialStatus = "planned";
  else if (intake.stage === "trial-running") a.trialStatus = "running";
  else if (intake.stage === "post-trial") a.trialStatus = "completed";
  if (intake.stage === "pre-clinical") a.stage = "pre-clinical";
  else if (intake.stage === "trial-planned" || intake.stage === "trial-running" || intake.stage === "post-trial") a.stage = "trial";
  else if (intake.stage === "on-market") a.stage = "on-market";
  a.euTargets = intake.euTargets.filter((m) => EU_MEMBER_STATES.includes(m)).slice(0, 2);
  if (intake.ipStatus !== "unknown") a.ipStatus = intake.ipStatus;
  if (intake.aiFeatures !== "unknown") a.aiFeatures = intake.aiFeatures;
  return a;
}

export function answersComplete(a: Answers): string[] {
  const missing: string[] = [];
  for (const q of CORE_QUESTIONS) {
    const v = a[q.id as keyof Omit<Answers, "extra">];
    if (q.multi ? !(v as string[]).length : !v) missing.push(q.id);
  }
  return missing;
}

export function labelFor(q: Question, value: string): string {
  return q.options.find((o) => o.value === value)?.label ?? value;
}
