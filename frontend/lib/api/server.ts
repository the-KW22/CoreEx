import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createSupabase } from "@/lib/supabase/server";

import { apiClient } from "./client";

// A cookie is user input: only a plausible zone name goes into a header (the API falls back to UTC for anything else).
const ZONE = /^[A-Za-z0-9_+\-/]{1,64}$/;

// The signed-in person's API client; sends signed-out visitors to /login. It carries the timezone the browser put in
// the `tz` cookie (see TimezoneCookie), so a first visit, before the cookie exists, is worked out in UTC.
export async function getApi() {
  const supabase = await createSupabase();
  const { data } = await supabase.auth.getSession();
  if (!data.session) redirect("/login");
  const zone = (await cookies()).get("tz")?.value;
  return apiClient(data.session.access_token, zone && ZONE.test(zone) ? zone : undefined);
}
