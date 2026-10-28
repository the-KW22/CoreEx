import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase is used for sign-in only; every other call goes through the API (ADR 0003).
export async function createSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(list) {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, which cannot set cookies; proxy.ts refreshes the session.
          }
        },
      },
    },
  );
}
