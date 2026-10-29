import { getApi } from "@/lib/api/server";

// The quick switcher's lookup. A plain route, not a server action: the browser runs server actions one at a time, so
// an action would wait behind an autosave. A failed call answers "nothing found", because the switcher is a convenience.
export async function GET(request: Request) {
  const text = new URL(request.url).searchParams.get("q") ?? "";
  const api = await getApi();
  const result = await api
    .GET("/api/search/quick", { params: { query: { q: text.slice(0, 200) } } })
    .catch(() => null);
  return Response.json(result?.data?.items ?? []);
}
