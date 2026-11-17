import { Alert } from "@/components/alert";
import { getApi } from "@/lib/api/server";

import { Facts } from "./facts";
import { PreferencesForm } from "./preferences";
import { Stories } from "./stories";

// Knowledge (docs/career/career-features-decisions.md C2, C5, C13): the Facts the AI may use, the Stories and the
// Preferences. Sources for pulling Facts are the User's Resumes and Notes.
export default async function KnowledgePage() {
  const api = await getApi();
  const [facts, stories, prefs, resumes, notes] = await Promise.all([
    api.GET("/api/knowledge/facts").catch(() => null),
    api.GET("/api/knowledge/stories").catch(() => null),
    api.GET("/api/knowledge/preferences").catch(() => null),
    api.GET("/api/resumes", { params: { query: { size: 100 } } }).catch(() => null),
    // shortcut: the pull picker lists only the 100 newest Notes, upgrade to a search box when a User has more.
    api.GET("/api/items", { params: { query: { type: "NOTE", size: 100 } } }).catch(() => null),
  ]);

  if (!facts?.data || !prefs?.data) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  return (
    <div className="mx-auto grid max-w-4xl gap-10">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">Knowledge</h1>
        <p className="text-sm text-muted-foreground">What the AI may say about you. It uses only Facts you keep, Stories and your own documents.</p>
      </header>
      <Facts
        facts={facts.data}
        sources={{
          resumes: resumes?.data?.items ?? [],
          notes: notes?.data?.items.map((n) => ({ id: n.id, title: n.title })) ?? [],
        }}
      />
      {stories ? <Stories stories={(stories?.data ?? []).map((s) => ({ id: s.id ?? "", title: s.title ?? "" }))} /> : <Alert>Could not load your Stories. Reload to try again.</Alert>}
      <PreferencesForm prefs={prefs.data} />
    </div>
  );
}
