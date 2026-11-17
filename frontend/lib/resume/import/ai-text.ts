import { ImportError } from "./common";

// Extract locally: only the text, not the file, is sent for AI mapping.
export async function readAiText(file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new ImportError("This file is bigger than 5 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "";
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const task = pdfjs.getDocument({ data: bytes });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 50) throw new ImportError("This PDF has more than 50 pages.");
      const pages: string[] = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const content = await (await pdf.getPage(n)).getTextContent();
        pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
        if (pages.join("\n").length > 100_000) throw new ImportError("This document contains too much text.");
      }
      text = pages.join("\n");
    } finally { await task.destroy(); }
  } else if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const zip = await (await import("jszip")).default.loadAsync(bytes);
    const entries = Object.values(zip.files).filter((entry) => !entry.dir);
    const total = entries.reduce((sum, entry) => sum + ((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? Infinity), 0);
    if (entries.length > 100 || total > 20 * 1024 * 1024) throw new ImportError("This Word file is too large to unpack.");
    const document = zip.file("word/document.xml");
    if (!document) throw new ImportError("This is not a Word document.");
    const xml = new DOMParser().parseFromString(await document.async("string"), "application/xml");
    if (xml.querySelector("parsererror")) throw new ImportError("This Word document cannot be read.");
    text = Array.from(xml.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "p"))
      .map((paragraph) => paragraph.textContent ?? "").join("\n");
  } else throw new ImportError("Choose a PDF or Word document.");
  if (!text.trim()) throw new ImportError("No selectable text was found in this document.");
  if (text.length > 100_000) throw new ImportError("This document contains too much text.");
  return text;
}
