"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";

import { revokeInvite } from "./actions";
import { CopyLinkButton } from "./copy-link-button";

type Invite = components["schemas"]["InviteResponse"];

const status = {
  PENDING: { label: "Pending", colour: "blue" },
  ACCEPTED: { label: "Accepted", colour: "green" },
  REVOKED: { label: "Revoked", colour: "gray" },
} as const;

export function InvitesTable({ invites }: { invites: Invite[] }) {
  const [pending, startTransition] = useTransition();

  const revoke = (invite: Invite) =>
    startTransition(async () => {
      if (await revokeInvite(invite.id)) toast.success(`Revoked the Invite for ${invite.email}`);
      else toast.error(`Could not revoke the Invite for ${invite.email}. Try again.`);
    });

  return (
    // The first UI's table rules (borders, margin) live in the base layer; these utilities override them.
    <table className="mt-0 w-full border-collapse text-sm max-md:block">
      <caption className="sr-only">All Invites, newest first</caption>
      <thead className="text-left text-xs font-medium text-muted-foreground max-md:hidden">
        <tr className="border-b border-border">
          <th scope="col" className="border-0 py-2 pr-4 font-medium">Email</th>
          <th scope="col" className="border-0 py-2 pr-4 font-medium">Status</th>
          <th scope="col" className="border-0 py-2 pr-4 font-medium">Created</th>
          <th scope="col" className="border-0 py-2 font-medium">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody className="max-md:grid max-md:gap-2">
        {invites.map((invite) => (
          <tr
            key={invite.id}
            className="border-b border-border-subtle max-md:grid max-md:gap-2 max-md:rounded-[10px] max-md:border max-md:border-border max-md:p-3"
          >
            <td className="border-0 py-2 pr-4 font-medium max-md:p-0 max-md:break-all">{invite.email}</td>
            <td className="border-0 py-2 pr-4 max-md:p-0">
              <Badge colour={status[invite.status].colour}>{status[invite.status].label}</Badge>
            </td>
            <td className="border-0 py-2 pr-4 text-muted-foreground max-md:p-0 max-md:text-xs">
              <time dateTime={invite.createdAt}>{invite.createdAt.slice(0, 10)}</time>
            </td>
            <td className="border-0 py-1 max-md:p-0">
              {invite.status === "PENDING" && (
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <CopyLinkButton email={invite.email} />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        aria-label={`Revoke the Invite for ${invite.email}`}
                      >
                        Revoke
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Revoke the Invite for {invite.email}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The sign-up link stops working. You can create a new Invite later.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => revoke(invite)}>
                          Revoke
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
