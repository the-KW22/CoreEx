"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createSupabase } from "@/lib/supabase/server";

export type AuthState = { error?: string; notice?: string } | undefined;

// "Create account" only creates the sign-in; the API still refuses anyone without an Invite.
export async function authenticate(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (formData.get("intent") === "reset") return requestPasswordReset(String(formData.get("email") ?? "").trim());

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

// Always the same answer, so it does not reveal whether an account exists. The emailed link comes back to /auth/callback;
// Supabase only sends people to addresses on its redirect allow-list (Auth > URL Configuration), whatever this asks for.
async function requestPasswordReset(email: string): Promise<AuthState> {
  if (!email) return { error: "Enter your email, then select Forgot password." };
  const origin = (await headers()).get("origin");
  const supabase = await createSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: origin ? `${origin}/auth/callback` : undefined,
  });
  if (error) return { error: error.message };
  return { notice: "If an account exists for that email, we sent a link to choose a new password." };
}

export async function signOut() {
  const supabase = await createSupabase();
  await supabase.auth.signOut();
  // Signed out, / is the public marketing page.
  redirect("/");
}
