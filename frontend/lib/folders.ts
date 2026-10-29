import type { components } from "./api/schema";

export type Folder = components["schemas"]["FolderResponse"];
export type FlatFolder = Folder & { depth: number };

// The API returns Folders as a flat list; these helpers give it the tree's shape.

export function childrenByParent(folders: Folder[]) {
  const children = new Map<string | null, Folder[]>();
  for (const folder of folders) {
    children.set(folder.parentId, [...(children.get(folder.parentId) ?? []), folder]);
  }
  return children;
}

// The ids of a Folder's parents, up to the top level (the Folder itself excluded). Stops if bad data ever looped.
export function ancestorIds(folders: Folder[], id: string): string[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const ids: string[] = [];
  for (let at = byId.get(id)?.parentId; at && ids.length < folders.length; at = byId.get(at)?.parentId) {
    ids.push(at);
  }
  return ids;
}

// Depth-first, for menus. A Folder in `skip` is left out together with everything below it.
export function flatten(folders: Folder[], skip?: string): FlatFolder[] {
  const children = childrenByParent(folders);
  const out: FlatFolder[] = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const folder of children.get(parentId) ?? []) {
      if (folder.id === skip) continue;
      out.push({ ...folder, depth });
      visit(folder.id, depth + 1);
    }
  };
  visit(null, 0);
  return out;
}

// From the top level down to the Folder itself.
export function pathTo(folders: Folder[], id: string): Folder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: Folder[] = [];
  for (let at = byId.get(id); at; at = at.parentId ? byId.get(at.parentId) : undefined) path.unshift(at);
  return path;
}
