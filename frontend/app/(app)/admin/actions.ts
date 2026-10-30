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

// Answers whether it worked, so the table stays put and a toast says so.
export async function revokeInvite(id: string): Promise<boolean> {
  const api = await getApi();
  const result = await api
    .POST("/api/admin/invites/{id}/revoke", { params: { path: { id } } })
    .catch(() => null);
  // Success or not, show the current state (it may already have been revoked).
  revalidatePath("/admin");
  return !!result?.data;
}
