"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";

import { dismissAccessRequest, inviteAccessRequest } from "./actions";

type AccessRequest = components["schemas"]["AccessRequestResponse"];

// The open Access requests: the email and the date, and the two things an Admin can do with one.
export function AccessRequestsTable({ requests }: { requests: AccessRequest[] }) {
  const [pending, startTransition] = useTransition();

  const act = (request: AccessRequest, run: typeof inviteAccessRequest, done: string, failed: string) =>
    startTransition(async () => {
      const error = await run(request.id);
      if (error) toast.error(error || failed);
      else toast.success(`${done} ${request.email}`);
    });

  return (
    <table className="w-full border-collapse text-sm max-md:block">
      <caption className="sr-only">Open Access requests, newest first</caption>
      <thead className="text-left text-xs font-medium text-muted-foreground max-md:hidden">
        <tr className="border-b border-border">
          <th scope="col" className="py-2 pr-4 font-medium">Email</th>
          <th scope="col" className="py-2 pr-4 font-medium">Asked</th>
          <th scope="col" className="py-2 font-medium">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody className="max-md:grid max-md:gap-2">
        {requests.map((request) => (
          <tr
            key={request.id}
            className="border-b border-border-subtle max-md:grid max-md:gap-2 max-md:rounded-[10px] max-md:border max-md:border-border max-md:p-3"
          >
            <td className="py-2 pr-4 font-medium max-md:p-0 max-md:break-all">{request.email}</td>
            <td className="py-2 pr-4 text-muted-foreground max-md:p-0 max-md:text-xs">
              <time dateTime={request.createdAt}>{request.createdAt.slice(0, 10)}</time>
            </td>
            <td className="py-1 max-md:p-0">
              <div className="flex flex-wrap gap-2 md:justify-end">
                <Button
                  size="sm"
                  disabled={pending}
                  aria-label={`Invite ${request.email}`}
                  onClick={() => act(request, inviteAccessRequest, "Invited", "Could not invite")}
                >
                  Invite
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  aria-label={`Dismiss the request from ${request.email}`}
                  onClick={() => act(request, dismissAccessRequest, "Dismissed the request from", "Could not dismiss")}
                >
                  Dismiss
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
