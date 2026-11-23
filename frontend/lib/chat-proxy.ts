import { redirect } from "next/navigation";

import { timezoneCookie } from "@/lib/api/server";
import { createSupabase } from "@/lib/supabase/server";

const ID = /^[0-9a-f-]{36}$/i;

// Sends a Chat message (path "messages") or the answer to its question ("answer") and passes the reply's Server-Sent Events straight through to the browser. A plain route, not a
// server action: an action cannot stream. The browser never sees the API address or the token; the status and body of a
// refusal (Chat off, budget spent, a reply already running) are passed on as the API gave them.
export async function proxyChatStream(request: Request, id: string, path: "messages" | "answer") {
  if (!ID.test(id)) return new Response(null, { status: 404 });
  const supabase = await createSupabase();
  const { data } = await supabase.auth.getSession();
  if (!data.session) redirect("/login");
  const zone = await timezoneCookie();
  const upstream = await fetch(`${process.env.API_URL ?? "http://localhost:8080"}/api/chats/${id}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json",
      ...(zone ? { "X-Timezone": zone } : {}),
    },
    body: await request.text(),
    // The reply runs on the server whatever the browser does; closing the tab only closes this pipe.
    signal: request.signal,
  }).catch(() => null);
  if (!upstream) return Response.json({ code: "AI_UNAVAILABLE" }, { status: 502 });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
