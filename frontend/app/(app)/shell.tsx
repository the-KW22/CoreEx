import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getApi } from "@/lib/api/server";
import { parseRail } from "@/lib/prefs";

import { AppFrame } from "./app-frame";

function Problem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div role="alert" className="grid max-w-sm gap-2 rounded-[14px] border border-border bg-surface p-6 text-center">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </main>
  );
}

// Asks the API who is signed in; the API decides whether they may use CoreEx.
export async function Shell({ children }: { children: React.ReactNode }) {
  const api = await getApi();
  // Together, not one after the other: each call is a round trip to the API.
  const [result, folders, tags, jar] = await Promise.all([
    api.GET("/api/me").catch(() => null),
    api.GET("/api/folders").catch(() => null),
    api.GET("/api/tags").catch(() => null),
    cookies(),
  ]);

  if (!result) {
    return <Problem title="Cannot reach CoreEx">The CoreEx API is not answering. Is the backend running?</Problem>;
  }
  const { data: me, error, response } = result;
  if (response.status === 401) redirect("/login");
  if (response.status === 403) {
    redirect(error?.code === "USER_DISABLED" ? "/disabled" : "/invite-only");
  }
  if (!me) {
    return <Problem title="Something went wrong">Something went wrong loading your account. Try again.</Problem>;
  }

  return (
    <AppFrame
      email={me.email}
      isAdmin={me.role === "ADMIN"}
      rail={parseRail(jar.get("rail")?.value)}
      folders={folders?.data?.items ?? null}
      tags={tags?.data?.items ?? null}
    >
      {children}
    </AppFrame>
  );
}
