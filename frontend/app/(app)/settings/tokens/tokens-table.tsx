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

import { revokeToken } from "./actions";

export type TokenRow = components["schemas"]["TokenResponse"];

const day = (iso: string) => <time dateTime={iso}>{iso.slice(0, 10)}</time>;

export function TokensTable({ tokens }: { tokens: TokenRow[] }) {
  const [, startTransition] = useTransition();

  const revoke = (token: TokenRow) =>
    startTransition(async () => {
      if (await revokeToken(token.id)) toast.success(`Revoked ${token.name}`);
      else toast.error(`Could not revoke ${token.name}. Try again.`);
    });

  return (
    <table className="w-full border-collapse text-sm max-md:block">
      <caption className="sr-only">Your Access tokens, newest first</caption>
      <thead className="text-left text-xs font-medium text-muted-foreground max-md:hidden">
        <tr className="border-b border-border">
          <th scope="col" className="py-2 pr-4 font-medium">Name</th>
          <th scope="col" className="py-2 pr-4 font-medium">Created</th>
          <th scope="col" className="py-2 pr-4 font-medium">Last used</th>
          <th scope="col" className="py-2 pr-4 font-medium">Expires</th>
          <th scope="col" className="py-2 font-medium">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody className="max-md:grid max-md:gap-2">
        {tokens.map((token) => (
          <tr
            key={token.id}
            className="border-b border-border-subtle max-md:grid max-md:gap-2 max-md:rounded-[10px] max-md:border max-md:border-border max-md:p-3"
          >
            <td className="py-2 pr-4 font-medium max-md:p-0 max-md:break-all">{token.name}</td>
            <td className="py-2 pr-4 text-muted-foreground max-md:p-0 max-md:text-xs">{day(token.createdAt)}</td>
            <td className="py-2 pr-4 text-muted-foreground max-md:p-0 max-md:text-xs">
              {token.lastUsedAt ? day(token.lastUsedAt) : "Never used"}
            </td>
            <td className="py-2 pr-4 max-md:p-0">
              {token.expired ? (
                <Badge colour="orange">Expired</Badge>
              ) : token.expiresAt ? (
                <span className="text-muted-foreground">{day(token.expiresAt)}</span>
              ) : (
                <span className="text-muted-foreground">Never</span>
              )}
            </td>
            <td className="py-1 max-md:p-0">
              <div className="flex md:justify-end">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" aria-label={`Revoke ${token.name}`}>
                      Revoke
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Revoke {token.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The Agent using it stops working at once. You can create a new Access token later.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => revoke(token)}>
                        Revoke
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
