import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { deckFromFile } from "@/lib/extract";
import { parseIntake } from "@/lib/intake";
import { hasCredentials, keyFromRequest, NO_KEY_MESSAGE } from "@/lib/anthropic";
import { sampleIntake } from "@/lib/sample-plan";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST multipart/form-data { text?: string, file?: File }
 * → { intake, pitchText }
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const text = String(form.get("text") ?? "");
    const file = form.get("file");
    const deck = file instanceof File && file.size > 0 ? await deckFromFile(file) : null;
    if (!text.trim() && !deck) return NextResponse.json({ error: "Paste a product description or upload a deck." }, { status: 400 });

    const pitchText = [text.trim(), deck && deck.kind !== "pdf" ? deck.data : ""].filter(Boolean).join("\n\n");

    if (process.env.REGPATH_MOCK === "1") {
      return NextResponse.json({ intake: sampleIntake(), pitchText, mock: true });
    }
    const apiKey = keyFromRequest(req);
    if (!hasCredentials(apiKey)) return NextResponse.json({ error: NO_KEY_MESSAGE }, { status: 401 });
    const intake = await parseIntake(text, deck, apiKey);
    return NextResponse.json({ intake, pitchText });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "Your API key was rejected (invalid or revoked). Check it in the key panel." }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Intake parsing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
