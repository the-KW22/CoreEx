"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Folder } from "@/lib/folders";
import { ancestorIds, childrenByParent } from "@/lib/folders";

// The sidebar tree. Each Folder with subfolders is a <details>, open along the path to the Folder being viewed.
export function FolderTree({ folders }: { folders: Folder[] }) {
  const children = childrenByParent(folders);
  const viewing = /^\/folders\/([^/]+)/.exec(usePathname())?.[1];
  const opened = new Set(viewing ? [viewing, ...ancestorIds(folders, viewing)] : []);

  const list = (parentId: string | null) => (
    <ul>
      {(children.get(parentId) ?? []).map((folder) => (
        <li key={folder.id}>
          {children.has(folder.id) ? (
            <details open={opened.has(folder.id)}>
              <summary>
                <Link href={`/folders/${folder.id}`}>{folder.name}</Link>
              </summary>
              {list(folder.id)}
            </details>
          ) : (
            <Link href={`/folders/${folder.id}`}>{folder.name}</Link>
          )}
        </li>
      ))}
    </ul>
  );

  return list(null);
}
