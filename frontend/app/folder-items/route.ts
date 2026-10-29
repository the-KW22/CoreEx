import { getApi } from "@/lib/api/server";

// The Items in one Folder, for the "In <Folder>" list in the Knowledge Base panel. A plain route, like /quick, so it
// never waits behind an autosave. A failure answers 502 so the panel can say so.
export async function GET(request: Request) {
  const folderId = new URL(request.url).searchParams.get("folderId") ?? "";
  const api = await getApi();
  const result = await api.GET("/api/items", { params: { query: { folderId } } }).catch(() => null);
  if (!result?.data) return Response.json([], { status: 502 });
  return Response.json(result.data.items.map(({ id, type, title }) => ({ id, type, title })));
}
