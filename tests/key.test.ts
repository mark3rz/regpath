import { describe, expect, it } from "vitest";
import { KEY_HEADER, keyFromRequest } from "@/lib/anthropic";

const req = (h: Record<string, string>) => new Request("http://x/api/generate", { method: "POST", headers: h });

describe("bring-your-own-key header", () => {
  it("reads a plausible key from the header", () => {
    expect(keyFromRequest(req({ [KEY_HEADER]: "sk-ant-api03-abcdefghijklmnopqrstuvwxyz" }))).toBe("sk-ant-api03-abcdefghijklmnopqrstuvwxyz");
  });
  it("trims whitespace around the key", () => {
    expect(keyFromRequest(req({ [KEY_HEADER]: "  sk-ant-api03-abcdefghijklmnopqrstuvwxyz  " }))).toBe("sk-ant-api03-abcdefghijklmnopqrstuvwxyz");
  });
  it("ignores missing, too-short, or malformed values", () => {
    expect(keyFromRequest(req({}))).toBeUndefined();
    expect(keyFromRequest(req({ [KEY_HEADER]: "short" }))).toBeUndefined();
    expect(keyFromRequest(req({ [KEY_HEADER]: "sk-ant-with a space in the middle 12345" }))).toBeUndefined();
    expect(keyFromRequest(req({ [KEY_HEADER]: "x".repeat(600) }))).toBeUndefined();
  });
});
