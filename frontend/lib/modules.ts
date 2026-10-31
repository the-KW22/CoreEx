export type Module = "home" | "kb" | "assets" | "trash" | "admin";

// Which rail entry a page belongs to. Every page that is not Home, Assets, Trash or Admin is part of the Knowledge Base.
export function activeModule(pathname: string): Module {
  if (pathname === "/") return "home";
  const first = pathname.split("/")[1];
  return first === "assets" || first === "trash" || first === "admin" ? first : "kb";
}
