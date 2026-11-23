import { getApi } from "@/lib/api/server";

import { AiSettings } from "./ai-settings";

// Chat and AI (docs/DESIGN.md section 6.10): the model for the User's Chats and their own provider key.
export default async function AiSettingsPage() {
  const api = await getApi();
  const result = await api.GET("/api/ai/preferences").catch(() => null);
  if (!result) return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  if (!result.data) return <p role="alert">Could not load your Chat settings. Try again.</p>;
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <header className="grid gap-1">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Chat and AI</h1>
        <p className="text-sm text-muted-foreground">Choose the model your Chats use, and optionally use your own provider key.</p>
      </header>
      <AiSettings prefs={result.data} />
    </div>
  );
}
