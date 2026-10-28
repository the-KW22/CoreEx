import { redirect } from "next/navigation";

import { getApi } from "@/lib/api/server";

import { revokeInvite } from "./actions";
import { CopyLinkButton } from "./copy-link-button";
import { InviteForm } from "./invite-form";

export default async function AdminPage() {
  const api = await getApi();
  const result = await api.GET("/api/admin/invites").catch(() => null);

  if (!result) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  const { data, response } = result;
  // Not an Admin: the API says so, and the page leads back home.
  if (response.status === 403) redirect("/");
  if (!data) {
    return <p role="alert">Could not load the Invites. Try again.</p>;
  }

  return (
    <>
      <h1>Invites</h1>
      <p>CoreEx is invite-only. Create an Invite, then send the person the sign-up link.</p>
      <InviteForm />

      {data.items.length === 0 ? (
        <p>No Invites yet.</p>
      ) : (
        <table>
          <caption>All Invites, newest first</caption>
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Status</th>
              <th scope="col">Created</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((invite) => (
              <tr key={invite.id}>
                <td>{invite.email}</td>
                <td>{invite.status.toLowerCase()}</td>
                <td>{invite.createdAt.slice(0, 10)}</td>
                <td className="row-actions">
                  {invite.status === "PENDING" && (
                    <>
                      <CopyLinkButton email={invite.email} />
                      <form action={revokeInvite}>
                        <input type="hidden" name="id" value={invite.id} />
                        <button
                          type="submit"
                          aria-label={`Revoke the Invite for ${invite.email}`}
                        >
                          Revoke
                        </button>
                      </form>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {/* shortcut: shows only the newest 50 Invites, add paging controls when there are more. */}
      {data.total > data.items.length && (
        <p>
          Showing the newest {data.items.length} of {data.total} Invites.
        </p>
      )}
    </>
  );
}
