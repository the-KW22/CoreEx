"use client";

import { KeyRoundIcon } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";

import { type KeyState, removeKey, saveKey, saveModel } from "./actions";

type Prefs = components["schemas"]["Preferences"];

const select = "h-9 w-full max-w-md rounded-lg border border-border bg-surface px-2 text-sm font-normal";

// Remounted for every attempt: the typed key is never kept once it is sent.
function KeyForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(async (previous: KeyState, formData: FormData) => {
    const next = await saveKey(previous, formData);
    if (next?.saved) {
      toast.success("Saved your key");
      onDone();
    }
    return next;
  }, undefined);
  return (
    <form action={action} className="grid max-w-md gap-3">
      <label className="grid gap-1.5 text-sm font-medium">
        Anthropic API key
        <input
          type="password"
          name="key"
          autoComplete="off"
          spellCheck={false}
          maxLength={400}
          required
          className="h-9 rounded-lg border border-border bg-surface px-3 font-mono text-sm font-normal"
        />
      </label>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Checking…" : "Save key"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function AiSettings({ prefs }: { prefs: Prefs }) {
  const [model, setModel] = useState(prefs.model);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [, startTransition] = useTransition();
  const chosen = prefs.models.find((m) => m.id === model);

  return (
    <>
      <section aria-labelledby="model-heading" className="grid gap-3 rounded-[14px] border border-border p-4">
        <h2 id="model-heading" className="font-semibold">
          Model
        </h2>
        <label className="grid gap-1.5 text-sm font-medium">
          Model for your Chats
          <select
            className={select}
            value={model}
            onChange={(e) => {
              const next = e.target.value;
              const before = model;
              setModel(next);
              startTransition(async () => {
                if (await saveModel(next)) toast.success("Saved the model");
                else {
                  setModel(before);
                  toast.error("Could not save the model. Try again.");
                }
              });
            }}
          >
            {prefs.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {chosen && (
          <p className="text-sm text-muted-foreground">
            ${chosen.inputUsdPerMillion} in and ${chosen.outputUsdPerMillion} out per million tokens. A cheaper model makes your Daily budget last longer.
          </p>
        )}
      </section>

      <section aria-labelledby="key-heading" className="grid gap-3 rounded-[14px] border border-border p-4">
        <h2 id="key-heading" className="font-semibold">
          Your own key
        </h2>
        <p className="text-sm text-muted-foreground">
          With your own key, every Chat turn uses it instead of the Shared key. Anthropic bills it to you, it does not count toward your Daily budget, and it keeps working
          when the Shared key is switched off. Without one, Chat uses the Shared key and its budget. The key is stored encrypted and is never shown again: only its last 4
          characters are.
        </p>
        {!prefs.keysAvailable && (
          <p role="status" className="text-sm text-muted-foreground">
            This CoreEx cannot store keys yet: the person running it has not set the encryption secret.
          </p>
        )}
        {prefs.key && !editing && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-2 text-sm">
              <KeyRoundIcon aria-hidden className="size-4" /> Anthropic key ending in <span className="font-mono">{prefs.key.last4}</span>
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
              Replace key
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
              Remove key
            </Button>
          </div>
        )}
        {(editing || (!prefs.key && prefs.keysAvailable)) && <KeyForm onDone={() => setEditing(false)} />}
      </section>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent className="border-border bg-popover sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove your key?</AlertDialogTitle>
            <AlertDialogDescription>The key is deleted. Chat goes back to the Shared key and its Daily budget.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                startTransition(async () => {
                  if (await removeKey()) toast.success("Removed your key");
                  else toast.error("Could not remove the key. Try again.");
                })
              }
            >
              Remove key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
