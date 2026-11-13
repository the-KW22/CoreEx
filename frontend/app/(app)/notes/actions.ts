"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { components } from "@/lib/api/schema";
import { getApi } from "@/lib/api/server";

import { trashItem } from "../items/actions";
import type { LinkTarget } from "./[id]/links";
import { firstLines } from "./[id]/text";

export type SaveResult =
  | { status: "saved"; version: number; updatedAt: string; body: string }
  | { status: "conflict" }
  | { status: "error"; message: string };

export type LoadedNote = { title: string; body: string; version: number; updatedAt: string; editedBy: string | null };

// A Folder id in the form (the Folder being viewed) files the new Note there; without one it is top level.
export async function createNote(formData: FormData) {
  const folderId = String(formData.get("folderId") ?? "") || null;
  const api = await getApi();
  const result = await api.POST("/api/notes", { body: { folderId } }).catch(() => null);
  if (!result?.data) redirect(folderId ? `/folders/${folderId}?error=create` : "/?failed=create");
  redirect(`/notes/${result.data.id}`);
}

// With overwrite, the Note's current version is read first, so the caller's text wins over what is stored.
export async function saveNote(
  id: string,
  title: string,
  body: string,
  version: number,
  overwrite: boolean,
): Promise<SaveResult> {
  const api = await getApi();
  let seen = version;
  if (overwrite) {
    const current = await api
      .GET("/api/notes/{id}", { params: { path: { id } } })
      .catch(() => null);
    if (!current?.data) return { status: "error", message: "Could not reach the Note to overwrite it." };
    seen = current.data.version;
  }

  const result = await api
    .PUT("/api/notes/{id}", { params: { path: { id } }, body: { title, body, version: seen } })
    .catch(() => null);
  if (!result) return { status: "error", message: "Cannot reach the CoreEx API." };
  // The stored body can differ from what was sent: the server turns a hand-typed [[Exact Title]] into a Link.
  if (result.data) {
    return { status: "saved", version: result.data.version, updatedAt: result.data.updatedAt, body: result.data.body };
  }
  if (result.response.status === 409) return { status: "conflict" };
  return { status: "error", message: result.error?.message ?? "Could not save the Note." };
}

// The opening text of a Link's target, for the hover preview: a Note's first lines or an Asset's description.
// Null when it cannot be loaded; the preview then shows what the editor already knows.
export async function linkPreview(id: string, type: "NOTE" | "ASSET"): Promise<string | null> {
  const api = await getApi();
  if (type === "NOTE") {
    const note = await api.GET("/api/notes/{id}", { params: { path: { id } } }).catch(() => null);
    return note?.data ? firstLines(note.data.body) : null;
  }
  const asset = await api.GET("/api/assets/{id}", { params: { path: { id } } }).catch(() => null);
  return asset?.data ? firstLines(asset.data.description) : null;
}

export async function loadNote(id: string): Promise<LoadedNote | null> {
  const api = await getApi();
  const result = await api.GET("/api/notes/{id}", { params: { path: { id } } }).catch(() => null);
  return result?.data ?? null;
}

export type NoteVersion = components["schemas"]["VersionSummary"];

// The Note's earlier texts, newest first, without the text. Null when they cannot be loaded.
export async function loadVersions(id: string): Promise<NoteVersion[] | null> {
  const api = await getApi();
  const result = await api.GET("/api/notes/{id}/versions", { params: { path: { id } } }).catch(() => null);
  return result?.data?.items ?? null;
}

// The text of one version, for the preview. Null when it cannot be loaded.
export async function loadVersionText(id: string, versionId: string): Promise<string | null> {
  const api = await getApi();
  const result = await api
    .GET("/api/notes/{id}/versions/{versionId}", { params: { path: { id, versionId } } })
    .catch(() => null);
  return result?.data?.body ?? null;
}

export type RestoreResult =
  | { status: "restored"; note: LoadedNote }
  | { status: "conflict" }
  | { status: "error"; message: string };

// Saves an earlier text as the Note's text. `version` is the Note's version the editor last saw.
export async function restoreVersion(id: string, versionId: string, version: number): Promise<RestoreResult> {
  const api = await getApi();
  const result = await api
    .POST("/api/notes/{id}/versions/{versionId}/restore", { params: { path: { id, versionId } }, body: { version } })
    .catch(() => null);
  if (!result) return { status: "error", message: "Cannot reach the CoreEx API." };
  if (result.data) return { status: "restored", note: result.data };
  if (result.response.status === 409) return { status: "conflict" };
  return { status: "error", message: result.error?.message ?? "Could not restore that version." };
}

// Autocomplete for "[[": the User's live Items whose title contains the text. Empty when the API is unreachable.
export async function suggestLinks(text: string): Promise<LinkTarget[]> {
  const api = await getApi();
  const result = await api
    .GET("/api/links/suggestions", { params: { query: { q: text.slice(0, 200) } } })
    .catch(() => null);
  return result?.data?.items ?? [];
}

// Current details of Link targets. Ids that are not live Items of the User are left out of the answer; null means
// the lookup itself failed, which must not be mistaken for "unresolved".
export async function resolveLinks(ids: string[]): Promise<LinkTarget[] | null> {
  const api = await getApi();
  const result = await api.POST("/api/links/resolve", { body: { ids: ids.slice(0, 100) } }).catch(() => null);
  return result?.data?.items ?? null;
}

export type ImportOutcome = { ok: true; id: string; title: string } | { ok: false; message: string };

// Imports .md and .txt files as Notes, one outcome per file in the order given. The files of one call are imported
// together, so Links between them resolve. The API checks type, size, UTF-8 and Links; this only forwards the files
// and reports what the API said. The browser keeps each call under a server action's body limit.
export async function importNotes(formData: FormData): Promise<ImportOutcome[]> {
  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
  const failAll = (message: string) => files.map((): ImportOutcome => ({ ok: false, message }));
  if (files.length === 0) return [];
  const folderId = String(formData.get("folderId") ?? "") || undefined;

  const api = await getApi();
  const result = await api
    .POST("/api/notes/import", {
      params: { query: { folderId } },
      // The generated type calls the files strings; the serializer sends the real files as multipart.
      body: { files: [] },
      bodySerializer: () => {
        const form = new FormData();
        for (const file of files) form.append("files", file, file.name);
        return form;
      },
    })
    .catch(() => null);
  if (!result) return failAll("Cannot reach the CoreEx API.");
  if (!result.data) return failAll(result.error?.message ?? "The files could not be imported.");

  revalidatePath("/", "layout");
  return files.map((_, index): ImportOutcome => {
    const one = result.data.results[index];
    return one?.status === "IMPORTED" && one.noteId
      ? { ok: true, id: one.noteId, title: one.title ?? "" }
      : { ok: false, message: one?.message ?? "The file was refused." };
  });
}

export async function deleteNote(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await trashItem(id, "NOTE");
  // Success or not, the Item list is the place to see where things stand.
  redirect("/items");
}
