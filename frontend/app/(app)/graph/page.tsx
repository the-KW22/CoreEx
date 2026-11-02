import { notFound } from "next/navigation";

import { getApi } from "@/lib/api/server";
import { graphIsNotFound } from "@/lib/graph";

import { GraphView } from "./graph-view";

// The Knowledge Graph of one Folder and its subfolders (?folderId=), or of All Items.
export default async function GraphPage({ searchParams }: PageProps<"/graph">) {
  const { folderId: raw } = await searchParams;
  const folderId = typeof raw === "string" && raw ? raw : null;
  const api = await getApi();
  const [graph, folders] = await Promise.all([
    api.GET("/api/links/graph", { params: { query: { folderId: folderId ?? undefined } } }).catch(() => null),
    api.GET("/api/folders").catch(() => null),
  ]);

  if (!graph || !folders) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  // A Folder that is missing, deleted, someone else's, or not a UUID: all look the same.
  if (graphIsNotFound(graph.response.status, folderId, graph.error)) notFound();
  if (graph.response.status === 404) {
    return <p role="alert">The Graph could not be loaded. The server may be updating, so try again in a minute.</p>;
  }
  if (!graph.data || !folders.data) {
    return <p role="alert">Could not load the graph. Try again.</p>;
  }

  return <GraphView key={folderId ?? "all"} graph={graph.data} folders={folders.data.items} folderId={folderId} />;
}
