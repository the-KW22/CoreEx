import Link from "next/link";

import { getApi } from "@/lib/api/server";

import { createNote } from "./notes/actions";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { failed } = await searchParams;
  const api = await getApi();
  const result = await api.GET("/api/items").catch(() => null);

  if (!result) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  const { data } = result;

  return (
    <>
      <h1>Your knowledge base</h1>
      <form action={createNote} className="new-note">
        <button type="submit">New Note</button>
      </form>
      {failed === "create" && <p role="alert">Could not create the Note. Try again.</p>}

      {!data ? (
        <p role="alert">Could not load your Items. Try again.</p>
      ) : data.items.length === 0 ? (
        <p>Nothing here yet. Create your first Note.</p>
      ) : (
        <>
          <table>
            <caption>Most recently updated first</caption>
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/notes/${item.id}`}>{item.title || "Untitled"}</Link>
                  </td>
                  <td>{item.updatedAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* shortcut: only the newest 50 Items are shown, add paging when someone has more. */}
          {data.total > data.items.length && (
            <p>
              Showing the newest {data.items.length} of {data.total}.
            </p>
          )}
        </>
      )}
    </>
  );
}
