import { describe, expect, it } from "vitest";
import { extractHrefs, markUnverifiedLinks, normalizeUrl, sanitizeHtml } from "@/lib/sanitize";
import { extractJsonBlock, finalizePlan, tryParsePlan } from "@/lib/generate";
import { samplePlan } from "@/lib/sample-plan";

describe("sanitizeHtml", () => {
  it("keeps a/strong/em and rebuilds anchors with safe attributes", () => {
    const out = sanitizeHtml('<a href="https://iso.org/x" onclick="evil()">ISO</a> <strong>bold</strong> <em>em</em>');
    expect(out).toBe('<a href="https://iso.org/x" target="_blank" rel="noopener noreferrer">ISO</a> <strong>bold</strong> <em>em</em>');
  });
  it("strips scripts and non-http links", () => {
    expect(sanitizeHtml('<script>x()</script><a href="javascript:alert(1)">bad</a><div>text</div>')).toBe("x()badtext");
    expect(sanitizeHtml('<a href="javascript:x">bad</a> <a href="https://ok.example">ok</a>')).toBe('bad <a href="https://ok.example" target="_blank" rel="noopener noreferrer">ok</a>');
  });
});

describe("URL verification", () => {
  it("normalizes trailing slash, fragment and case", () => {
    expect(normalizeUrl("https://www.ISO.org/standard/59752.html#top")).toBe("https://www.iso.org/standard/59752.html");
    expect(normalizeUrl("https://eur-lex.europa.eu/")).toBe("https://eur-lex.europa.eu");
  });
  it("marks links not seen in search results as unverified", () => {
    const html = '<a href="https://good.example/a" target="_blank">A</a> and <a href="https://bad.example/b" target="_blank">B</a>';
    const out = markUnverifiedLinks(html, new Set([normalizeUrl("https://good.example/a")]));
    expect(out).toContain('B</a><em class="unverified">');
    expect(out.match(/<em class="unverified">/g)).toHaveLength(1);
  });
  it("extractHrefs finds every http(s) href", () => {
    expect(extractHrefs('<a href="https://a.example">1</a><a href="http://b.example/p">2</a>')).toEqual(["https://a.example", "http://b.example/p"]);
  });
});

describe("plan finalisation", () => {
  it("labels sources and lowers confidence when nothing was verified", () => {
    const base = samplePlan();
    const model = { ...base, nodes: base.nodes.slice(0, 1).map((n) => ({ ...n, desc: "Plain text, no links.", confidence: "high" as const, sources: [{ title: "ISO", url: "https://www.iso.org/standard/59752.html" }] })) };
    const out = finalizePlan(model, new Set(), false);
    expect(out.nodes[0].sources[0].verified).toBe(false);
    expect(out.nodes[0].confidence).toBe("med");
    expect(out.webSearchUsed).toBe(false);
    expect(out.warnings.some((w) => /web search was not available/i.test(w))).toBe(true);
    expect(out.disclaimer).toMatch(/not legal advice/i);
  });
  it("keeps verified sources at their stated confidence", () => {
    const base = samplePlan();
    const model = { ...base, nodes: base.nodes.slice(0, 1).map((n) => ({ ...n, desc: "Plain text, no links.", confidence: "high" as const, sources: [{ title: "ISO", url: "https://www.iso.org/standard/59752.html" }] })) };
    const out = finalizePlan(model, new Set([normalizeUrl("https://www.iso.org/standard/59752.html/")]), true);
    expect(out.nodes[0].sources[0].verified).toBe(true);
    expect(out.nodes[0].confidence).toBe("high");
  });
});

describe("model output parsing", () => {
  it("extracts a fenced json block", () => {
    expect(extractJsonBlock('prose\n```json\n{"a":1}\n```\nmore')).toBe('{"a":1}');
  });
  it("falls back to the outermost braces", () => {
    expect(extractJsonBlock('x {"a":{"b":2}} y')).toBe('{"a":{"b":2}}');
  });
  it("round-trips the sample plan through the model schema with missing optional fields filled", () => {
    const base = samplePlan();
    const loose = {
      ...base,
      nodes: base.nodes.map((node) => {
        const copy: Record<string, unknown> = { ...node };
        for (const k of ["overlap", "keystoneNote", "tags", "sources"]) delete copy[k];
        return copy;
      }),
    };
    const parsed = tryParsePlan("```json\n" + JSON.stringify(loose) + "\n```");
    expect(parsed).not.toBeNull();
    expect(parsed!.nodes).toHaveLength(base.nodes.length);
  });
});
