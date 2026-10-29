"use server";

import { redirect } from "next/navigation";

import { createSupabase } from "@/lib/supabase/server";

export type ResetState = { error?: string } | undefined;

export async function setNewPassword(_previous: ResetState, formData: FormData): Promise<ResetState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== String(formData.get("confirm") ?? "")) return { error: "The two passwords are not the same." };

  const supabase = await createSupabase();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  redirect("/");
}
