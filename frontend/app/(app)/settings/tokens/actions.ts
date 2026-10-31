"use server";

import { revalidatePath } from "next/cache";

import { getApi } from "@/lib/api/server";

export type TokenState = { error?: string; name?: string; secret?: string } | undefined;

export async function createToken(_previous: TokenState, formData: FormData): Promise<TokenState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a name." };
  const expiry = String(formData.get("expiry") ?? "90");

  const api = await getApi();
  const result = await api
    .POST("/api/access-tokens", {
      body: expiry === "never" ? { name, neverExpires: true } : { name, expiresInDays: Number(expiry) },
    })
    .catch(() => null);
  if (!result) return { error: "Cannot reach the CoreEx API." };
  if (!result.data) return { error: result.error?.message ?? "Could not create the Access token." };

  revalidatePath("/settings/tokens");
  return { name, secret: result.data.token };
}

// Answers whether it worked, so the table stays put and a toast says so.
export async function revokeToken(id: string): Promise<boolean> {
  const api = await getApi();
  const result = await api
    .DELETE("/api/access-tokens/{id}", { params: { path: { id } } })
    .catch(() => null);
  revalidatePath("/settings/tokens");
  return !!result?.response.ok;
}
