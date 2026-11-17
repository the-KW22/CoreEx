import Link from "next/link";

import type { components } from "@/lib/api/schema";
import { getApi, timezoneCookie } from "@/lib/api/server";
import { formatLocal } from "@/lib/applications";

import { BriefingActions } from "./today-briefing";

type Entry = components["schemas"]["EntryResponse"];

// Today (career-features-decisions.md C4): what needs the User now and what is coming up. Worked out when the page opens.
export default async function CareerTodayPage() {
  const api = await getApi();
  const today = await api.GET("/api/career/today").catch(() => null);
  if (!today?.data) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  const { needsYou, comingUp } = today.data;
  const zone = await timezoneCookie();

  // The "Sends:" line is the same for every task of the Library, so one Application's results give it.
  const within = [...needsYou, ...comingUp].find((e) => e.withinDay && e.interviewSeq !== null);
  const results = within ? await api.GET("/api/applications/{id}/career/results", { params: { path: { id: within.applicationId } } }).catch(() => null) : null;
  const sends = results?.data?.sends.PREP;

  return (
    <div className="mx-auto grid max-w-3xl gap-10">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="text-sm text-muted-foreground">What needs you now, and what is coming up across your Applications.</p>
      </header>
      <EntryList id="needs-you" title="Needs you" empty="Nothing needs you right now." entries={needsYou} zone={zone} sends={sends} />
      <EntryList id="coming-up" title="Coming up" empty="Nothing coming up." entries={comingUp} zone={zone} sends={sends} />
    </div>
  );
}

function EntryList({
  id,
  title,
  empty,
  entries,
  zone,
  sends,
}: {
  id: string;
  title: string;
  empty: string;
  entries: Entry[];
  zone: string | undefined;
  sends: string | undefined;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="grid gap-3">
      <h2 id={`${id}-heading`} className="text-lg font-semibold">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="grid gap-3">
          {entries.map((entry, index) => (
            <EntryRow key={index} entry={entry} zone={zone} sends={sends} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EntryRow({ entry, zone, sends }: { entry: Entry; zone: string | undefined; sends: string | undefined }) {
  // An interview's label already has its time, and an offer deadline is a day with no time.
  const at = entry.at && entry.interviewSeq === null && entry.kind !== "OFFER_DEADLINE" ? formatLocal(entry.at, zone ?? "UTC") : null;
  // Before the tz cookie exists the API works in UTC too, so the page does the same.
  const seq = entry.withinDay ? entry.interviewSeq : null;
  return (
    <li className="grid gap-2 rounded-lg border border-border p-3">
      <div className="grid gap-0.5">
        <Link href={`/career/applications/${entry.applicationId}`} className="font-medium underline">
          {entry.title}
        </Link>
        <p className="text-sm">
          {entry.label}
          {at && <span className="text-muted-foreground"> · {at}</span>}
        </p>
      </div>
      {seq !== null && sends !== undefined && <BriefingActions applicationId={entry.applicationId} interviewSeq={seq} sends={sends} />}
    </li>
  );
}
