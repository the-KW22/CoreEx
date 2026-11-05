import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

// Supabase is used for sign-in only; every other call goes through the API (ADR 0003).
export async function createSupabase() {
  // The client starts loading the session on its own as soon as it is created, which reads the clock. Next.js does not
  // allow that while it may still be prerendering, even after cookies(), so wait for the real request first.
  await connection();
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
