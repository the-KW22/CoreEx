import Link from "next/link";

import type { Folder } from "@/lib/folders";
import { childrenByParent } from "@/lib/folders";

// The sidebar tree. Each Folder with subfolders is a <details>, so it collapses without any script.
export function FolderTree({ folders }: { folders: Folder[] }) {
  const children = childrenByParent(folders);

  const list = (parentId: string | null) => (
    <ul>
      {(children.get(parentId) ?? []).map((folder) => (
        <li key={folder.id}>
          {children.has(folder.id) ? (
            <details>
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
