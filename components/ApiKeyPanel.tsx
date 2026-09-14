"use client";

import { useState } from "react";
import { clearStoredKey, getStoredKey, keyHeaders, maskKey, setStoredKey } from "@/lib/client-key";

type Check = { state: "idle" } | { state: "testing" } | { state: "ok"; source: "browser" | "server" } | { state: "fail"; message: string };

/**
 * Bring-your-own-key panel. The key is saved in this browser's localStorage
 * only, attached as a header to this app's own API calls, used server-side for
 * that request, and never stored or logged there.
 */
export default function ApiKeyPanel({ eyebrow = "YOUR ANTHROPIC API KEY", note }: { eyebrow?: string; note?: string }) {
  // Rendered client-only (Home is loaded with ssr:false), so localStorage is safe to read in the initializer.
  const [stored, setStored] = useState(() => getStoredKey());
  const [draft, setDraft] = useState("");
  const [show, setShow] = useState(false);
  const [check, setCheck] = useState<Check>({ state: "idle" });
  const [serverHasKey, setServerHasKey] = useState<boolean | null>(null);

  const save = () => {
    const k = draft.trim();
    if (!k) return;
    setStoredKey(k);
    setStored(k);
    setDraft("");
    setCheck({ state: "idle" });
  };

  const remove = () => {
    clearStoredKey();
    setStored("");
    setCheck({ state: "idle" });
  };

  const test = async () => {
    setCheck({ state: "testing" });
    try {
      const res = await fetch("/api/key-check", { method: "POST", headers: keyHeaders() });
      const j = await res.json();
      if (j.ok) {
        setCheck({ state: "ok", source: j.source });
        if (j.source === "server") setServerHasKey(true);
      } else {
        setCheck({ state: "fail", message: j.error || `Check failed (${res.status})` });
        if (res.status === 400) setServerHasKey(false);
      }
    } catch {
      setCheck({ state: "fail", message: "Could not reach the app server." });
    }
  };

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between">
        <div className="eyebrow">{eyebrow}</div>
        {stored ? <span className="badge-inline">saved on this device</span> : <span className="badge-inline warn">not set</span>}
      </div>

      {stored ? (
        <>
          <div className="mono mt-2 text-[0.78rem]">{maskKey(stored)}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-ghost" type="button" onClick={test} disabled={check.state === "testing"}>
              {check.state === "testing" ? "Testing…" : "Test key"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={remove}>
              Remove
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-2 flex gap-2">
            <input
              type={show ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              className="mono w-full rounded-[2px] border border-line bg-white px-2 py-1.5 text-[0.78rem] outline-none focus:border-brand"
              placeholder="sk-ant-…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              aria-label="Anthropic API key"
            />
            <button className="btn btn-ghost px-2" type="button" onClick={() => setShow((s) => !s)} title={show ? "Hide" : "Show"}>
              {show ? "Hide" : "Show"}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn" type="button" onClick={save} disabled={!draft.trim()}>
              Save key on this device
            </button>
            <button className="btn btn-ghost" type="button" onClick={test} title="Checks whether the server has a fallback key for pitch parsing">
              Check server key
            </button>
          </div>
        </>
      )}

      {check.state === "ok" && (
        <p className="mt-3 rounded-[2px] border border-[#BFE8D2] bg-[#DFF7EA] px-3 py-2 text-[0.74rem] text-[#0E9A5C]">
          {check.source === "server" ? "The server has a fallback key for pitch parsing — research still needs your own key." : "Key works."}
        </p>
      )}
      {check.state === "fail" && (
        <p className="mt-3 rounded-[2px] border border-[#F3B4B4] bg-[#FFEDED] px-3 py-2 text-[0.74rem] text-[#D64545]">{check.message}</p>
      )}

      {note && <p className="mt-3 text-[0.74rem] leading-relaxed text-ink">{note}</p>}
      <p className="mt-3 text-[0.72rem] leading-relaxed text-ink-soft">
        Stored only in this browser (localStorage) — never in a database or a log. It is sent to this app&apos;s own server with each request,
        used for that request, then discarded. <strong>Research and the strategy map always run on this key</strong>; parsing your pitch can
        fall back to a key configured on the server. Billed to your Anthropic account; get one at{" "}
        <a className="text-brand underline" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">
          console.anthropic.com
        </a>
        .{serverHasKey === false && " No key is configured on the server, so parsing needs one here too."}
      </p>
    </div>
  );
}
