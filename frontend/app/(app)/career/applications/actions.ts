"use server";

import { redirect } from "next/navigation";

import type { components } from "@/lib/api/schema";
import { getApi } from "@/lib/api/server";
import type { CloseReason, Stage } from "@/lib/applications";

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

export async function deleteTimelineEntry(id: string, seq: number, version: number): Promise<SaveResult> {
  const api = await getApi();
  return outcome(
    api.DELETE("/api/applications/{id}/timeline/{seq}", { params: { path: { id, seq }, query: { version } } }),
    "Could not delete the timeline entry.",
  );
}
