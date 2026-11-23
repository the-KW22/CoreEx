"use client";

import { useState, useTransition } from "react";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";

import { type ChatSettingsResult, saveChatSettings } from "../actions";

export type ChatSettings = {
  enabled: boolean;
  model: string;
  dailyBudgetUsd: number;
  models: { id: string; name: string; inputUsdPerMillion: number; outputUsdPerMillion: number }[];
  keyConfigured: boolean;
};

// The Admin's switch, model and budget for Chat and Career AI. It shows no Chats or spending on purpose.
export function ChatCard({ settings }: { settings: ChatSettings }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ChatSettingsResult | null>(null);

  return (
    <section aria-labelledby="chat-card-heading" className="grid gap-3 rounded-[14px] border border-border bg-surface p-4">
      <div className="grid gap-1">
        <h2 id="chat-card-heading" className="text-sm font-semibold">
          Chat
        </h2>
        <p className="text-sm text-muted-foreground">
          The Shared key pays for Chat and every Career AI action. Changes take effect at once.
        </p>
      </div>

      {!settings.keyConfigured && (
        <Alert role="status" tone="neutral">
          No Shared key is set on the server, so AI stays off whatever this switch says.
        </Alert>
      )}

      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          start(async () => setResult(await saveChatSettings(formData)));
        }}
      >
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="size-4" />
          Shared key on
        </label>

        <div className="grid gap-1.5">
          <label htmlFor="chat-model" className="text-sm font-medium">
            Model
          </label>
          <select
            id="chat-model"
            name="model"
            defaultValue={settings.model}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm sm:max-w-md"
          >
            {settings.models.map((m) => (
              <option key={m.id} value={m.id}>
                {`${m.name} ($${m.inputUsdPerMillion} in / $${m.outputUsdPerMillion} out per million tokens)`}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="chat-budget" className="text-sm font-medium">
            Daily budget per User (US dollars)
          </label>
          <input
            id="chat-budget"
            name="dailyBudgetUsd"
            type="number"
            step={0.01}
            min={0}
            max={100}
            required
            defaultValue={settings.dailyBudgetUsd}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm sm:max-w-40"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            Save settings
          </Button>
          {result &&
            ("ok" in result ? (
              <p role="status" className="text-sm">
                Saved
              </p>
            ) : (
              <p role="alert" className="text-sm text-destructive">
                {result.error}
              </p>
            ))}
        </div>
      </form>
    </section>
  );
}
