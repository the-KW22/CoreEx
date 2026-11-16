import { readdirSync, readFileSync } from "node:fs";

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { ImportError } from "./common";
import { readImport } from "./index";

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url));
const linkedinDir = new URL("./__fixtures__/linkedin/", import.meta.url);

// The format comes from what the file holds, never from its name.
describe("reading an import", () => {
  it("detects each format from its content, whatever the file is called", async () => {
    const coreex = await readImport(new File([fixture("coreex.json")], "backup.bin"));
    expect(coreex.format).toBe("CoreEx JSON");
    const jsonResume = await readImport(new File([fixture("json-resume.json")], "resume.txt"));
    expect(jsonResume.format).toBe("JSON Resume");
    expect(jsonResume.name).toBe("Linus Torvalds");
    const reactive = await readImport(new File([fixture("reactive-resume.json")], "random.json"));
    expect(reactive.format).toBe("Reactive Resume JSON");
  });

  it("lists what was read: the entries of each section, and what was skipped", async () => {
    const imported = await readImport(new File([fixture("reactive-resume.json")], "x.json"));
    expect(imported.sections).toEqual([
      { title: "Experience", count: 2 },
      { title: "Education", count: 1 },
      { title: "Projects", count: 1 },
      { title: "Skills", count: 1 },
      { title: "Languages", count: 1 },
      { title: "Certifications", count: 1 },
    ]);
    expect(imported.skipped).toEqual(['Custom section "Hobbies" (not imported).']);
  });

  it("a LinkedIn export is read from its zip, whatever the zip is called", async () => {
    const zip = new JSZip();
    for (const name of readdirSync(linkedinDir)) zip.file(name, readFileSync(new URL(name, linkedinDir)));
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const imported = await readImport(new File([bytes], "download.dat"));
    expect(imported.format).toBe("LinkedIn export");
    expect(imported.name).toBe("Margaret Hamilton");
  });

  it("a broken file is refused with a clear message", async () => {
    await expect(readImport(new File([fixture("broken.json")], "x.json"))).rejects.toThrow(/not valid JSON/);
    await expect(readImport(new File(['{"hello": 1}'], "x.json"))).rejects.toThrow(ImportError);
    await expect(readImport(new File(['{"hello": 1}'], "x.json"))).rejects.toThrow(/not a CoreEx, Reactive Resume, JSON Resume or LinkedIn/);
  });

  it("a file over 5 MB is refused before it is read", async () => {
    const big = new File(["x".repeat(5 * 1024 * 1024 + 1)], "big.json");
    await expect(readImport(big)).rejects.toThrow(/5 MB/);
  });

  it("a zip that would unpack to more than 20 MB is refused before anything is unpacked", async () => {
    const zip = new JSZip();
    zip.file("Profile.csv", new Uint8Array(21 * 1024 * 1024));
    const bytes = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
    await expect(readImport(new File([bytes], "bomb.zip"))).rejects.toThrow(/20 MB/);
  });

  it("a zip with more than 100 files is refused", async () => {
    const zip = new JSZip();
    for (let i = 0; i < 101; i++) zip.file(`f${i}.txt`, "x");
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    await expect(readImport(new File([bytes], "many.zip"))).rejects.toThrow(/100 files/);
  });
});
