"use server";

import type { components } from "@/lib/api/schema";
import { getApi } from "@/lib/api/server";

import { mineTitle, type ResumeDocument } from "./store";

export type SaveResult =
  | { status: "saved"; version: number }
  | { status: "conflict" }
  | { status: "locked" }
  | { status: "error"; message: string };

export type Loaded = { title: string; doc: ResumeDocument; version: number; locked: boolean };
export type Review = components["schemas"]["Review"];

export async function resumeReviews(id: string): Promise<Review[] | null> {
  const api = await getApi();
  const result = await api.GET("/api/resumes/{id}/reviews", { params: { path: { id } } }).catch(() => null);
  return result?.data ?? null;
}

export async function reviewResume(id: string, version: number) {
  const api = await getApi();
  const result = await api.POST("/api/resumes/{id}/reviews", { params: { path: { id } }, body: { version } }).catch(() => null);
  return result?.data ? { review: result.data, error: null } : { review: null, error: result?.response.status === 429
    ? "You have used today's AI budget. It starts again at midnight UTC." : "Could not review this Resume. Save changes and try again." };
}

export async function decideReview(id: string, reviewId: string, ids: string[], accept: boolean): Promise<Loaded | null> {
  const api = await getApi();
  const params = { path: { id, reviewId } };
  const result = await (accept ? api.POST("/api/resumes/{id}/reviews/{reviewId}/accept", { params, body: { ids } })
    : api.POST("/api/resumes/{id}/reviews/{reviewId}/reject", { params, body: { ids } })).catch(() => null);
  const value = result?.data;
  return value ? { title: value.title, doc: value.document, version: value.version, locked: value.locked } : null;
}

export async function improveResumeText(id: string, field: string, version: number) {
  const api = await getApi();
  const result = await api.POST("/api/resumes/{id}/improve", { params: { path: { id } }, body: { field, version } }).catch(() => null);
  return result?.data ? { suggestion: result.data, error: null } : { suggestion: null, error: result?.response.status === 429
    ? "You have used today's AI budget. It starts again at midnight UTC." : result?.response.status === 409
      ? "The Resume changed. Reload and try again." : "Could not improve this text. Try again." };
}

export async function acceptResumeImprovement(id: string, suggestionId: string, version: number): Promise<Loaded | null> {
  const api = await getApi();
  const result = await api.POST("/api/resumes/{id}/improve/accept", { params: { path: { id } }, body: { suggestionId, version } }).catch(() => null);
  const value = result?.data;
  return value?.title && value.document && value.version !== undefined && value.locked !== undefined
    ? { title: value.title, doc: value.document, version: value.version, locked: value.locked } : null;
}

export async function rejectResumeImprovement(id: string, suggestionId: string): Promise<boolean> {
  const api = await getApi();
  const result = await api.POST("/api/resumes/{id}/improve/{suggestionId}/reject", { params: { path: { id, suggestionId } } }).catch(() => null);
  return !!result?.response.ok;
}

export async function applicationsForMatch() {
  const api = await getApi();
  const applications: { id: string; title: string; company: string; postingText: string }[] = [];
  for (let page = 0; ; page++) {
    const result = await api.GET("/api/applications", { params: { query: { page, size: 100 } } }).catch(() => null);
    if (!result?.data) return null;
    applications.push(...result.data.items.map(({ id, title, company, postingText }) => ({ id, title, company, postingText })));
    if (applications.length >= result.data.total || result.data.items.length === 0) return applications;
  }
}

export async function resumeMarkdown(id: string): Promise<{ markdown: string; version: number } | null> {
  const api = await getApi();
  const result = await api.GET("/api/resumes/{id}/markdown", { params: { path: { id } } }).catch(() => null);
  return result?.data ?? null;
}

// Saves the whole document with the save counter the editor last saw.
export async function saveResume(id: string, title: string, doc: ResumeDocument, version: number): Promise<SaveResult> {
  const api = await getApi();
  const result = await api
    .PUT("/api/resumes/{id}", { params: { path: { id } }, body: { title, document: doc, version } })
    .catch(() => null);
  if (!result) return { status: "error", message: "Cannot reach the CoreEx API." };
  if (result.response.status === 409) {
    // A locked Resume refuses the save; anything else is another tab having saved first.
    const code = (result.error as { code?: string } | undefined)?.code;
    return code === "RESUME_LOCKED" ? { status: "locked" } : { status: "conflict" };
  }
  if (!result.data) return { status: "error", message: result.error?.message ?? "Could not save the Resume." };
  return { status: "saved", version: result.data.version };
}

// The stored Resume, for loading it after a conflict.
export async function loadResume(id: string): Promise<Loaded | null> {
  const api = await getApi();
  const result = await api.GET("/api/resumes/{id}", { params: { path: { id } } }).catch(() => null);
  return result?.data
    ? { title: result.data.title, doc: result.data.document, version: result.data.version, locked: result.data.locked }
    : null;
}

// Another tab saved first: keep what this tab typed as a new Resume called "<title> (mine)". False when it was not kept.
export async function saveCopy(title: string, doc: ResumeDocument): Promise<boolean> {
  const api = await getApi();
  const made = await api.POST("/api/resumes", { body: { title: mineTitle(title), id: crypto.randomUUID() } }).catch(() => null);
  if (!made?.data) return false;
  const saved = await api
    .PUT("/api/resumes/{id}", {
      params: { path: { id: made.data.id } },
      body: { title: made.data.title, document: doc, version: made.data.version },
    })
    .catch(() => null);
  return !!saved?.data;
}

// Locks or unlocks the Resume. False when it could not be done.
export async function setLocked(id: string, locked: boolean): Promise<boolean> {
  const api = await getApi();
  const result = await api.PUT("/api/resumes/{id}/lock", { params: { path: { id } }, body: { locked } }).catch(() => null);
  return !!result?.response.ok;
}

// The photo's picture as a data URL, or null when it cannot be shown (the Asset is gone, not a PNG or JPEG, or too big).
// The API's signed link is followed here, on the server, so the browser needs no access to Storage and a link cannot
// run out while a page is being drawn. react-pdf draws PNG and JPEG only.
export async function photoData(assetId: string): Promise<string | null> {
  const api = await getApi();
  const link = await api.GET("/api/assets/{id}/url", { params: { path: { id: assetId } } }).catch(() => null);
  if (!link?.data) return null;
  const file = await fetch(link.data.url).catch(() => null);
  const type = file?.headers.get("content-type")?.split(";")[0] ?? "";
  if (!file?.ok || (type !== "image/png" && type !== "image/jpeg")) return null;
  const bytes = Buffer.from(await file.arrayBuffer());
  return bytes.length > 5_000_000 ? null : `data:${type};base64,${bytes.toString("base64")}`;
}

export type VersionSummary = components["schemas"]["ResumeVersionSummary"];
export type OpenedVersion = { id: string; title: string; name: string | null; doc: ResumeDocument };
export type Restored = { status: "restored"; resume: Loaded } | { status: "conflict" } | { status: "locked" } | { status: "error" };

// The Resume's history, newest first. Null when it could not be read.
export async function listVersions(id: string): Promise<VersionSummary[] | null> {
  const api = await getApi();
  const result = await api.GET("/api/resumes/{id}/versions", { params: { path: { id } } }).catch(() => null);
  return result?.data?.items ?? null;
}

// One version with its document, to look at on the page.
export async function openVersion(id: string, versionId: string): Promise<OpenedVersion | null> {
  const api = await getApi();
  const result = await api
    .GET("/api/resumes/{id}/versions/{versionId}", { params: { path: { id, versionId } } })
    .catch(() => null);
  const v = result?.data;
  return v ? { id: v.id, title: v.title, name: v.name, doc: v.document } : null;
}

// Keeps the Resume as it is stored now under a name.
export async function nameCurrentVersion(id: string, name: string): Promise<boolean> {
  const api = await getApi();
  const result = await api.POST("/api/resumes/{id}/versions", { params: { path: { id } }, body: { name } }).catch(() => null);
  return !!result?.data;
}

// Names a version, or clears its name with an empty one.
export async function renameVersion(id: string, versionId: string, name: string): Promise<boolean> {
  const api = await getApi();
  const result = await api
    .PUT("/api/resumes/{id}/versions/{versionId}/name", { params: { path: { id, versionId } }, body: { name } })
    .catch(() => null);
  return !!result?.response.ok;
}

// Saves that version as the Resume, at the save counter the caller last saw; what it replaces is kept as a version.
export async function restoreVersion(id: string, versionId: string, version: number): Promise<Restored> {
  const api = await getApi();
  const result = await api
    .POST("/api/resumes/{id}/versions/{versionId}/restore", { params: { path: { id, versionId } }, body: { version } })
    .catch(() => null);
  if (result?.data) {
    const r = result.data;
    return { status: "restored", resume: { title: r.title, doc: r.document, version: r.version, locked: r.locked } };
  }
  if (result?.response.status === 409) {
    return (result.error as { code?: string } | undefined)?.code === "RESUME_LOCKED" ? { status: "locked" } : { status: "conflict" };
  }
  return { status: "error" };
}

export type ImageAsset = { id: string; title: string };

// The User's PNG and JPEG Assets, for choosing a photo.
// shortcut: the first 100 Assets, and "an image" is judged by the file name, upgrade when the list can filter by type.
export async function imageAssets(): Promise<ImageAsset[]> {
  const api = await getApi();
  const result = await api.GET("/api/items", { params: { query: { type: "ASSET", page: 0, size: 100 } } }).catch(() => null);
  return (result?.data?.items ?? []).filter((i) => /\.(png|jpe?g)$/i.test(i.title)).map((i) => ({ id: i.id, title: i.title }));
}
