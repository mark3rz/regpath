import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getClient, MODEL } from "./anthropic";
import { INTAKE_SYSTEM, intakeUserPrompt } from "./prompts";
import { IntakeSchema, type Intake } from "./schema";
import type { DeckInput } from "./extract";

/**
 * Intake parsing: one structured-output call that reads the founder's text
 * and/or deck and extracts the fields the question flow prefills from.
 */
export async function parseIntake(text: string, deck: DeckInput | null): Promise<Intake> {
  const client = getClient();
  const content: Anthropic.ContentBlockParam[] = [];
  if (deck?.kind === "pdf") {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: deck.data }, title: deck.filename });
  } else if (deck) {
    content.push({ type: "text", text: `Pitch deck text (${deck.filename}):\n\n${deck.data.slice(0, 60000)}` });
  }
  content.push({ type: "text", text: intakeUserPrompt(text, Boolean(deck)) });

  const message = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(IntakeSchema) },
    system: [{ type: "text", text: INTAKE_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
  });
  if (message.stop_reason === "refusal") throw new Error("The model declined to parse this material.");
  if (!message.parsed_output) throw new Error("Intake parsing returned no structured output.");
  return message.parsed_output;
}
