import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getClient, EFFORT, MODEL, webSearchEnabled } from "./anthropic";
import { GENERATE_SYSTEM, REPAIR_SYSTEM, generateUserPrompt } from "./prompts";
import { DISCLAIMER, ModelPlanSchema, type Answers, type Intake, type ModelPlan, type Plan } from "./schema";
import { checkPlan, hasErrors, type Finding } from "./graph";
import { extractHrefs, markUnverifiedLinks, normalizeUrl, sanitizeHtml, UNVERIFIED_SUFFIX } from "./sanitize";

/**
 * Generation pipeline (Sections 3–6 of the master prompt):
 *   1. Claude Opus 5 + live web_search produces the node graph as JSON.
 *   2. Schema-validate; if the JSON is malformed, a structured-output pass
 *      coerces it into the schema.
 *   3. Integrity + lint checks (cycles, dangling refs, desc-vs-edge, IP rule).
 *      Errors/warnings go back to the model for one repair pass.
 *   4. Every URL is checked against the set of URLs actually returned by web
 *      search this session; anything else is labelled unverified.
 */

export type ProgressEvent =
  | { type: "status"; message: string }
  | { type: "search"; query: string }
  | { type: "found"; count: number }
  | { type: "text"; chars: number }
  | { type: "findings"; findings: Finding[]; pass: number };

export interface GenerateInput {
  intake: Intake | null;
  answers: Answers;
  pitchText: string;
  previousPlan?: Plan | null;
}

export interface GenerateResult {
  plan: Plan;
  findings: Finding[];
  searchQueries: string[];
  verifiedUrls: number;
}

const MAX_CONTINUATIONS = 6;
const WEB_SEARCH_MAX_USES = 25;

export async function generatePlan(
  input: GenerateInput,
  onProgress: (e: ProgressEvent) => void = () => {},
  opts: { apiKey?: string } = {},
): Promise<GenerateResult> {
  const client = getClient(opts.apiKey);
  const prePatent = input.answers.ipStatus === "pre-patent";
  const userPrompt = generateUserPrompt(
    input.intake,
    input.answers,
    input.pitchText,
    input.previousPlan ? JSON.stringify(stripServerFields(input.previousPlan)) : undefined,
  );

  const verified = new Set<string>();
  const searchQueries: string[] = [];
  let webSearchUsed = false;

  // ---- 1. Research + generate --------------------------------------------
  onProgress({ type: "status", message: "Researching jurisdictions and drafting the pathway…" });
  let text: string;
  try {
    text = await runWithSearch(client, userPrompt, webSearchEnabled(), {
      onSearch: (q) => {
        webSearchUsed = true;
        // dynamic-filtering search can surface the same block twice; report each query once
        if (searchQueries[searchQueries.length - 1] === q) return;
        searchQueries.push(q);
        onProgress({ type: "search", query: q });
      },
      onResults: (urls) => {
        for (const u of urls) verified.add(normalizeUrl(u));
        onProgress({ type: "found", count: verified.size });
      },
      onText: (chars) => onProgress({ type: "text", chars }),
    });
  } catch (err) {
    // Some orgs/deploys have the server tool disabled; fall back to unsearched generation and label everything unverified.
    if (err instanceof Anthropic.BadRequestError && /web_search|tool/i.test(err.message) && webSearchEnabled()) {
      onProgress({ type: "status", message: "Web search unavailable — generating without live grounding (all sources will be flagged unverified)." });
      text = await runWithSearch(client, userPrompt, false, { onText: (chars) => onProgress({ type: "text", chars }) });
    } else throw err;
  }

  // ---- 2. Parse + schema -------------------------------------------------
  onProgress({ type: "status", message: "Validating the generated graph…" });
  let plan = tryParsePlan(text);
  if (!plan) {
    onProgress({ type: "status", message: "Output was not valid JSON — coercing into the schema…" });
    plan = await coerceToSchema(client, text);
  }

  // ---- 3. Integrity checks + one repair pass -----------------------------
  let findings = checkPlan(plan, { prePatent });
  onProgress({ type: "findings", findings, pass: 1 });
  if (findings.length) {
    onProgress({ type: "status", message: `Repairing ${findings.length} graph finding${findings.length === 1 ? "" : "s"}…` });
    const repaired = await repairPlan(client, plan, findings);
    if (repaired) {
      const f2 = checkPlan(repaired, { prePatent });
      const better = score(f2) <= score(findings);
      if (better) {
        plan = repaired;
        findings = f2;
      }
      onProgress({ type: "findings", findings, pass: 2 });
    }
  }

  // ---- 4. Verification + finalisation ------------------------------------
  const final = finalizePlan(plan, verified, webSearchUsed);
  if (prePatent && !final.warnings.some((w) => /patent/i.test(w))) {
    final.warnings.unshift(
      "Pre-patent: file a provisional / priority patent application before any public-disclosure step (trial registry entry, publication, public pilot announcements, procurement conversations without an NDA).",
    );
  }
  return { plan: final, findings, searchQueries, verifiedUrls: verified.size };
}

// ---- Step 1 -----------------------------------------------------------------

interface SearchHooks {
  onSearch?: (query: string) => void;
  onResults?: (urls: string[]) => void;
  onText?: (chars: number) => void;
}

async function runWithSearch(client: Anthropic, userPrompt: string, withSearch: boolean, hooks: SearchHooks): Promise<string> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
  const tools = withSearch ? [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: WEB_SEARCH_MAX_USES }] : undefined;
  let textOut = "";

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      thinking: { type: "adaptive" },
      output_config: { effort: EFFORT },
      system: [{ type: "text", text: GENERATE_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages,
      ...(tools ? { tools } : {}),
    });

    let chars = 0;
    stream.on("contentBlock", (block) => {
      if (block.type === "server_tool_use" && block.name === "web_search") {
        const q = (block.input as { query?: string } | null)?.query ?? "";
        hooks.onSearch?.(q);
      } else if (block.type === "web_search_tool_result") {
        // success content is a list; error content is an object — branch before indexing
        if (Array.isArray(block.content)) hooks.onResults?.(block.content.map((r) => r.url));
      } else if (block.type === "text") {
        chars += block.text.length;
        hooks.onText?.(chars);
      }
    });

    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      throw new Error(`The model declined to generate this plan${message.stop_details?.explanation ? `: ${message.stop_details.explanation}` : "."}`);
    }
    for (const b of message.content) if (b.type === "text") textOut += b.text;

    if (message.stop_reason === "pause_turn") {
      // Server-side tool loop hit its iteration limit; resend to resume where it left off.
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    if (message.stop_reason === "max_tokens") throw new Error("Generation hit the output token limit before finishing. Try again with fewer target countries.");
    return textOut;
  }
  throw new Error("Generation did not finish within the allowed number of search continuations.");
}

// ---- Step 2 -----------------------------------------------------------------

export function extractJsonBlock(text: string): string | null {
  const fenced = /```json\s*([\s\S]*?)```/i.exec(text);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return null;
}

export function tryParsePlan(text: string): ModelPlan | null {
  const raw = extractJsonBlock(text);
  if (!raw) return null;
  try {
    const parsed = ModelPlanSchema.safeParse(normalizeLoose(JSON.parse(raw)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Fill the optional-ish fields models tend to drop so zod's strict shape passes. */
function normalizeLoose(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") return obj;
  const o = obj as Record<string, unknown>;
  const nodes = Array.isArray(o.nodes) ? o.nodes : [];
  o.nodes = nodes.map((n0) => {
    const n = { ...(n0 as Record<string, unknown>) };
    n.overlap = Boolean(n.overlap);
    n.decision = Boolean(n.decision);
    n.keystone = Boolean(n.keystone);
    n.keystoneNote = typeof n.keystoneNote === "string" ? n.keystoneNote : null;
    n.deps = Array.isArray(n.deps) ? n.deps : [];
    n.micro = Array.isArray(n.micro) && n.micro.length ? (n.micro as Record<string, unknown>[]).map((m) => ({ title: String(m.title ?? ""), time: String(m.time ?? ""), detail: String(m.detail ?? ""), now: Boolean(m.now) })) : null;
    n.confidence = n.confidence ?? "med";
    n.sources = Array.isArray(n.sources) ? n.sources : [];
    n.tags = Array.isArray(n.tags) ? n.tags : [];
    n.desc = String(n.desc ?? "");
    return n;
  });
  o.warnings = Array.isArray(o.warnings) ? o.warnings : [];
  o.readme = Array.isArray(o.readme) ? o.readme : [];
  return o;
}

async function coerceToSchema(client: Anthropic, text: string): Promise<ModelPlan> {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(ModelPlanSchema) },
    system: "Convert the following regulatory pathway draft into the required JSON schema without changing its content. Keep every node, id, dependency, description, link and source exactly as written.",
    messages: [{ role: "user", content: text }],
  });
  const message = await stream.finalMessage();
  if (!message.parsed_output) throw new Error("Could not coerce the generated plan into the schema.");
  return message.parsed_output;
}

// ---- Step 3 -----------------------------------------------------------------

async function repairPlan(client: Anthropic, plan: ModelPlan, findings: Finding[]): Promise<ModelPlan | null> {
  const list = findings.map((f) => `- [${f.level}] ${f.message}`).join("\n");
  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: zodOutputFormat(ModelPlanSchema) },
      system: [{ type: "text", text: REPAIR_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `# Findings\n${list}\n\n# Current plan\n\`\`\`json\n${JSON.stringify(plan)}\n\`\`\`` }],
    });
    const message = await stream.finalMessage();
    return message.parsed_output ?? null;
  } catch {
    return null;
  }
}

function score(findings: Finding[]): number {
  return findings.reduce((s, f) => s + (f.level === "error" ? 10 : 1), 0);
}

// ---- Step 4 -----------------------------------------------------------------

export function finalizePlan(plan: ModelPlan, verified: Set<string>, webSearchUsed: boolean): Plan {
  const nodes = plan.nodes.map((n) => {
    const desc = markUnverifiedLinks(sanitizeHtml(n.desc), verified);
    const sources = n.sources.map((s) => ({ ...s, verified: verified.has(normalizeUrl(s.url)) }));
    const anyUnverified = sources.some((s) => !s.verified) || extractHrefs(desc).some((u) => !verified.has(normalizeUrl(u)));
    return {
      ...n,
      desc,
      sources,
      micro: n.micro ? n.micro.map((m) => ({ ...m, detail: markUnverifiedLinks(sanitizeHtml(m.detail), verified) })) : null,
      confidence: anyUnverified && n.confidence === "high" ? ("med" as const) : n.confidence,
    };
  });
  const warnings = [...plan.warnings];
  if (!webSearchUsed) {
    warnings.push(`Web search was not available during generation. Every named organization, standard link and URL is unverified${UNVERIFIED_SUFFIX.replace(/^ \(|\)$/g, "")}.`);
  }
  return {
    ...plan,
    nodes,
    warnings,
    readme: plan.readme.map(sanitizeHtml),
    disclaimer: DISCLAIMER,
    generatedAt: new Date().toISOString(),
    webSearchUsed,
  };
}

function stripServerFields(plan: Plan): ModelPlan {
  const { disclaimer: _d, generatedAt: _g, webSearchUsed: _w, ...rest } = plan;
  void _d;
  void _g;
  void _w;
  return { ...rest, nodes: rest.nodes.map((n) => ({ ...n, sources: n.sources.map(({ title, url }) => ({ title, url })) })) };
}

export function hasBlockingErrors(findings: Finding[]): boolean {
  return hasErrors(findings);
}
