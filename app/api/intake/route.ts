import { NextResponse } from "next/server";
import { deckFromFile } from "@/lib/extract";
import { parseIntake } from "@/lib/intake";
import { hasCredentials } from "@/lib/anthropic";
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
    if (!hasCredentials()) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set on the server. Add it to .env.local (see .env.example)." }, { status: 500 });
    }
    const intake = await parseIntake(text, deck);
    return NextResponse.json({ intake, pitchText });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Intake parsing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
