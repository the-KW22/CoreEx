"use server";

import { redirect } from "next/navigation";

import { createSupabase } from "@/lib/supabase/server";

export type AuthState = { error?: string; notice?: string } | undefined;

// "Create account" only creates the sign-in; the API still refuses anyone without an Invite.
export async function authenticate(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const credentials = {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };
  if (!credentials.email || !credentials.password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createSupabase();
  if (formData.get("intent") === "signup") {
    const { data, error } = await supabase.auth.signUp(credentials);
    if (error) return { error: error.message };
    if (!data.session) {
      return { notice: "Check your email to confirm your account, then sign in." };
    }
  } else {
    const { error } = await supabase.auth.signInWithPassword(credentials);
    if (error) return { error: error.message };
  }
  redirect("/");
}

export async function signOut() {
  const supabase = await createSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
