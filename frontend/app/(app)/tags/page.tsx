import Link from "next/link";

import { TagBadge } from "@/components/tag-badge";
import { getApi } from "@/lib/api/server";

import { TagActions } from "./tag-actions";

// The Tags screen (docs/DESIGN.md section 6.8): every Tag with its colour, its Item count and its actions.
export default async function TagsPage() {
  const api = await getApi();
  const result = await api.GET("/api/tags").catch(() => null);

  if (!result) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  if (!result.data) {
    return <p role="alert">Could not load your Tags. Try again.</p>;
  }
  const tags = result.data.items;

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <header className="grid gap-1">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Tags</h1>
        <p className="text-sm text-muted-foreground">
          {tags.length} {tags.length === 1 ? "Tag" : "Tags"}
        </p>
      </header>

      {tags.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No Tags yet. Add one from a Note or an Asset.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">All your Tags</caption>
          <thead className="text-left text-xs font-medium text-muted-foreground max-md:sr-only">
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pr-4 font-medium">Tag</th>
              <th scope="col" className="py-2 pr-4 font-medium">Items</th>
              <th scope="col" className="py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {tags.map((tag) => (
              <tr key={tag.id} className="border-b border-border-subtle hover:bg-surface">
                <td className="py-2 pr-4">
                  <Link href={`/tags/${tag.id}`} className="rounded-full">
                    <TagBadge name={tag.name} colour={tag.colour} />
                  </Link>
                </td>
                <td className="py-2 pr-4 font-mono text-muted-foreground">{tag.itemCount}</td>
                <td className="py-1">
                  <div className="flex justify-end">
                    <TagActions tag={tag} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
