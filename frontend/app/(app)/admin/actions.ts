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

// Both answer an error message, or nothing when it worked, so the table can say so in a toast.
export async function inviteAccessRequest(id: string): Promise<string | undefined> {
  const api = await getApi();
  const result = await api
    .POST("/api/admin/access-requests/{id}/invite", { params: { path: { id } } })
    .catch(() => null);
  revalidatePath("/admin");
  if (result?.response.ok) return undefined;
  return result?.error?.message ?? "Could not invite. Try again.";
}

export async function dismissAccessRequest(id: string): Promise<string | undefined> {
  const api = await getApi();
  const result = await api
    .POST("/api/admin/access-requests/{id}/dismiss", { params: { path: { id } } })
    .catch(() => null);
  revalidatePath("/admin");
  if (result?.response.ok) return undefined;
  return result?.error?.message ?? "Could not dismiss. Try again.";
}

export type ChatSettingsResult = { ok: true } | { error: string };

// The Chat card's save. A 400 carries the API's words for a bad model or budget; anything else gets a plain line.
export async function saveChatSettings(formData: FormData): Promise<ChatSettingsResult> {
  const api = await getApi();
  const result = await api
    .PUT("/api/admin/chat-settings", {
      body: {
        enabled: formData.get("enabled") === "on",
        model: String(formData.get("model") ?? ""),
        dailyBudgetUsd: Number(formData.get("dailyBudgetUsd")),
      },
    })
    .catch(() => null);
  if (!result?.data) {
    const message = result?.response.status === 400 ? result.error?.message : null;
    return { error: message || "Could not save the settings. Try again." };
  }
  revalidatePath("/admin/overview");
  return { ok: true };
}
