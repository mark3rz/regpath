/**
 * Minimal HTML sanitizer for model-generated description text. Node
 * descriptions are rendered with innerHTML (as in the prototype) so only a
 * tiny whitelist survives: <a href>, <strong>, <em>, <br>. Everything else is
 * stripped to its text.
 */

const ALLOWED_SIMPLE = new Set(["strong", "em", "br"]);

export function sanitizeHtml(input: string): string {
  // Anchors with a rejected href are dropped along with their matching </a>.
  const dropClose: boolean[] = [];
  return input.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (whole, rawTag: string, attrs: string) => {
    const tag = rawTag.toLowerCase();
    const closing = whole.startsWith("</");
    if (ALLOWED_SIMPLE.has(tag)) return closing ? `</${tag}>` : `<${tag}>`;
    if (tag === "a") {
      if (closing) return dropClose.pop() ? "" : "</a>";
      const href = /href\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? "";
      const ok = /^https?:\/\//i.test(href);
      dropClose.push(!ok);
      return ok ? `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">` : "";
    }
    return "";
  });
}

export function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** All http(s) hrefs inside an HTML string. */
export function extractHrefs(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) out.push(m[1]);
  return out;
}

/** Loose URL identity: scheme/host case, trailing slash and fragment don't matter. */
export function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    let s = url.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s.toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}

export const UNVERIFIED_SUFFIX = " (unverified — confirm before use)";

/**
 * Appends an explicit "unverified" marker after any anchor whose href was not
 * returned by a live web search during generation.
 */
export function markUnverifiedLinks(html: string, verified: Set<string>): string {
  return html.replace(/<a\s+href="(https?:\/\/[^"]+)"[^>]*>(.*?)<\/a>/gi, (whole, href: string, text: string) => {
    if (verified.has(normalizeUrl(href))) return whole;
    if (text.includes(UNVERIFIED_SUFFIX.trim())) return whole;
    return `${whole}<em class="unverified">${UNVERIFIED_SUFFIX}</em>`;
  });
}
