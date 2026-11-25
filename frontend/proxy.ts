import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { MARKETING_PATH, marketingRewrite } from "@/lib/marketing";

// Refreshes the Supabase session cookie, shows signed-out visitors the marketing page at / and sends them to /login anywhere else.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const onLogin = request.nextUrl.pathname === "/login";
  // The password reset link arrives signed out and signs the person in. The Resume PDF route is called by the API, which
  // proves itself with the shared secret instead of a session.
  const open =
    onLogin ||
    request.nextUrl.pathname === "/auth/callback" ||
    request.nextUrl.pathname === MARKETING_PATH ||
    request.nextUrl.pathname === "/export/resume-pdf";

  const rewrite = marketingRewrite(request.nextUrl.pathname, signedIn);
  if (rewrite) {
    const rewritten = NextResponse.rewrite(new URL(rewrite, request.url));
    response.cookies.getAll().forEach((cookie) => rewritten.cookies.set(cookie));
    return rewritten;
  }
  if (!signedIn && !open) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (signedIn && onLogin) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
