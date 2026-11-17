export type Module = "home" | "kb" | "assets" | "graph" | "career" | "docs" | "trash" | "admin" | "settings";

// Which rail entry a page belongs to. Every page that is not Home, Assets, Graph, Career, Docs, Trash, Admin or Settings is
// part of the Knowledge Base (Settings has no rail entry of its own: it opens from the account menu).
export function activeModule(pathname: string): Module {
  if (pathname === "/") return "home";
  const first = pathname.split("/")[1];
  return first === "assets" || first === "graph" || first === "career" || first === "docs" || first === "trash" || first === "admin" || first === "settings" ? first : "kb";
}
