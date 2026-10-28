import Link from "next/link";

import { getApi } from "@/lib/api/server";

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
    <>
      <h1>Tags</h1>
      {tags.length === 0 ? (
        <p>No Tags yet. Add one from a Note.</p>
      ) : (
        <table>
          <caption>All your Tags</caption>
          <thead>
            <tr>
              <th scope="col">Tag</th>
              <th scope="col">Items</th>
            </tr>
          </thead>
          <tbody>
            {tags.map((tag) => (
              <tr key={tag.id}>
                <td>
                  <Link href={`/tags/${tag.id}`}>{tag.name}</Link>
                </td>
                <td>{tag.itemCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
