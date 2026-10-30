"use client";

import { useState, useTransition } from "react";
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
import { formatBytes } from "@/lib/items";
import { relativeTime } from "@/lib/time";

import { removeUser, setDisabled, setQuota, resetQuota } from "./actions";

type User = components["schemas"]["UserResponse"];

const MIB = 1024 * 1024;

const QUOTA_ERROR = "Could not change the quota. Enter a whole number of megabytes from 0 to about 950,000.";

// The storage quota as an Input Group: a number with an "MB" suffix, and Save.
function QuotaForm({ user }: { user: User }) {
  const [pending, startTransition] = useTransition();
  // What the Admin has typed, or null: the box then follows the quota the server has.
  const [draft, setDraft] = useState<string | null>(null);
  const megabytes = draft ?? String(Math.round(user.storageQuotaBytes / MIB));

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      if (await setQuota(user.id, Number(megabytes))) {
        setDraft(null);
        toast.success(`Quota saved for ${user.email}`);
      } else toast.error(QUOTA_ERROR);
    });
  };
  const reset = () =>
    startTransition(async () => {
      if (await resetQuota(user.id)) {
        setDraft(null);
        toast.success(`${user.email} uses the default quota`);
      } else toast.error(QUOTA_ERROR);
    });

  return (
    <div className="grid gap-1">
      <form onSubmit={save} className="flex items-center gap-2">
        <div className="flex h-8 items-center overflow-hidden rounded-lg border border-border bg-surface focus-within:ring-2 focus-within:ring-ring">
          <input
            type="number"
            min={0}
            step={1}
            required
            value={megabytes}
            onChange={(event) => setDraft(event.target.value)}
            aria-label={`Quota in megabytes for ${user.email}`}
            className="h-full w-24 bg-transparent px-2 font-mono text-sm outline-none"
          />
          <span aria-hidden className="border-l border-border px-2 text-xs text-muted-foreground">
            MB
          </span>
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={pending} aria-label={`Save the quota for ${user.email}`}>
          Save
        </Button>
      </form>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        {user.customQuota ? "Custom quota" : "Default quota"}
        {user.customQuota && (
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            aria-label={`Use the default quota for ${user.email}`}
            className="text-link underline-offset-4 hover:underline"
          >
            Use default
          </button>
        )}
      </p>
    </div>
  );
}

function Confirm({
  trigger,
  label,
  title,
  description,
  action,
  onConfirm,
  disabled,
  destructive = true,
}: {
  trigger: string;
  label: string;
  title: string;
  description: string;
  action: string;
  onConfirm: () => void;
  disabled: boolean;
  destructive?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} aria-label={label}>
          {trigger}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant={destructive ? "destructive" : "default"} onClick={onConfirm}>
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Stacked cards on phones, like All Items.
export function UsersTable({ users, meId, now }: { users: User[]; meId?: string; now: number | null }) {
  const [pending, startTransition] = useTransition();

  const toggle = (user: User) => {
    const disable = user.status === "ACTIVE";
    startTransition(async () => {
      const result = await setDisabled(user.id, disable);
      if (result === "ok") toast.success(`${disable ? "Disabled" : "Enabled"} ${user.email}`);
      else toast.error(result === "self" ? "You cannot disable your own account." : "Could not change that account. Try again.");
    });
  };
  const remove = (user: User) =>
    startTransition(async () => {
      const result = await removeUser(user.id);
      if (result === "ok") toast.success(`Removed ${user.email}`);
      else
        toast.error(
          result === "admin"
            ? "An Admin cannot be removed. Disable the account instead."
            : "Removal is not finished. The person is disabled; press Remove again to finish.",
        );
    });

  return (
    // The first UI's table rules (borders, margin) live in the base layer; these utilities override them.
    <table className="mt-0 w-full border-collapse text-sm max-lg:block">
      <caption className="sr-only">All Users, newest sign-up first</caption>
      <thead className="text-left text-xs font-medium text-muted-foreground max-lg:hidden">
        <tr className="border-b border-border">
          <th scope="col" className="border-0 py-2 pr-4 font-medium">User</th>
          <th scope="col" className="border-0 py-2 pr-4 font-medium">Activity</th>
          <th scope="col" className="border-0 py-2 pr-4 font-medium">Items</th>
          <th scope="col" className="border-0 py-2 pr-4 font-medium">Storage and quota</th>
          <th scope="col" className="border-0 py-2 font-medium">Account</th>
        </tr>
      </thead>
      <tbody className="max-lg:grid max-lg:gap-3">
        {users.map((user) => {
          const yourself = user.id === meId;
          // A quota of 0 with files still stored is full, not empty.
          const percent =
            user.storageQuotaBytes > 0
              ? Math.round((user.storageUsedBytes / user.storageQuotaBytes) * 100)
              : user.storageUsedBytes > 0
                ? 100
                : 0;
          return (
            <tr
              key={user.id}
              className="border-b border-border-subtle align-top max-lg:grid max-lg:gap-3 max-lg:rounded-[10px] max-lg:border max-lg:border-border max-lg:p-3"
            >
              <td className="border-0 py-3 pr-4 max-lg:p-0">
                <p className="break-all font-medium">{user.email}</p>
                <p className="mt-1 flex flex-wrap gap-1">
                  <Badge colour={user.status === "ACTIVE" ? "green" : "gray"}>
                    {user.status === "ACTIVE" ? "Active" : "Disabled"}
                  </Badge>
                  {user.role === "ADMIN" && <Badge colour="teal">Admin</Badge>}
                  {yourself && <Badge>You</Badge>}
                </p>
              </td>
              <td className="border-0 py-3 pr-4 text-xs text-muted-foreground max-lg:p-0">
                <p>
                  Signed up <time dateTime={user.createdAt}>{user.createdAt.slice(0, 10)}</time>
                </p>
                <p>
                  {user.lastActiveAt
                    ? now === null
                      ? `Active ${user.lastActiveAt.slice(0, 10)}`
                      : `Active ${relativeTime(user.lastActiveAt, now)}`
                    : "Never active"}
                </p>
              </td>
              <td className="border-0 py-3 pr-4 font-mono max-lg:p-0">
                <span className="lg:hidden text-xs text-muted-foreground font-sans">Items </span>
                {user.itemCount}
              </td>
              <td className="border-0 py-3 pr-4 max-lg:p-0">
                <div className="grid gap-2">
                  <div className="grid gap-1">
                    <div
                      role="progressbar"
                      aria-label={`Storage used by ${user.email}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.min(percent, 100)}
                      className="h-1.5 w-48 max-w-full overflow-hidden rounded-full bg-border"
                    >
                      <div
                        className={`h-full rounded-full ${percent >= 90 ? "bg-destructive" : "bg-link"}`}
                        style={{ width: `${Math.min(percent, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(user.storageUsedBytes)} of {formatBytes(user.storageQuotaBytes)} ({percent}%)
                    </p>
                  </div>
                  <QuotaForm user={user} />
                </div>
              </td>
              <td className="border-0 py-3 max-lg:p-0">
                {yourself ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Confirm
                      trigger={user.status === "ACTIVE" ? "Disable" : "Enable"}
                      label={`${user.status === "ACTIVE" ? "Disable" : "Enable"} ${user.email}`}
                      title={`${user.status === "ACTIVE" ? "Disable" : "Enable"} ${user.email}?`}
                      description={
                        user.status === "ACTIVE"
                          ? "They are signed out and cannot sign in until you enable the account again. Their Notes and files are kept."
                          : "They can sign in again and use CoreEx as before."
                      }
                      action={user.status === "ACTIVE" ? "Disable" : "Enable"}
                      destructive={user.status === "ACTIVE"}
                      disabled={pending}
                      onConfirm={() => toggle(user)}
                    />
                    {user.role !== "ADMIN" && (
                      <Confirm
                        trigger="Remove"
                        label={`Remove ${user.email}`}
                        title={`Remove ${user.email}?`}
                        description={`This deletes ${user.email}'s Notes, files and sign-in for good. It cannot be undone. Their email can be invited again afterwards.`}
                        action="Remove for good"
                        disabled={pending}
                        onConfirm={() => remove(user)}
                      />
                    )}
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
