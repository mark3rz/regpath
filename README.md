# RegPath — Multi-Jurisdiction Regulatory Pathway Mapper

A founder pastes a product description (or uploads a pitch deck), answers a short set of adaptive strategy questions, and gets an
interactive, dependency-mapped regulatory pathway: how to file in the home market, expand into the EU, and layer in the
country-specific requirements (reimbursement, health-data hosting, ethics review) for up to two member states — rendered in the
swimlane / tiered-checklist system from the original single-file prototype.

> **Internal strategy tool — not legal advice. Verify with qualified regulatory counsel before acting.**

**v1 scope:** regulated health, medtech and digital-health products (software as a medical device, digital therapeutics, connected
health devices), one home market → EU → up to two EU member states. This is the domain the visualization was validated against.

## How it works

```
Input (text and/or PDF/PPTX)
  └─▶ /api/intake      Claude Opus 5, structured output → product category, intended use, home market,
                        stage, hardware, AI, IP, EU targets, ambiguities, up to 3 product-specific questions
        └─▶ Question flow   fixed core set (single/multi-select), prefilled from intake, plus the extras
              └─▶ /api/generate   Claude Opus 5 + live web_search → node graph JSON (streamed progress)
                    ├─ schema validation (zod) — malformed output is coerced via structured outputs
                    ├─ integrity checks: dangling refs, self-deps, cycles, unknown lanes/phases, phase order
                    ├─ description-vs-edge lint: every node id named in prose must be a real dependency path
                    ├─ IP rule: pre-patent ⇒ a patent-filing node upstream of every public-disclosure node
                    ├─ one model repair pass on any finding, then re-check
                    └─ URL verification: only URLs returned by web search are "verified"; the rest are labelled
                          └─▶ Pathway Map (swimlanes + connectors) · Immediate Next Steps (derived tiers)
                                └─▶ Revise answers → regenerate (previous plan passed back for continuity)
```

Key logic lives in [`lib/graph.ts`](lib/graph.ts) (tiering, integrity, lint, IP rule), [`lib/generate.ts`](lib/generate.ts)
(pipeline), [`lib/prompts.ts`](lib/prompts.ts) (system prompts built from the accuracy rules), and
[`components/PathwayMap.tsx`](components/PathwayMap.tsx) + [`app/pathway.css`](app/pathway.css) (the ported visualization).

### What was ported exactly from the prototype

- **Same-phase connector routing** — a dependency in the same phase column is drawn as a left bow along the column margin
  (`x1 = source.left`, `x2 = target.left`, `midX = min(x1, x2) − 18`) instead of a backward sweep.
- **Urgency as a computed tier** via `hasWaitAncestor()`: **NOW** (now, no deps) · **SOON** (now, deps, no wait ancestor) ·
  **PARTIAL** (now, but a wait ancestor — only micro-steps flagged `now:true` are genuinely free) · **PENDING** (wait).
- **Immediate Next Steps is derived and tiered**, not per-jurisdiction.
- Design tokens, typography (IBM Plex Sans / Source Serif 4 / IBM Plex Mono), `to right` gradient bars, two-row compact cards
  with detail deferred to the slide-in panel, labeled pills instead of emoji.

Lane colours are assigned by lane *kind* (shared / evidence / home / eu / country…) so nothing is hardcoded to Australia, France or
the Netherlands.

## Setup

```bash
npm install
npm run dev                    # http://localhost:3000
```

Then add your Anthropic API key in the **Your Anthropic API key** panel on the start page. It is stored only in that browser's
`localStorage`, sent as a request header to this app's own API routes, used for that one request, and never persisted or logged
server-side. **Test key** verifies it with a single Models API call. Alternatively, set `ANTHROPIC_API_KEY` in `.env.local` (copy
`.env.example`) and leave the panel empty — a browser-supplied key always takes precedence over the server's.

Environment variables (see [`.env.example`](.env.example)):

| Variable             | Required | Purpose                                                                                   |
| -------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`  | no*      | Server fallback key. *Not needed if users supply their own key in the start-page panel.    |
| `REGPATH_MODEL`      | no       | Model id for every call. Default `claude-opus-5`.                                         |
| `REGPATH_EFFORT`     | no       | Generation effort `low`…`max`. Default `high`; see *Run time* before lowering.             |
| `REGPATH_WEB_SEARCH` | no       | `off` disables live web search; every named body / URL is then labelled *unverified*.     |
| `REGPATH_MOCK`       | no       | `1` skips the model and returns the bundled Cadence Health sample — for UI work without a key.        |

No key handy? The intake screen has **Load sample map** (Cadence Health — a fictional teaching example built on real sources) and **Open a saved plan** (any JSON
downloaded from the map view).

## Scripts

```bash
npm run dev          # Next.js dev server
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # vitest: graph integrity, desc-vs-edge lint, tiering, IP rule, sanitizer, deck extraction, sample plan
npm run sample       # end-to-end generation with a fictional pitch (needs ANTHROPIC_API_KEY); writes samples/runs/*.json
```

`npm run sample` runs the whole pipeline against [`samples/placeholder-pitch.md`](samples/placeholder-pitch.md) (a fictional UK
asthma-management app + sensor, pre-patent, targeting Germany and the Netherlands), prints the web searches it ran, the integrity
findings before/after the repair pass, and a tier summary, then writes the plan JSON. Open it in the app with **Open a saved plan**.
Add `-- --skip-intake` to bypass the intake call.

The committed result of that run is [`samples/nimbus-health-sample.json`](samples/nimbus-health-sample.json): 49 nodes across 7
generated lanes (IP & Disclosure, Shared Foundations, Clinical Evidence, UK, EU, Germany, Netherlands), 25 web searches, 169 verified
URLs, zero unverified sources, zero integrity findings on the first pass, and the IP rule satisfied (one `patent-filing` node upstream
of six `public-disclosure` nodes). Open it via **Open a saved plan** to see what a live generation looks like.

## Run time

That sample run took **~20 minutes** at the default `effort: high` (adaptive thinking, 25 searches, ~50 richly described nodes).
That is fine under `npm run dev` — the browser streams progress and there is no function time limit — but it is well beyond any
hosted serverless limit (Vercel: 300 s Hobby, 800 s Pro with Fluid Compute). Options, in order of preference:

1. **Run it locally** for real strategy work (`npm run dev`); this is the intended v1 mode.
2. **`REGPATH_EFFORT=medium`** on hosted deploys — shorter thinking and terser nodes; measure before relying on it.
3. Move generation to a background job (a queue + polling endpoint) — the right fix for a shared deployment, not built in v1.

## Deploy to Vercel

```bash
npm i -g vercel
vercel login
vercel                      # first deploy (preview)
vercel env add ANTHROPIC_API_KEY production
vercel --prod
```

Or import the repo in the Vercel dashboard and add `ANTHROPIC_API_KEY` under *Settings → Environment Variables*.

`app/api/generate/route.ts` sets `maxDuration = 300`, the Fluid Compute ceiling on Hobby (Pro allows 800). Read **Run time** above
before relying on a hosted deploy for full generations: at default effort a full run exceeds these limits. Set `REGPATH_EFFORT=medium`
on the deployment, or keep generation local.

## Data schema

Ported from the prototype, plus what generalization required:

```ts
{
  id: string,                 // "E2"
  lane: string,               // generated per startup — lanes[] carries { id, name, note, kind }
  phase: number,              // 1–4; phases[] carries { n, title }
  title: string,
  duration: 1|2|3|4,
  risk: 'high'|'med'|'low',
  urgency: 'now'|'wait',      // tier is computed, see above
  overlap: boolean,           // SHARED
  decision: boolean,          // DECISION — founder/CEO-level fork
  keystone: boolean, keystoneNote: string|null,
  desc: string,               // sanitized HTML; <a> only to verified URLs, else marked "(unverified — confirm before use)"
  deps: string[],
  micro: { title, time, detail, now }[] | null,
  confidence: 'high'|'med'|'low',
  sources: { title, url, verified }[],
  tags: ('patent-filing'|'public-disclosure')[]
}
```

Plan-level: `company`, `product`, `headline`, `readme[]`, `lanes[]`, `phases[]`, `nodes[]`, `warnings[]`, `disclaimer`,
`generatedAt`, `webSearchUsed`.

## Accuracy guardrails

- The generation call runs with Claude's native `web_search` server tool; the system prompt forbids naming organizations, contacts or
  URLs from memory. The server records every URL that appeared in a search result and labels any link or source not in that set
  **unverified — confirm before use** (and caps its node's confidence at *medium*).
- If web search is disabled or unavailable, the whole plan carries a visible warning and every source is unverified.
- Every generated map carries the disclaimer above in the footer and in the plan JSON.
- Pre-patent startups get a `patent-filing` node that every `public-disclosure` node must depend on; the check is an error that
  triggers the repair pass, and the plan gets an explicit warning.

## Open decisions (flagged, not silently assumed)

See the hand-off notes in the pull request / commit message: scope (health/medtech only), file upload in v1 (yes — PDF native,
PPTX text extraction), jurisdictions (home + EU + ≤2 member states), web search (Claude's native tool), and question wording/order.
