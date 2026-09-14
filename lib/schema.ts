import { z } from "zod";

/**
 * Data schema — ported from the single-file prototype's NODES/LANES objects, with the
 * few additions needed once lanes and phases are generated per startup
 * (lane kinds for colour assignment, per-node sources + confidence, tags for
 * the IP-sequencing rule, and a keystone note instead of a hardcoded string).
 */

export const LaneKind = z.enum(["shared", "evidence", "home", "eu", "country", "other"]);
export type LaneKind = z.infer<typeof LaneKind>;

export const LaneSchema = z.object({
  id: z.string().describe("short slug, e.g. 'shared', 'au', 'eu', 'fr'"),
  name: z.string(),
  note: z.string().describe("one-line note shown under the lane name"),
  kind: LaneKind,
});
export type Lane = z.infer<typeof LaneSchema>;

export const PhaseSchema = z.object({
  n: z.number().int(),
  title: z.string().describe("short label, e.g. 'Start Now', 'Building the File'"),
});
export type Phase = z.infer<typeof PhaseSchema>;

export const MicroStepSchema = z.object({
  title: z.string(),
  time: z.string(),
  detail: z.string(),
  now: z.boolean(),
});
export type MicroStep = z.infer<typeof MicroStepSchema>;

export const SourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  /** Set server-side: true only if the URL appeared in a live web-search result. */
  verified: z.boolean(),
});
export type Source = z.infer<typeof SourceSchema>;

export const NodeTag = z.enum(["patent-filing", "public-disclosure"]);
export type NodeTag = z.infer<typeof NodeTag>;

export const NodeSchema = z.object({
  id: z.string(),
  lane: z.string(),
  phase: z.number().int(),
  title: z.string(),
  duration: z.number().int(),
  risk: z.enum(["high", "med", "low"]),
  urgency: z.enum(["now", "wait"]),
  overlap: z.boolean(),
  decision: z.boolean(),
  keystone: z.boolean(),
  keystoneNote: z.string().nullable(),
  desc: z.string(),
  deps: z.array(z.string()),
  micro: z.array(MicroStepSchema).nullable(),
  confidence: z.enum(["high", "med", "low"]),
  sources: z.array(SourceSchema),
  tags: z.array(NodeTag),
});
export type PathwayNode = z.infer<typeof NodeSchema>;

export const PlanSchema = z.object({
  company: z.string(),
  product: z.string(),
  headline: z.string().describe("one-sentence subtitle under the title"),
  readme: z.array(z.string()).describe("3–6 short 'how to read this map' paragraphs; may contain <strong>"),
  lanes: z.array(LaneSchema),
  phases: z.array(PhaseSchema),
  nodes: z.array(NodeSchema),
  warnings: z.array(z.string()).describe("plan-level warnings shown above the map, e.g. IP disclosure sequencing"),
  disclaimer: z.string(),
  generatedAt: z.string(),
  webSearchUsed: z.boolean(),
});
export type Plan = z.infer<typeof PlanSchema>;

/**
 * What the model is asked to emit. Server-side we fill in `verified`,
 * `disclaimer`, `generatedAt` and `webSearchUsed`, so the model-facing schema
 * omits those fields.
 */
export const ModelSourceSchema = SourceSchema.omit({ verified: true });
export const ModelNodeSchema = NodeSchema.extend({ sources: z.array(ModelSourceSchema) });
export const ModelPlanSchema = PlanSchema.omit({ disclaimer: true, generatedAt: true, webSearchUsed: true }).extend({
  nodes: z.array(ModelNodeSchema),
});
export type ModelPlan = z.infer<typeof ModelPlanSchema>;

export const DISCLAIMER =
  "Internal strategy tool — not legal advice. Verify with qualified regulatory counsel before acting.";

// ---- Intake --------------------------------------------------------------

export const IntakeSchema = z.object({
  companyName: z.string().describe("best guess at the company name, or '' if unknown"),
  productName: z.string(),
  productSummary: z.string().describe("2–3 sentence neutral summary of the product"),
  productCategory: z.string().describe("e.g. 'software as a medical device', 'digital therapeutic', 'connected device'"),
  intendedUse: z.string(),
  population: z.string(),
  homeMarket: z.string().describe("ISO-like short name, e.g. 'Australia', 'United States', or '' if unknown"),
  stage: z.enum(["pre-clinical", "trial-planned", "trial-running", "post-trial", "on-market", "unknown"]),
  hardware: z.enum(["software-only", "off-the-shelf-hardware", "bundled-custom-hardware", "unknown"]),
  aiFeatures: z.enum(["none", "rule-based", "ml-locked", "ml-adaptive", "unknown"]),
  ipStatus: z.enum(["pre-patent", "provisional-filed", "granted", "not-applicable", "unknown"]),
  euTargets: z.array(z.string()).describe("EU member states mentioned as commercial targets"),
  ambiguities: z.array(z.string()).describe("things the pitch leaves unclear that matter for regulatory strategy"),
  extraQuestions: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        options: z.array(z.string()),
        multi: z.boolean(),
      }),
    )
    .describe("up to 3 additional single/multi-select questions specific to this product"),
  deckDigest: z
    .string()
    .describe("300–600 word faithful digest of everything in the material relevant to regulatory strategy: claims, users, clinical evidence, sites, partners, data flows, hardware, geography, timeline. '' if only a short description was given."),
  inScope: z.boolean().describe("true if this is a regulated health / medtech / digital-health product"),
  scopeNote: z.string().describe("if not in scope, why; else ''"),
});
export type Intake = z.infer<typeof IntakeSchema>;

// ---- Answers -------------------------------------------------------------

export const AnswersSchema = z.object({
  productForm: z.string(),
  homeMarket: z.string(),
  trialStatus: z.string(),
  euTargets: z.array(z.string()),
  ipStatus: z.string(),
  aiFeatures: z.string(),
  regTeam: z.string(),
  riskTolerance: z.string(),
  stage: z.string(),
  extra: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
});
export type Answers = z.infer<typeof AnswersSchema>;
