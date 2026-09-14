import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { AnswersSchema, IntakeSchema, PlanSchema } from "@/lib/schema";
import { generatePlan, type ProgressEvent } from "@/lib/generate";
import { checkPlan } from "@/lib/graph";
import { hasCredentials, keyFromRequest, NO_KEY_MESSAGE } from "@/lib/anthropic";
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

  const apiKey = keyFromRequest(req);
  if (process.env.REGPATH_MOCK !== "1" && !hasCredentials(apiKey)) {
    return NextResponse.json({ error: NO_KEY_MESSAGE }, { status: 401 });
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
            { apiKey },
          );
          send({ type: "result", plan: result.plan, findings: result.findings, searchQueries: result.searchQueries, verifiedUrls: result.verifiedUrls });
        }
      } catch (err) {
        send({ type: "error", message: friendlyError(err) });
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

function friendlyError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Your API key was rejected (invalid or revoked). Check it in the key panel on the start page.";
  if (err instanceof Anthropic.PermissionDeniedError) return "Your API key is valid but lacks permission for this model.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the Anthropic API — wait a minute and try again.";
  if (err instanceof Anthropic.APIError) return `Anthropic API error ${err.status ?? ""}: ${err.message}`;
  return err instanceof Error ? err.message : "Generation failed.";
}
