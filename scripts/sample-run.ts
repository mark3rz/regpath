/**
 * End-to-end sample generation with a fictional pitch (deliverable 7).
 *
 *   npm run sample            # full pipeline: intake → generate (web search) → checks → samples/runs/<ts>.json
 *   npm run sample -- --skip-intake   # answer the questions from the fixture below, skip the intake call
 *
 * Requires ANTHROPIC_API_KEY. Prints the search queries, integrity findings
 * and a tier summary, and writes the plan JSON you can open in the app via
 * "Open a saved plan".
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseIntake } from "../lib/intake";
import { generatePlan } from "../lib/generate";
import { buildActionTiers, hasErrors } from "../lib/graph";
import type { Answers, Intake } from "../lib/schema";

const pitch = readFileSync(new URL("../samples/placeholder-pitch.md", import.meta.url), "utf8");
const skipIntake = process.argv.includes("--skip-intake");

const answers: Answers = {
  productForm: "bundled-custom-hardware",
  homeMarket: "United Kingdom",
  trialStatus: "planned",
  stage: "trial",
  euTargets: ["Germany", "Netherlands"],
  ipStatus: "pre-patent",
  aiFeatures: "ml-locked",
  regTeam: "consultancy",
  riskTolerance: "balanced",
  extra: {},
};

async function main() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.error("ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local or export the variable, then re-run.");
    process.exit(1);
  }
  let intake: Intake | null = null;
  if (!skipIntake) {
    console.log("→ intake parsing…");
    intake = await parseIntake(pitch, null);
    console.log(JSON.stringify(intake, null, 2));
  }

  console.log("\n→ generating (this takes a few minutes)…");
  const t0 = Date.now();
  const result = await generatePlan({ intake, answers, pitchText: pitch }, (e) => {
    if (e.type === "search") console.log(`  search: ${e.query}`);
    else if (e.type === "status") console.log(`  ${e.message}`);
    else if (e.type === "findings") console.log(`  pass ${e.pass}: ${e.findings.length} finding(s)`);
  });
  const secs = Math.round((Date.now() - t0) / 1000);

  mkdirSync(new URL("../samples/runs/", import.meta.url), { recursive: true });
  const out = new URL(`../samples/runs/${new Date().toISOString().replace(/[:.]/g, "-")}-nimbus.json`, import.meta.url);
  writeFileSync(out, JSON.stringify(result.plan, null, 2));

  const { plan, findings } = result;
  console.log(`\n✓ ${plan.nodes.length} nodes across ${plan.lanes.length} lanes in ${secs}s; ${result.searchQueries.length} searches; ${result.verifiedUrls} verified URLs`);
  console.log(`  lanes: ${plan.lanes.map((l) => `${l.name} (${l.kind})`).join(", ")}`);
  for (const t of buildActionTiers(plan.nodes)) console.log(`  ${t.title}: ${t.items.length}`);
  const unverified = plan.nodes.flatMap((n) => n.sources.filter((s) => !s.verified)).length;
  console.log(`  unverified sources: ${unverified}; plan warnings: ${plan.warnings.length}`);
  if (findings.length) {
    console.log(`\n${hasErrors(findings) ? "✗ blocking" : "⚠ non-blocking"} findings remaining after repair:`);
    for (const f of findings) console.log(`  [${f.level}] ${f.message}`);
  } else console.log("  graph integrity: clean");
  console.log(`\nwrote ${out.pathname}`);
  process.exit(hasErrors(findings) ? 2 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
