import { NextResponse } from "next/server";
import { AnswersSchema, IntakeSchema, PlanSchema } from "@/lib/schema";
import { generatePlan, type ProgressEvent } from "@/lib/generate";
import { checkPlan } from "@/lib/graph";
import { hasCredentials } from "@/lib/anthropic";
import { samplePlan } from "@/lib/sample-plan";
import { z } from "zod";

export const runtime = "nodejs";
// Generation with live web search typically runs 2–6 minutes.
export const maxDuration = 300;

const BodySchema = z.object({
  intake: IntakeSchema.nullable(),
  answers: AnswersSchema,
  pitchText: z.string(),
  previousPlan: PlanSchema.nullable().optional(),
});

/**
 * POST JSON { intake, answers, pitchText, previousPlan? }
 * Streams newline-delimited JSON progress events, ending with
 * { type: "result", plan, findings } or { type: "error", message }.
 */
export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  const body = parsed.data;

  if (process.env.REGPATH_MOCK !== "1" && !hasCredentials()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set on the server. Add it to .env.local (see .env.example)." }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      const keepalive = setInterval(() => send({ type: "ping" }), 15000);
      try {
        if (process.env.REGPATH_MOCK === "1") {
          send({ type: "status", message: "REGPATH_MOCK=1 — returning the bundled sample plan instead of calling the model." });
          await new Promise((r) => setTimeout(r, 800));
          const plan = samplePlan();
          send({ type: "result", plan, findings: checkPlan(plan, { prePatent: body.answers.ipStatus === "pre-patent" }), mock: true });
        } else {
          const result = await generatePlan(
            { intake: body.intake, answers: body.answers, pitchText: body.pitchText, previousPlan: body.previousPlan ?? null },
            (e: ProgressEvent) => send(e),
          );
          send({ type: "result", plan: result.plan, findings: result.findings, searchQueries: result.searchQueries, verifiedUrls: result.verifiedUrls });
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Generation failed." });
      } finally {
        clearInterval(keepalive);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
  });
}
