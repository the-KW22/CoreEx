import { redirect } from "next/navigation";

import { createSupabase } from "@/lib/supabase/server";

import { apiClient } from "./client";

// The signed-in person's API client; sends signed-out visitors to /login.
export async function getApi() {
  const supabase = await createSupabase();
  const { data } = await supabase.auth.getSession();
  if (!data.session) redirect("/login");
  return apiClient(data.session.access_token);
}
