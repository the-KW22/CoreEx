"use server";

import { redirect } from "next/navigation";

import type { components } from "@/lib/api/schema";
import { getApi } from "@/lib/api/server";
import type { Stage } from "@/lib/applications";

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

export async function saveApplication(
  id: string,
  fields: Pick<
    Application,
    "title" | "company" | "role" | "location" | "postingUrl" | "postingText" | "version"
  >,
): Promise<SaveResult> {
  const api = await getApi();
  const result = await api.PUT("/api/applications/{id}", { params: { path: { id } }, body: fields }).catch(() => null);
  if (!result) return { status: "error", message: "Cannot reach the CoreEx API." };
  if (result.data) return { status: "saved", application: result.data };
  if (result.response.status === 409) return { status: "conflict" };
  return { status: "error", message: result.error?.message ?? "Could not save the Application." };
}

export async function moveApplicationStage(id: string, stage: Stage, version: number): Promise<SaveResult> {
  const api = await getApi();
  const result = await api
    .POST("/api/applications/{id}/stage", { params: { path: { id } }, body: { stage, version } })
    .catch(() => null);
  if (!result) return { status: "error", message: "Cannot reach the CoreEx API." };
  if (result.data) return { status: "saved", application: result.data };
  if (result.response.status === 409) return { status: "conflict" };
  return { status: "error", message: result.error?.message ?? "Could not move the Application." };
}
