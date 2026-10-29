import type { NextRequest } from "next/server";

import { createSupabase } from "@/lib/supabase/server";

// A relative Location keeps the browser on the address it used, which is where the session cookie was just set.
const redirectTo = (path: string) => new Response(null, { status: 307, headers: { Location: path } });

// The link in a password reset email lands here with a one-time code; trade it for a session, then choose a new password.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirectTo("/reset-password");
  }
  // Expired, already used, or opened in a different browser than the one that asked for it.
  return redirectTo("/login?error=link");
}
