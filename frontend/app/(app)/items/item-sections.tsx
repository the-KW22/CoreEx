import Link from "next/link";

import { TagBadge } from "@/components/tag-badge";
import { getApi } from "@/lib/api/server";
import type { Folder } from "@/lib/folders";
import { itemHref } from "@/lib/items";

import { moveItem } from "../folders/actions";
import { FolderSelect } from "../folders/folder-select";
import { addTag, removeTag } from "../tags/actions";

// The parts of an Item's page that every Item has, whether it is a Note or an Asset. `back` is the Item's own
// page, where a failed action comes back to.

export function ItemFolder({
  itemId,
  folderId,
  folders,
  back,
}: {
  itemId: string;
  folderId: string | null;
  folders: Folder[];
  back: string;
}) {
  return (
    <form action={moveItem} className="inline-form">
      <input type="hidden" name="id" value={itemId} />
      <input type="hidden" name="back" value={back} />
      <FolderSelect name="folderId" label="Folder" folders={folders} selected={folderId} />
      <button type="submit">Move</button>
    </form>
  );
}

export async function ItemTags({ itemId, back }: { itemId: string; back: string }) {
  const api = await getApi();
  const [itemTags, allTags] = await Promise.all([
    api.GET("/api/items/{id}/tags", { params: { path: { id: itemId } } }).catch(() => null),
    api.GET("/api/tags").catch(() => null),
  ]);
  const tags = itemTags?.data?.items ?? [];
  const onItem = new Set(tags.map((t) => t.id));
  const suggestions = (allTags?.data?.items ?? []).filter((t) => !onItem.has(t.id));

  return (
    <section aria-labelledby="tags-heading">
      <h2 id="tags-heading">Tags</h2>
      {tags.length === 0 ? (
        <p>No Tags yet.</p>
      ) : (
        <ul className="tag-list">
          {tags.map((tag) => (
            <li key={tag.id}>
              <Link href={`/tags/${tag.id}`}>
                <TagBadge name={tag.name} />
              </Link>
              <form action={removeTag}>
                <input type="hidden" name="id" value={itemId} />
                <input type="hidden" name="tagId" value={tag.id} />
                <input type="hidden" name="back" value={back} />
                <button type="submit" aria-label={`Remove the Tag ${tag.name}`}>
                  ×
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={addTag} className="inline-form">
        <input type="hidden" name="id" value={itemId} />
        <input type="hidden" name="back" value={back} />
        <label>
          Add a Tag
          <input name="name" list="tag-suggestions" required maxLength={50} autoComplete="off" />
        </label>
        <datalist id="tag-suggestions">
          {suggestions.map((tag) => (
            <option key={tag.id} value={tag.name} />
          ))}
        </datalist>
        <button type="submit">Add</button>
      </form>
    </section>
  );
}

export async function ItemBacklinks({ itemId }: { itemId: string }) {
  const api = await getApi();
  const backlinks = await api
    .GET("/api/items/{id}/backlinks", { params: { path: { id: itemId } } })
    .catch(() => null);

  return (
    <section aria-labelledby="backlinks-heading">
      <h2 id="backlinks-heading">Backlinks</h2>
      {!backlinks?.data ? (
        <p role="alert">Could not load the Backlinks.</p>
      ) : backlinks.data.items.length === 0 ? (
        <p>No Notes link here yet.</p>
      ) : (
        <ul>
          {backlinks.data.items.map((backlink) => (
            <li key={backlink.id}>
              <Link href={itemHref({ id: backlink.id, type: "NOTE" })}>{backlink.title || "Untitled"}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
