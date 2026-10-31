import { getApi } from "@/lib/api/server";

// The Notes tab of the Knowledge Base panel. Without text: the most recently updated Notes. With text: the Notes whose
// title matches, from the quick search, so every Note is searched and not one page. A plain route, like /quick, so it
// never waits behind an autosave. A failure answers 502 so the panel can say so.
// shortcut: the list without text is one page of 50, add paging or "more" if someone keeps many more Notes at hand.
export async function GET(request: Request) {
  const text = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 200);
  const api = await getApi();
  if (text) {
    const found = await api.GET("/api/search/quick", { params: { query: { q: text } } }).catch(() => null);
    if (!found?.data) return Response.json([], { status: 502 });
    return Response.json(found.data.items.filter((hit) => hit.type === "NOTE").map(({ id, title }) => ({ id, title })));
  }
  const result = await api.GET("/api/items", { params: { query: { type: "NOTE", size: 50 } } }).catch(() => null);
  if (!result?.data) return Response.json([], { status: 502 });
  return Response.json(result.data.items.map(({ id, title }) => ({ id, title })));
}
