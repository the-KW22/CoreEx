import { getApi } from "@/lib/api/server";

import { deleteEntryForGood, emptyTrash, restoreEntry } from "./actions";

const errors: Record<string, string> = {
  restore: "Could not restore it. Try again.",
  delete: "Could not delete it. Try again.",
  empty: "Could not empty the Trash. Try again.",
  storage: "File storage is not available right now, so nothing was deleted. Try again in a moment.",
};

const kindLabel = { FOLDER: "Folder", NOTE: "Note", ASSET: "Asset" } as const;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function TrashPage({ searchParams }: PageProps<"/trash">) {
  const { error } = await searchParams;
  const api = await getApi();
  const result = await api.GET("/api/trash").catch(() => null);

  if (!result) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  if (!result.data) {
    return <p role="alert">Could not load the Trash. Try again.</p>;
  }
  const { items, total } = result.data;

  return (
    <>
      <h1>Trash</h1>
      <p>Things you move to the Trash wait here for 30 days, then they are removed for good.</p>
      {typeof error === "string" && errors[error] && <p role="alert">{errors[error]}</p>}

      {items.length === 0 ? (
        <p>The Trash is empty.</p>
      ) : (
        <>
          <table>
            <caption>Most recently deleted first</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">Removed for good in</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => {
                const name = entry.title || "Untitled";
                return (
                  <tr key={entry.id}>
                    <td>
                      {name}
                      {entry.kind === "FOLDER" && (entry.folderCount > 0 || entry.itemCount > 0) && (
                        <>
                          <br />
                          <small>
                            with {plural(entry.folderCount, "Folder", "Folders")} and{" "}
                            {plural(entry.itemCount, "Item", "Items")}
                          </small>
                        </>
                      )}
                    </td>
                    <td>{kindLabel[entry.kind]}</td>
                    <td>{plural(entry.daysRemaining, "day", "days")}</td>
                    <td className="row-actions">
                      <form action={restoreEntry}>
                        <input type="hidden" name="kind" value={entry.kind} />
                        <input type="hidden" name="id" value={entry.id} />
                        <button type="submit" aria-label={`Restore ${name}`}>
                          Restore
                        </button>
                      </form>
                      <details>
                        <summary aria-label={`Delete ${name} forever`}>Delete forever…</summary>
                        <p>
                          This removes {name}
                          {entry.kind === "FOLDER" ? " and everything deleted with it" : ""} for good. It cannot be
                          undone.
                        </p>
                        <form action={deleteEntryForGood}>
                          <input type="hidden" name="kind" value={entry.kind} />
                          <input type="hidden" name="id" value={entry.id} />
                          <button type="submit">Delete forever</button>
                        </form>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* shortcut: only the 50 most recently deleted are shown, add paging when a Trash holds more. */}
          {total > items.length && (
            <p>
              Showing the newest {items.length} of {total}.
            </p>
          )}

          <details className="delete-folder">
            <summary>Empty Trash…</summary>
            <p>This removes everything in the Trash for good, including files. It cannot be undone.</p>
            <form action={emptyTrash}>
              <button type="submit">Empty Trash</button>
            </form>
          </details>
        </>
      )}
    </>
  );
}
