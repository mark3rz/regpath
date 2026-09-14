import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getClient, hasServerCredentials, keyFromRequest, MODEL } from "@/lib/anthropic";

export const runtime = "nodejs";

/**
 * POST — verifies whichever key applies to this request (browser-supplied header,
 * else the server env) with one cheap Models API call. The key is never echoed
 * back or logged.
 */
export async function POST(req: Request) {
  const apiKey = keyFromRequest(req);
  if (!apiKey && !hasServerCredentials()) {
    return NextResponse.json({ ok: false, error: "No key provided and none configured on the server." }, { status: 400 });
  }
  try {
    const model = await getClient(apiKey).models.retrieve(MODEL);
    return NextResponse.json({ ok: true, source: apiKey ? "browser" : "server", model: model.id });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return NextResponse.json({ ok: false, error: "That key was rejected (invalid or revoked)." }, { status: 401 });
    if (err instanceof Anthropic.PermissionDeniedError) return NextResponse.json({ ok: false, error: "That key is valid but lacks permission for this model." }, { status: 403 });
    if (err instanceof Anthropic.NotFoundError) return NextResponse.json({ ok: false, error: `Key works, but model '${MODEL}' was not found.` }, { status: 404 });
    if (err instanceof Anthropic.APIError) return NextResponse.json({ ok: false, error: `API error ${err.status}: ${err.message}` }, { status: 502 });
    return NextResponse.json({ ok: false, error: "Could not reach the Anthropic API." }, { status: 502 });
  }
}
