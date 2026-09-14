import JSZip from "jszip";

/**
 * Pitch-deck ingestion. PDFs are passed to Claude directly as a document
 * block (native PDF support — text + layout), so only PPTX needs local text
 * extraction: slides are XML inside a zip, and every visible run is an <a:t>.
 */

export type DeckKind = "pdf" | "pptx" | "text";

export interface DeckInput {
  kind: DeckKind;
  filename: string;
  /** base64 for pdf; extracted text for pptx/text */
  data: string;
}

export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

export function deckKindFor(filename: string, mime: string): DeckKind | null {
  const f = filename.toLowerCase();
  if (f.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  if (f.endsWith(".pptx") || mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx";
  if (f.endsWith(".txt") || f.endsWith(".md") || mime.startsWith("text/")) return "text";
  return null;
}

export async function extractPptxText(buf: Buffer | ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const slideFiles = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
  const out: string[] = [];
  for (const path of slideFiles) {
    const xml = await zip.file(path)!.async("string");
    const runs: string[] = [];
    for (const m of xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)) runs.push(decodeXml(m[1]));
    // Paragraph boundaries map to </a:p>; approximate by joining runs with spaces and paragraphs with newlines.
    const paras = xml.split("</a:p>").map((p) => [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(""));
    const text = paras.filter((p) => p.trim()).join("\n") || runs.join(" ");
    out.push(`--- Slide ${slideNumber(path)} ---\n${text}`);
    const notesPath = path.replace("slides/slide", "notesSlides/notesSlide");
    const notes = zip.file(notesPath);
    if (notes) {
      const nx = await notes.async("string");
      const nt = [...nx.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(" ").trim();
      if (nt) out.push(`[notes] ${nt}`);
    }
  }
  return out.join("\n\n");
}

export async function deckFromFile(file: File): Promise<DeckInput> {
  const kind = deckKindFor(file.name, file.type);
  if (!kind) throw new Error("Unsupported file type — upload a PDF, PPTX, or plain-text file.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 30 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  if (kind === "pdf") return { kind, filename: file.name, data: buf.toString("base64") };
  if (kind === "pptx") return { kind, filename: file.name, data: await extractPptxText(buf) };
  return { kind, filename: file.name, data: buf.toString("utf8") };
}

function slideNumber(p: string): number {
  return Number(/slide(\d+)\.xml$/.exec(p)?.[1] ?? 0);
}

function decodeXml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");
}
