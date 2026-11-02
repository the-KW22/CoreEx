export type Module = "home" | "kb" | "assets" | "graph" | "trash" | "admin" | "settings" | "help";

// Which rail entry a page belongs to. Every page that is not Home, Assets, Graph, Trash, Admin, Settings or Help is part of the
// Knowledge Base (Settings and Help have no rail entry of their own: they open from the account menu).
export function activeModule(pathname: string): Module {
  if (pathname === "/") return "home";
  const first = pathname.split("/")[1];
  return first === "assets" || first === "graph" || first === "trash" || first === "admin" || first === "settings" || first === "help" ? first : "kb";
}
