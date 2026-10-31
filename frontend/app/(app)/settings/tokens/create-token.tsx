"use client";

import { CheckIcon, CopyIcon, KeyRoundIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { createToken } from "./actions";

const EXPIRY = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
  { value: "never", label: "Never" },
];

function CopySecret({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      toast.success("Copied the Access token");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this Access token:", secret);
    }
  }

  const Icon = copied ? CheckIcon : CopyIcon;
  return (
    <Button type="button" variant="outline" onClick={copy}>
      <Icon aria-hidden />
      {copied ? "Copied" : "Copy token"}
    </Button>
  );
}

// Remounted every time the dialog opens, so a finished or failed attempt never leaks into the next one.
function CreateForm({ close }: { close: () => void }) {
  const [state, action, pending] = useActionState(createToken, undefined);
  const [expiry, setExpiry] = useState("90");

  if (state?.secret) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Copy your Access token</DialogTitle>
          <DialogDescription>
            This is the only time {state.name} is shown. Anyone with it can read and change your knowledge base, so
            keep it secret.
          </DialogDescription>
        </DialogHeader>
        <input
          readOnly
          aria-label="Access token"
          value={state.secret}
          onFocus={(e) => e.currentTarget.select()}
          className="h-9 w-full rounded-lg border border-border bg-surface px-3 font-mono text-sm"
        />
        <DialogFooter>
          <CopySecret secret={state.secret} />
          <Button type="button" onClick={close}>
            Done
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <form action={action} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>New Access token</DialogTitle>
        <DialogDescription>
          An Agent such as Claude Code or Codex uses it to work with your knowledge base.
        </DialogDescription>
      </DialogHeader>
      <label className="grid gap-1.5 text-sm font-medium">
        Name
        <input
          name="name"
          required
          maxLength={60}
          autoComplete="off"
          placeholder="Claude Code laptop"
          aria-describedby={state?.error ? "token-error" : undefined}
          className="h-9 rounded-lg border border-border bg-surface px-3 font-normal"
        />
      </label>
      <div className="grid gap-1.5 text-sm font-medium">
        <span id="token-expiry">Expires after</span>
        <input type="hidden" name="expiry" value={expiry} />
        <Select value={expiry} onValueChange={setExpiry}>
          <SelectTrigger aria-labelledby="token-expiry">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXPIRY.map((e) => (
              <SelectItem key={e.value} value={e.value}>
                {e.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {state?.error && (
        <p id="token-error" role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          Create token
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CreateToken() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <KeyRoundIcon aria-hidden />
          New Access token
        </Button>
      </DialogTrigger>
      <DialogContent>{open && <CreateForm close={() => setOpen(false)} />}</DialogContent>
    </Dialog>
  );
}
