"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getApi } from "@/lib/api/server";

import { trashItem } from "../items/actions";

export type UploadStart = { ok: true; uploadId: string; uploadUrl: string } | { ok: false; message: string };
export type UploadFinish = { ok: true; id: string } | { ok: false; message: string };

// Step 1: the API checks type, size and quota, and says where the browser may PUT the file.
export async function startUpload(
  filename: string,
  mimeType: string,
  sizeBytes: number,
  folderId: string | null,
): Promise<UploadStart> {
  const api = await getApi();
  const result = await api
    .POST("/api/assets/uploads", { body: { filename, mimeType, sizeBytes, folderId } })
    .catch(() => null);
  if (!result) return { ok: false, message: "Cannot reach the CoreEx API." };
  if (!result.data) return { ok: false, message: result.error?.message ?? "The upload could not be started." };
  return { ok: true, uploadId: result.data.uploadId, uploadUrl: result.data.uploadUrl };
}

// Step 3, after the browser has PUT the file: the API checks what Storage really holds, then creates the Asset.
export async function finishUpload(uploadId: string): Promise<UploadFinish> {
  const api = await getApi();
  const result = await api
    .POST("/api/assets/uploads/{uploadId}/confirm", { params: { path: { uploadId } } })
    .catch(() => null);
  if (!result) return { ok: false, message: "Cannot reach the CoreEx API." };
  if (!result.data) return { ok: false, message: result.error?.message ?? "The upload could not be finished." };
  revalidatePath("/", "layout");
  return { ok: true, id: result.data.id };
}

// Saves an Asset's title and description, edited in place on its page. Answers whether it worked.
export async function saveAssetText(id: string, title: string, description: string): Promise<boolean> {
  const trimmed = title.trim();
  if (!trimmed) return false;
  const api = await getApi();
  const result = await api
    .PUT("/api/assets/{id}", { params: { path: { id } }, body: { title: trimmed, description } })
    .catch(() => null);
  if (!result?.data) return false;
  revalidatePath("/", "layout");
  return true;
}

export async function deleteAsset(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  if (!(await trashItem(id, "ASSET"))) redirect(`/assets/${id}?error=delete`);
  redirect("/items");
}
