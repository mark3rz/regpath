"use client";

import { KEY_HEADER } from "./anthropic";

/**
 * Browser-side storage for the founder's own Anthropic API key. It lives only
 * in this browser's localStorage and is sent as a header to this app's API
 * routes, which use it for that request and never persist it.
 */
const STORAGE_KEY = "regpath:apiKey";

export function getStoredKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setStoredKey(key: string): void {
  try {
    if (key.trim()) localStorage.setItem(STORAGE_KEY, key.trim());
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable (private mode / quota) — the key just isn't remembered */
  }
}

export function clearStoredKey(): void {
  setStoredKey("");
}

/** Headers to attach to every /api call. Empty when no key is stored (server env key is then used). */
export function keyHeaders(): Record<string, string> {
  const k = getStoredKey();
  return k ? { [KEY_HEADER]: k } : {};
}

export function maskKey(k: string): string {
  return k.length > 14 ? `${k.slice(0, 7)}…${k.slice(-4)}` : "••••••••";
}
