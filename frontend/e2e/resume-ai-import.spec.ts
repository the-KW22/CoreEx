import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { signIn } from "./helpers";

test("reviews an AI-imported Word Resume before creating it", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  await signIn(page);
  await page.goto("/career/library");
  await page.getByRole("button", { name: "New Resume", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New Resume" });
  const name = `Import ${Date.now()}`;
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${name}</w:t></w:r></w:p></w:body></w:document>`);
  await dialog.getByLabel("Import PDF or Word with AI").setInputFiles({ name: "resume.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: await zip.generateAsync({ type: "nodebuffer" }) });
  await dialog.getByRole("button", { name: "Read with AI" }).click();
  await expect(dialog.getByRole("heading", { name: "What was read" })).toBeVisible();
  await expect(dialog.getByLabel("Name")).toHaveValue(name);
  await dialog.getByRole("button", { name: "Create Resume" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
});

test("reads selectable text from a PDF", async ({ page }) => {
  test.skip(process.env.E2E_FAKE_AI !== "1", "Requires the local fake AI provider");
  const name = `PDF Resume ${Date.now()}`;
  const pdf = await renderToBuffer(createElement(Document, {}, createElement(Page, {}, createElement(Text, {}, name))));
  await signIn(page);
  await page.goto("/career/library");
  await page.getByRole("button", { name: "New Resume", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New Resume" });
  await dialog.getByLabel("Import PDF or Word with AI").setInputFiles({ name: "resume.pdf", mimeType: "application/pdf", buffer: pdf });
  await dialog.getByRole("button", { name: "Read with AI" }).click();
  await expect(dialog.getByRole("heading", { name: "What was read" })).toBeVisible();
  await expect(dialog.getByLabel("Name")).toHaveValue(name);
});
