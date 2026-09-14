import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { deckKindFor, extractPptxText } from "@/lib/extract";

describe("pitch deck ingestion", () => {
  it("classifies uploads by extension or mime", () => {
    expect(deckKindFor("deck.PDF", "")).toBe("pdf");
    expect(deckKindFor("deck.pptx", "")).toBe("pptx");
    expect(deckKindFor("notes.md", "")).toBe("text");
    expect(deckKindFor("x.bin", "application/octet-stream")).toBeNull();
  });

  it("pulls slide text and notes out of a PPTX in slide order", async () => {
    const zip = new JSZip();
    const slide = (runs: string[]) =>
      `<p:sld><p:txBody>${runs.map((r) => `<a:p><a:r><a:t>${r}</a:t></a:r></a:p>`).join("")}</p:txBody></p:sld>`;
    zip.file("ppt/slides/slide10.xml", slide(["Tenth"]));
    zip.file("ppt/slides/slide2.xml", slide(["Second &amp; more"]));
    zip.file("ppt/slides/slide1.xml", slide(["Title", "Subtitle"]));
    zip.file("ppt/notesSlides/notesSlide1.xml", `<p:notes><a:t>speaker note</a:t></p:notes>`);
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    const text = await extractPptxText(buf);
    expect(text.indexOf("Slide 1")).toBeLessThan(text.indexOf("Slide 2"));
    expect(text.indexOf("Slide 2")).toBeLessThan(text.indexOf("Slide 10"));
    expect(text).toContain("Title\nSubtitle");
    expect(text).toContain("Second & more");
    expect(text).toContain("[notes] speaker note");
  });
});
