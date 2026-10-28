"use server";

import { revalidatePath } from "next/cache";

import { getApi } from "@/lib/api/server";

export type InviteState = { error?: string; created?: string } | undefined;

export async function createInvite(
  _previous: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter an email." };

  const api = await getApi();
  const result = await api
    .POST("/api/admin/invites", { body: { email } })
    .catch(() => null);
  if (!result) return { error: "Cannot reach the CoreEx API." };

  if (!result.data) {
    return { error: result.error?.message ?? "Could not create the Invite." };
  }
  revalidatePath("/admin");
  return { created: result.data.email };
}

export async function revokeInvite(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const api = await getApi();
  await api
    .POST("/api/admin/invites/{id}/revoke", { params: { path: { id } } })
    .catch(() => null);
  // Success or not, show the current state (it may already have been revoked).
  revalidatePath("/admin");
}
