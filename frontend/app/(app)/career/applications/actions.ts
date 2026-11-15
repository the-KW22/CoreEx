"use server";

import { redirect } from "next/navigation";

import type { components } from "@/lib/api/schema";
import { getApi } from "@/lib/api/server";
import { done } from "@/lib/refresh";
import type { CloseReason, InterviewKind, Stage } from "@/lib/applications";

import { restoreItem } from "../../items/actions";

type Application = components["schemas"]["ApplicationResponse"];

export type CreateState = { error?: string } | undefined;

export type SaveResult =
  | { status: "saved"; application: Application }
  | { status: "conflict" }
  | { status: "error"; message: string };

// A new Application from pasted posting text and the typed company and role; it opens on success.
export async function createApplication(_previous: CreateState, formData: FormData): Promise<CreateState> {
  const field = (name: string) => String(formData.get(name) ?? "");
  const company = field("company").trim();
  const role = field("role").trim();
  if (!company || !role) return { error: "Enter the company and the role." };

  const api = await getApi();
  const result = await api
    .POST("/api/applications", { body: { company, role, postingText: field("postingText") } })
    .catch(() => null);
  if (!result) return { error: "Cannot reach the CoreEx API." };
  if (!result.data) return { error: result.error?.message ?? "Could not create the Application." };
  redirect(`/career/applications/${result.data.id}`);
}

// Every call that answers with the stored Application: a 409 is a stale version, anything else a message to show.
async function outcome(
  call: Promise<{ data?: Application; error?: { message?: string }; response: Response }>,
  failure: string,
): Promise<SaveResult> {
  const result = await call.catch(() => null);
  if (!result) return { status: "error", message: "Cannot reach the CoreEx API." };
  if (result.data) return { status: "saved", application: result.data };
  if (result.response.status === 409) return { status: "conflict" };
  return { status: "error", message: result.error?.message ?? failure };
}

export async function saveApplication(
  id: string,
  fields: Pick<
    Application,
    "title" | "company" | "role" | "location" | "postingUrl" | "postingText" | "version"
  >,
): Promise<SaveResult> {
  const api = await getApi();
  return outcome(
    api.PUT("/api/applications/{id}", { params: { path: { id } }, body: fields }),
    "Could not save the Application.",
  );
}

// A day left empty means today; Closed needs its reason.
export async function moveApplicationStage(
  id: string,
  stage: Stage,
  version: number,
  closeReason?: CloseReason,
  date?: string,
): Promise<SaveResult> {
  const api = await getApi();
  return outcome(
    api.POST("/api/applications/{id}/stage", {
      params: { path: { id } },
      body: { stage, version, closeReason, date: date || undefined },
    }),
    "Could not move the Application.",
  );
}

// The Board's move: it names the Stage the card was seen in, not a version, so a note added meanwhile does not refuse it
// but a move made elsewhere does. The caller refreshes the page after either answer.
export async function moveOnBoard(
  id: string,
  fromStage: Stage,
  stage: Stage,
  closeReason?: CloseReason,
): Promise<"saved" | "conflict" | "error"> {
  const api = await getApi();
  const result = await api
    .POST("/api/applications/{id}/stage", { params: { path: { id } }, body: { stage, fromStage, closeReason } })
    .catch(() => null);
  if (result?.data) {
    done(true);
    return "saved";
  }
  if (result?.response.status === 409) {
    done(true);
    return "conflict";
  }
  return "error";
}

export async function addTimelineEntry(
  id: string,
  entry: { type: "NOTE" | "FOLLOWED_UP" | "REPLIED"; text?: string; date?: string },
  version: number,
): Promise<SaveResult> {
  const api = await getApi();
  return outcome(
    api.POST("/api/applications/{id}/timeline", {
      params: { path: { id } },
      body: { ...entry, date: entry.date || undefined, version },
    }),
    "Could not add to the timeline.",
  );
}

export async function editTimelineEntry(
  id: string,
  seq: number,
  change: { text?: string; date?: string },
  version: number,
): Promise<SaveResult> {
  const api = await getApi();
  return outcome(
    api.PUT("/api/applications/{id}/timeline/{seq}", {
      params: { path: { id, seq } },
      body: { ...change, date: change.date || undefined, version },
    }),
    "Could not change the timeline entry.",
  );
}

export async function saveInterview(
  id: string,
  seq: number | null,
  interview: { startsAt: string; kind: InterviewKind; notes: string },
  version: number,
): Promise<SaveResult> {
  const api = await getApi();
  const body = { ...interview, version };
  return outcome(
    seq === null
      ? api.POST("/api/applications/{id}/interviews", { params: { path: { id } }, body })
      : api.PUT("/api/applications/{id}/interviews/{seq}", { params: { path: { id, seq } }, body }),
    "Could not save the interview.",
  );
}

// No day clears the reminder.
export async function saveReminder(id: string, on: string, time: string, version: number): Promise<SaveResult> {
  const api = await getApi();
  return outcome(
    api.PUT("/api/applications/{id}/reminder", {
      params: { path: { id } },
      body: { on: on || undefined, time: on && time ? time : undefined, version },
    }),
    "Could not save the reminder.",
  );
}

export async function deleteTimelineEntry(id: string, seq: number, version: number): Promise<SaveResult> {
  const api = await getApi();
  return outcome(
    api.DELETE("/api/applications/{id}/timeline/{seq}", { params: { path: { id, seq }, query: { version } } }),
    "Could not delete the timeline entry.",
  );
}

// What a bulk action did: the Applications it worked on and the ones it did not, with why. Null when it could not run
// at all (the API is down, or the request was refused).
export type BulkOutcome = { done: string[]; failed: { id: string; code: string }[] } | null;

function outcome_(result: { data?: { done: string[]; failed: { id: string; code: string }[] } } | null): BulkOutcome {
  if (!result?.data) return null;
  done(true);
  return result.data;
}

export async function bulkMoveStage(ids: string[], stage: Stage, closeReason?: CloseReason): Promise<BulkOutcome> {
  const api = await getApi();
  return outcome_(await api.POST("/api/applications/bulk/stage", { body: { ids, stage, closeReason } }).catch(() => null));
}

export async function bulkAddTag(ids: string[], name: string): Promise<BulkOutcome> {
  const api = await getApi();
  return outcome_(await api.POST("/api/applications/bulk/tags/add", { body: { ids, name } }).catch(() => null));
}

export async function bulkRemoveTag(ids: string[], tagId: string): Promise<BulkOutcome> {
  const api = await getApi();
  return outcome_(await api.POST("/api/applications/bulk/tags/remove", { body: { ids, tagId } }).catch(() => null));
}

export async function bulkTrash(ids: string[]): Promise<BulkOutcome> {
  const api = await getApi();
  return outcome_(await api.POST("/api/applications/bulk/trash", { body: { ids } }).catch(() => null));
}

// Undo for a bulk Move to Trash: the Trash's own restore, one call per Application.
export async function restoreApplications(ids: string[]): Promise<NonNullable<BulkOutcome>> {
  const results = await Promise.all(ids.map(async (id) => ({ id, ok: await restoreItem(id) })));
  return {
    done: results.filter((r) => r.ok).map((r) => r.id),
    failed: results.filter((r) => !r.ok).map((r) => ({ id: r.id, code: "NOT_FOUND" })),
  };
}
